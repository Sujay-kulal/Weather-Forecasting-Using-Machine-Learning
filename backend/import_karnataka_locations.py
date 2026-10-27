"""Resumable Karnataka district/populated-place weather archive import.

The import is deliberately limited to one Open-Meteo free-tier daily budget.
Each 14-day/coordinate unit is counted toward the 9,000-unit default, leaving
headroom below the provider's 10,000 daily API-call-unit ceiling. Re-run the
command on later days to continue; per-location/date-window checkpoints make
retries safe and prevent already completed archive windows from being fetched
again.

Schema migration must be applied first. The command is read-only unless
``--apply`` is specified.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date as date_type, datetime, timedelta, timezone
import io
import json
import logging
import math
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import zipfile
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models import WeatherData, WeatherImportBatch, WeatherLocationMetadata


logger = logging.getLogger("import_karnataka_locations")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

GEONAMES_URL = "https://download.geonames.org/export/dump/IN.zip"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
STATE_NAME = "Karnataka"
STATE_GEONAMES_ADMIN1 = "19"
WEATHER_SOURCE = "Open-Meteo Historical Weather API (reanalysis)"
WEATHER_SOURCE_URL = "https://open-meteo.com/en/docs/historical-weather-api"
CATALOG_SOURCE = "GeoNames"
CATALOG_LICENSE = "CC BY 3.0"
WEATHER_LICENSE = "CC BY 4.0"
DAILY_VARIABLES = (
    "temperature_2m_max,temperature_2m_min,temperature_2m_mean,"
    "precipitation_sum,relative_humidity_2m_mean"
)
REQUEST_TIMEOUT_SECONDS = 60
COORDINATE_BATCH_SIZE = 100
ROWS_PER_UPSERT = 2000
MAX_FREE_DAILY_UNITS = 10_000
DEFAULT_DAILY_BUDGET = 9_000
MAX_FREE_HOURLY_UNITS = 5_000
DEFAULT_HOURLY_BUDGET = 3_000
WINDOW_DAYS = 14


class ImportFailure(RuntimeError):
    """A safe-to-resume failure while retrieving or validating archive data."""


def _download_geonames_catalog() -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Read the official GeoNames country dump without writing it to disk."""
    request = Request(GEONAMES_URL, headers={"User-Agent": "WeatherForecastingIndia/1.0"})
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            archive_bytes = response.read()
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise ImportFailure("GeoNames location catalog is temporarily unavailable.") from exc

    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            raw_rows = archive.read("IN.txt").decode("utf-8").splitlines()
    except (KeyError, zipfile.BadZipFile, UnicodeDecodeError) as exc:
        raise ImportFailure("GeoNames returned an invalid India catalog file.") from exc

    fields = [row.split("\t") for row in raw_rows]
    state_districts = {
        row[0]: {
            "id": row[0],
            "name": row[1].strip() or row[2].strip(),
            "ascii_name": row[2].strip(),
            "latitude": float(row[4]),
            "longitude": float(row[5]),
            "feature_code": row[7],
            "admin2_code": row[11],
        }
        for row in fields
        if len(row) > 11
        and row[8] == "IN"
        and row[10] == STATE_GEONAMES_ADMIN1
        and row[6] == "A"
        and row[7] == "ADM2"
    }
    if len(state_districts) != 31:
        raise ImportFailure(
            f"Expected 31 GeoNames Karnataka districts, found {len(state_districts)}. "
            "Review the catalog before importing."
        )

    districts_by_admin2_code = {
        district["admin2_code"]: district
        for district in state_districts.values()
        if district["admin2_code"]
    }
    locations: list[dict[str, Any]] = []
    for row in fields:
        if (
            len(row) <= 14
            or row[8] != "IN"
            or row[10] != STATE_GEONAMES_ADMIN1
            or row[6] != "P"
        ):
            continue
        try:
            population = int(row[14] or 0)
            latitude = float(row[4])
            longitude = float(row[5])
        except (TypeError, ValueError):
            continue
        if population <= 0 or not (math.isfinite(latitude) and math.isfinite(longitude)):
            continue
        # The current GeoNames dump incorrectly tags Goa's Canacona (ID
        # 6697165) as Karnataka and supplies no district. Exclude that
        # out-of-state record rather than importing a false Karnataka series.
        if row[0] == "6697165":
            continue
        district = districts_by_admin2_code.get(row[11])
        # Murudeshwara's GeoNames record omits ADM2 even though it is in
        # Uttara Kannada. Assign the existing GeoNames district identity.
        if district is None and row[0] == "6941937":
            district = districts_by_admin2_code.get("563")
        if district is None:
            # Keep only populated places whose district identity is available.
            continue

        name = row[1].strip()
        if not name or len(name) > 100:
            raise ImportFailure(f"Unsupported place name in GeoNames record {row[0]!r}.")
        locations.append({
            "record_id": row[0],
            "name": name,
            "district_id": row[11],
            "district": district["name"],
            "latitude": latitude,
            "longitude": longitude,
            "feature_code": row[7],
            "population": population,
        })

    # Verify that WeatherData's current identity key can represent every
    # included city/place without collapsing duplicate names in one district.
    unique_keys = {(item["district_id"], item["name"].casefold()) for item in locations}
    if len(unique_keys) != len(locations):
        raise ImportFailure(
            "GeoNames contains duplicate populated-place names within a district; "
            "the current weather_data key cannot safely represent them."
        )

    for district in state_districts.values():
        locations.append({
            "record_id": district["id"],
            "name": "",
            "district_id": district["id"],
            "district": district["name"],
            "latitude": district["latitude"],
            "longitude": district["longitude"],
            "feature_code": district["feature_code"],
            "population": None,
        })

    # Stable catalog order is essential for deterministic progress batches.
    locations.sort(key=lambda item: (item["district"].casefold(), item["name"].casefold(), item["record_id"]))
    return locations, state_districts


def _add_location_metadata(session, locations: list[dict[str, Any]]) -> dict[str, int]:
    """Insert catalog metadata once and return GeoNames ID -> DB metadata ID."""
    existing = {
        row.catalog_record_id: row
        for row in session.execute(
            select(WeatherLocationMetadata).where(
                WeatherLocationMetadata.catalog_source == CATALOG_SOURCE,
                WeatherLocationMetadata.state == STATE_NAME,
            )
        ).scalars().all()
    }

    for item in locations:
        record_id = str(item["record_id"])
        if record_id in existing:
            row = existing[record_id]
            if (
                row.district != item["district"]
                or row.location != item["name"]
                or abs(row.latitude - item["latitude"]) > 0.00001
                or abs(row.longitude - item["longitude"]) > 0.00001
            ):
                raise ImportFailure(
                    f"GeoNames identity {record_id} changed location metadata; "
                    "refusing to overwrite imported provenance."
                )
            continue

        existing[record_id] = WeatherLocationMetadata(
            state=STATE_NAME,
            district=item["district"],
            location=item["name"],
            catalog_source=CATALOG_SOURCE,
            catalog_record_id=record_id,
            feature_code=item["feature_code"],
            population=item["population"],
            latitude=item["latitude"],
            longitude=item["longitude"],
            catalog_license=CATALOG_LICENSE,
            weather_source=WEATHER_SOURCE,
            weather_source_url=WEATHER_SOURCE_URL,
            weather_license=WEATHER_LICENSE,
        )

    session.add_all([row for row in existing.values() if row.id is None])
    session.commit()
    return {
        record_id: row.id
        for record_id, row in existing.items()
        if row.id is not None
    }


def _fetch_archive(locations: list[dict[str, Any]], start: date_type, end: date_type) -> list[dict[str, Any]]:
    """Fetch one date window for a coordinate batch, validating all arrays."""
    params = {
        "latitude": ",".join(str(item["latitude"]) for item in locations),
        "longitude": ",".join(str(item["longitude"]) for item in locations),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": DAILY_VARIABLES,
        "timezone": "Asia/Kolkata",
    }
    request = Request(
        f"{ARCHIVE_URL}?{urlencode(params)}",
        headers={"User-Agent": "WeatherForecastingIndia/1.0"},
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise ImportFailure(
            f"Open-Meteo archive request failed for {start} to {end}; "
            "completed batches remain saved and this stage can be resumed."
        ) from exc

    responses = payload if isinstance(payload, list) else [payload]
    if len(responses) != len(locations):
        raise ImportFailure("Open-Meteo returned a different number of locations than requested.")

    for response in responses:
        if not isinstance(response, dict) or not isinstance(response.get("daily"), dict):
            raise ImportFailure("Open-Meteo returned an invalid daily archive response.")
        daily = response["daily"]
        dates = daily.get("time")
        if not isinstance(dates, list):
            raise ImportFailure("Open-Meteo archive response omitted daily dates.")
        for field in (
            "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
            "precipitation_sum", "relative_humidity_2m_mean",
        ):
            values = daily.get(field)
            if not isinstance(values, list) or len(values) != len(dates):
                raise ImportFailure(f"Open-Meteo returned incomplete {field} arrays.")
    return responses


def _weather_rows(item: dict[str, Any], response: dict[str, Any]) -> list[dict[str, Any]]:
    daily = response["daily"]
    records: list[dict[str, Any]] = []
    for index, date_text in enumerate(daily["time"]):
        values = [
            daily["temperature_2m_max"][index],
            daily["temperature_2m_min"][index],
            daily["temperature_2m_mean"][index],
            daily["precipitation_sum"][index],
            daily["relative_humidity_2m_mean"][index],
        ]
        if any(value is None for value in values):
            continue
        numeric = [float(value) for value in values]
        if not all(math.isfinite(value) for value in numeric):
            continue
        records.append({
            "date": date_type.fromisoformat(date_text),
            "state": STATE_NAME,
            "district": item["district"],
            "location": item["name"],
            "temp_max": numeric[0],
            "temp_min": numeric[1],
            "temp_avg": numeric[2],
            "rainfall": numeric[3],
            "humidity": numeric[4],
        })
    return records


def _save_location_window(
    session,
    item: dict[str, Any],
    metadata_id: int,
    response: dict[str, Any],
    start: date_type,
    end: date_type,
) -> int:
    records = _weather_rows(item, response)
    for offset in range(0, len(records), ROWS_PER_UPSERT):
        batch = records[offset:offset + ROWS_PER_UPSERT]
        if not batch:
            continue
        statement = pg_insert(WeatherData).values(batch)
        session.execute(statement.on_conflict_do_update(
            constraint="uq_weather_state_dist_loc_date",
            set_={
                "temp_max": statement.excluded.temp_max,
                "temp_min": statement.excluded.temp_min,
                "temp_avg": statement.excluded.temp_avg,
                "humidity": statement.excluded.humidity,
                "rainfall": statement.excluded.rainfall,
            },
        ))

    session.add(WeatherImportBatch(
        location_metadata_id=metadata_id,
        start_date=start,
        end_date=end,
        row_count=len(records),
    ))
    session.execute(
        update(WeatherLocationMetadata)
        .where(WeatherLocationMetadata.id == metadata_id)
        .values(
            imported_start_date=func.least(
                func.coalesce(WeatherLocationMetadata.imported_start_date, start), start
            ),
            imported_end_date=func.greatest(
                func.coalesce(WeatherLocationMetadata.imported_end_date, end), end
            ),
        )
    )
    return len(records)


def _date_windows(start: date_type, end: date_type):
    cursor = start
    while cursor <= end:
        window_end = min(cursor + timedelta(days=WINDOW_DAYS - 1), end)
        yield cursor, window_end
        cursor = window_end + timedelta(days=1)


def run_import_stage(
    *,
    apply: bool,
    start_date: date_type = date_type(2015, 1, 1),
    end_date: date_type | None = None,
    daily_budget: int = DEFAULT_DAILY_BUDGET,
    hourly_budget: int = DEFAULT_HOURLY_BUDGET,
) -> dict[str, Any]:
    """Inspect the plan or import at most one reserved free-tier daily budget."""
    if not 1 <= daily_budget <= DEFAULT_DAILY_BUDGET:
        raise ValueError(f"daily_budget must be between 1 and {DEFAULT_DAILY_BUDGET} units")
    if not 1 <= hourly_budget <= DEFAULT_HOURLY_BUDGET:
        raise ValueError(f"hourly_budget must be between 1 and {DEFAULT_HOURLY_BUDGET} units")
    latest_archive_date = datetime.now(ZoneInfo("Asia/Kolkata")).date() - timedelta(days=5)
    final_date = min(end_date or latest_archive_date, latest_archive_date)
    if start_date > final_date:
        raise ValueError(f"start_date {start_date} is after latest archive date {final_date}")

    locations, _districts = _download_geonames_catalog()
    windows = list(_date_windows(start_date, final_date))
    # Every generated window is no longer than WINDOW_DAYS, so each coordinate
    # consumes exactly one Open-Meteo archive API call unit per window.
    total_units = len(locations) * len(windows)
    summary = {
        "locations": len(locations),
        "districts": 31,
        "populated_places": len(locations) - 31,
        "excluded_out_of_state_catalog_records": 1,
        "start_date": start_date.isoformat(),
        "end_date": final_date.isoformat(),
        "date_windows": len(windows),
        "estimated_total_api_units": total_units,
        "daily_api_unit_budget": daily_budget,
        "hourly_api_unit_budget": hourly_budget,
        "provider_hourly_api_unit_limit": MAX_FREE_HOURLY_UNITS,
        "estimated_stages": math.ceil(total_units / daily_budget),
        "applied": apply,
    }
    if not apply:
        return summary

    total_rows = 0
    used_units = 0
    used_hour_units = 0
    hour_started_at = time.monotonic()
    completed_batches = 0
    stop_for_budget = False

    with SessionLocal() as session:
        # This import requires the explicitly applied schema migration; it
        # never creates or alters tables during normal execution.
        metadata_ids = _add_location_metadata(session, locations)

        for window_start, window_end in windows:
            window_metadata_ids = [
                metadata_ids[str(item["record_id"])] for item in locations
            ]
            completed_ids = set(session.execute(
                select(WeatherImportBatch.location_metadata_id).where(
                    WeatherImportBatch.location_metadata_id.in_(window_metadata_ids),
                    WeatherImportBatch.start_date == window_start,
                    WeatherImportBatch.end_date == window_end,
                )
            ).scalars().all())
            for offset in range(0, len(locations), COORDINATE_BATCH_SIZE):
                location_batch = locations[offset:offset + COORDINATE_BATCH_SIZE]
                pending = [
                    (item, metadata_ids[str(item["record_id"])])
                    for item in location_batch
                    if metadata_ids[str(item["record_id"])] not in completed_ids
                ]

                if not pending:
                    continue
                unit_cost = len(pending)
                if used_units + unit_cost > daily_budget:
                    stop_for_budget = True
                    break

                if used_hour_units + unit_cost > hourly_budget:
                    wait_seconds = max(0.0, 3600 - (time.monotonic() - hour_started_at))
                    logger.info(
                        "Hourly unit budget reached (%d/%d); waiting %.0f seconds before resuming",
                        used_hour_units, hourly_budget, wait_seconds,
                    )
                    time.sleep(wait_seconds)
                    used_hour_units = 0
                    hour_started_at = time.monotonic()

                # Count the request before sending. If transport fails, this
                # invocation still reserves the possible upstream call units.
                used_units += unit_cost
                used_hour_units += unit_cost
                pending_locations = [item for item, _ in pending]
                responses = _fetch_archive(pending_locations, window_start, window_end)
                for (item, metadata_id), response in zip(pending, responses):
                    total_rows += _save_location_window(
                        session, item, metadata_id, response, window_start, window_end
                    )
                    completed_batches += 1
                session.commit()
                logger.info(
                    "Saved %d locations for %s through %s (%d/%d daily API units)",
                    len(pending), window_start, window_end, used_units, daily_budget,
                )
                time.sleep(0.15)

            if stop_for_budget:
                break

    summary.update({
        "applied": True,
        "api_units_used_this_stage": used_units,
        "location_windows_completed_this_stage": completed_batches,
        "weather_rows_upserted_this_stage": total_rows,
        "stage_complete": not stop_for_budget,
    })
    logger.info("Import stage summary: %s", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write this stage to PostgreSQL")
    parser.add_argument("--start-date", type=date_type.fromisoformat, default=date_type(2015, 1, 1))
    parser.add_argument("--end-date", type=date_type.fromisoformat, help="Defaults to the latest date within the archive delay")
    parser.add_argument("--daily-budget", type=int, default=DEFAULT_DAILY_BUDGET)
    parser.add_argument("--hourly-budget", type=int, default=DEFAULT_HOURLY_BUDGET)
    args = parser.parse_args()
    summary = run_import_stage(
        apply=args.apply,
        start_date=args.start_date,
        end_date=args.end_date,
        daily_budget=args.daily_budget,
        hourly_budget=args.hourly_budget,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
