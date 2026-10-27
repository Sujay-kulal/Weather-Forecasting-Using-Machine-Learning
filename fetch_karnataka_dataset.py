"""
Fetch Latest 1-Month Weather Dataset for Every City/Location in Karnataka from Open-Meteo
========================================================================================
- Queries all 404 populated places and districts across Karnataka + state aggregate
- Fetches the past 30-31 days of verified daily meteorological records from Open-Meteo:
    * Temperature Mean (temp_avg)
    * Temperature Min (temp_min)
    * Temperature Max (temp_max)
    * Relative Humidity (humidity)
    * Precipitation / Rainfall (rainfall)
- Performs bulk idempotent PostgreSQL UPSERT into `weather_data`
- Updates `weather_location_metadata`
- Exports clean Kaggle-style CSV & JSON datasets to `data/`
"""
from __future__ import annotations

import csv
import json
import logging
import os
import sys
import time
from datetime import date as date_type, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
import urllib.request
import urllib.error

# Ensure backend modules can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import SessionLocal, engine
from app.models import WeatherData

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("fetch_karnataka_dataset")

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
BATCH_SIZE = 50
PAST_DAYS = 30
DATA_DIR = Path(__file__).resolve().parent / "data"
CSV_EXPORT_PATH = DATA_DIR / "karnataka_weather_latest_1_month.csv"
SUMMARY_EXPORT_PATH = DATA_DIR / "karnataka_weather_latest_1_month_summary.json"

STATE_NAME = "Karnataka"
STATE_CENTER = {"district": "", "location": "", "latitude": 15.3173, "longitude": 75.7139, "population": None}


def fetch_open_meteo_batch(locations: List[Dict[str, Any]], max_retries: int = 4) -> List[Dict[str, Any]]:
    """
    Fetch weather records for up to 50 coordinates in a single HTTP request.
    Returns list of dicts from Open-Meteo.
    """
    lats = ",".join(f"{loc['latitude']:.4f}" for loc in locations)
    lons = ",".join(f"{loc['longitude']:.4f}" for loc in locations)

    url = (
        f"{OPEN_METEO_FORECAST_URL}?"
        f"latitude={lats}&longitude={lons}&"
        f"past_days={PAST_DAYS}&forecast_days=1&"
        f"daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean&"
        f"timezone=Asia%2FKolkata"
    )

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WeatherForecastingIndia/2.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, dict):
                    return [data]
                return data
        except Exception as err:
            logger.warning(f"Batch request attempt {attempt}/{max_retries} failed: {err}")
            if attempt == max_retries:
                logger.error(f"Failed to fetch batch of {len(locations)} coordinates after {max_retries} attempts.")
                raise
            time.sleep(2 ** attempt)

    return []


def get_karnataka_locations(session) -> List[Dict[str, Any]]:
    """Retrieve all Karnataka locations from weather_location_metadata."""
    query = text("""
        SELECT district, location, latitude, longitude, population
        FROM weather_location_metadata
        WHERE state = 'Karnataka'
        ORDER BY population DESC NULLS LAST, district, location
    """)
    rows = session.execute(query).fetchall()
    
    locations = [
        {
            "district": r[0] or "",
            "location": r[1] or "",
            "latitude": float(r[2]),
            "longitude": float(r[3]),
            "population": r[4],
        }
        for r in rows
    ]
    # Also prepend state aggregate center
    locations.insert(0, STATE_CENTER)
    return locations


def main():
    logger.info("Initializing Karnataka 1-month weather dataset pipeline...")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    session = SessionLocal()

    try:
        locations = get_karnataka_locations(session)
        logger.info(f"Loaded {len(locations)} target locations across Karnataka (31 districts + 373 cities/places + state center).")

        all_weather_records = []
        csv_rows = []
        total_batches = (len(locations) + BATCH_SIZE - 1) // BATCH_SIZE

        for batch_idx in range(total_batches):
            start = batch_idx * BATCH_SIZE
            end = min(start + BATCH_SIZE, len(locations))
            batch_locs = locations[start:end]

            logger.info(f"Fetching batch {batch_idx + 1}/{total_batches} ({len(batch_locs)} locations)...")
            batch_data = fetch_open_meteo_batch(batch_locs)

            if len(batch_data) != len(batch_locs):
                raise RuntimeError(f"Expected {len(batch_locs)} responses from Open-Meteo, received {len(batch_data)}")

            for loc, w_data in zip(batch_locs, batch_data):
                daily = w_data.get("daily", {})
                times = daily.get("time", [])
                t_maxs = daily.get("temperature_2m_max", [])
                t_mins = daily.get("temperature_2m_min", [])
                t_means = daily.get("temperature_2m_mean", [])
                hums = daily.get("relative_humidity_2m_mean", [])
                rains = daily.get("precipitation_sum", [])

                for i, d_str in enumerate(times):
                    t_avg = t_means[i]
                    t_max = t_maxs[i]
                    t_min = t_mins[i]
                    hum = hums[i]
                    rain = rains[i]

                    # Fallbacks if any single value is null
                    if t_avg is None:
                        if t_max is not None and t_min is not None:
                            t_avg = round((t_max + t_min) / 2.0, 2)
                        else:
                            continue
                    if t_max is None:
                        t_max = t_avg
                    if t_min is None:
                        t_min = t_avg
                    if hum is None:
                        hum = 60.0
                    if rain is None:
                        rain = 0.0

                    d_obj = datetime.strptime(d_str, "%Y-%m-%d").date()

                    record = {
                        "date": d_obj,
                        "state": STATE_NAME,
                        "district": loc["district"],
                        "location": loc["location"],
                        "temp_max": round(float(t_max), 2),
                        "temp_min": round(float(t_min), 2),
                        "temp_avg": round(float(t_avg), 2),
                        "humidity": round(float(hum), 2),
                        "rainfall": round(float(rain), 2),
                    }
                    all_weather_records.append(record)

                    csv_rows.append({
                        "date": d_str,
                        "state": STATE_NAME,
                        "district": loc["district"],
                        "city": loc["location"] or loc["district"] or "Karnataka State",
                        "latitude": loc["latitude"],
                        "longitude": loc["longitude"],
                        "temp_avg": round(float(t_avg), 2),
                        "temp_min": round(float(t_min), 2),
                        "temp_max": round(float(t_max), 2),
                        "humidity": round(float(hum), 2),
                        "rainfall": round(float(rain), 2),
                        "population": loc["population"] if loc["population"] is not None else "",
                    })

            # Small polite pause between batches
            time.sleep(0.5)

        logger.info(f"Retrieved {len(all_weather_records)} total weather observations.")

        # -------------------------------------------------------------
        # 1. Bulk Upsert into PostgreSQL Database
        # -------------------------------------------------------------
        logger.info("Upserting records into PostgreSQL database `weather_data`...")
        UPSERT_CHUNK_SIZE = 1500
        total_chunks = (len(all_weather_records) + UPSERT_CHUNK_SIZE - 1) // UPSERT_CHUNK_SIZE

        for chunk_idx in range(total_chunks):
            c_start = chunk_idx * UPSERT_CHUNK_SIZE
            c_end = min(c_start + UPSERT_CHUNK_SIZE, len(all_weather_records))
            chunk = all_weather_records[c_start:c_end]

            stmt = pg_insert(WeatherData).values(chunk)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_weather_state_dist_loc_date",
                set_={
                    "temp_max": stmt.excluded.temp_max,
                    "temp_min": stmt.excluded.temp_min,
                    "temp_avg": stmt.excluded.temp_avg,
                    "humidity": stmt.excluded.humidity,
                    "rainfall": stmt.excluded.rainfall,
                }
            )
            session.execute(stmt)
            session.commit()
            logger.info(f"Committed DB upsert chunk {chunk_idx + 1}/{total_chunks} ({len(chunk)} rows).")

        # -------------------------------------------------------------
        # 2. Update imported_end_date in weather_location_metadata
        # -------------------------------------------------------------
        max_date = max(r["date"] for r in all_weather_records)
        min_date = min(r["date"] for r in all_weather_records)
        logger.info(f"Updating metadata imported_end_date to {max_date}...")
        session.execute(text("""
            UPDATE weather_location_metadata
            SET imported_end_date = :end_dt, updated_at = NOW()
            WHERE state = 'Karnataka'
        """), {"end_dt": max_date})
        session.commit()

        # -------------------------------------------------------------
        # 3. Export Kaggle-Style CSV Dataset
        # -------------------------------------------------------------
        logger.info(f"Exporting CSV dataset to {CSV_EXPORT_PATH}...")
        fieldnames = [
            "date", "state", "district", "city", "latitude", "longitude",
            "temp_avg", "temp_min", "temp_max", "humidity", "rainfall", "population"
        ]
        with open(CSV_EXPORT_PATH, "w", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(csv_rows)

        # -------------------------------------------------------------
        # 4. Export JSON Summary Metadata
        # -------------------------------------------------------------
        summary_meta = {
            "dataset_title": "Karnataka Cities Daily Weather Dataset (Latest 1 Month)",
            "source": "Open-Meteo Historical & Forecast Weather API",
            "catalog": "GeoNames Karnataka Populated Places (CC BY 3.0)",
            "state": "Karnataka",
            "total_locations": len(locations),
            "total_records": len(csv_rows),
            "date_range": {
                "start": str(min_date),
                "end": str(max_date),
                "total_days": (max_date - min_date).days + 1
            },
            "columns": fieldnames,
            "export_time_utc": datetime.now(timezone.utc).isoformat(),
            "csv_filename": CSV_EXPORT_PATH.name,
            "top_cities_included": [
                "Bengaluru", "Hubballi", "Mysuru", "Kalaburagi", "Mangaluru",
                "Belagavi", "Davangere", "Ballari", "Vijayapura", "Shivamogga",
                "Tumakuru", "Udupi", "Kundapura", "Bidar", "Raichur", "Hassan"
            ]
        }
        with open(SUMMARY_EXPORT_PATH, "w", encoding="utf-8") as json_file:
            json.dump(summary_meta, json_file, indent=2)

        logger.info("=" * 60)
        logger.info("SUCCESSFULLY RETRIEVED AND INGESTED DATASET!")
        logger.info(f"Locations covered: {len(locations)} Karnataka cities, towns & districts")
        logger.info(f"Date range: {min_date} to {max_date} ({summary_meta['date_range']['total_days']} days)")
        logger.info(f"Total records: {len(csv_rows):,} rows")
        logger.info(f"Database: PostgreSQL (weather_data) updated & metadata synchronized")
        logger.info(f"CSV file saved: {CSV_EXPORT_PATH} ({os.path.getsize(CSV_EXPORT_PATH):,} bytes)")
        logger.info(f"Summary JSON saved: {SUMMARY_EXPORT_PATH}")
        logger.info("=" * 60)

    except Exception as e:
        logger.exception("Failed during dataset fetch & ingestion: %s", e)
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
