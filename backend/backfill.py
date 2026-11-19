"""
Backfill Open-Meteo historical archive data from 2015-01-01 to latest available.
Batched per state with delays, retries, and row count logging. Safe to re-run.
"""
import argparse
import sys
import time
import json
import logging
import urllib.request
import urllib.error
from datetime import date, timedelta
from pathlib import Path

# Add backend directory to sys.path so app modules can be loaded
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.database import SessionLocal
from app.models import WeatherData
from sqlalchemy.dialects.postgresql import insert

from update_weather import STATE_COORDS, get_india_today, parse_completed_days

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("backfill")

START_DATE = date(2015, 1, 1)

def fetch_archive_for_state(state: str, lat: float, lon: float, start_date: date, end_date: date, max_retries: int = 5):
    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lon}&"
        f"start_date={start_date.isoformat()}&end_date={end_date.isoformat()}&"
        f"daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean&"
        f"timezone=Asia%2FKolkata"
    )

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WeatherForecastBackfill/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data
        except Exception as e:
            logger.warning(f"[{state}] Attempt {attempt}/{max_retries} failed: {e}")
            if attempt == max_retries:
                logger.error(f"[{state}] All {max_retries} attempts failed.")
                raise
            time.sleep(2 ** attempt)

def backfill(start_date: date = START_DATE, end_date: date | None = None):
    today = get_india_today()
    end_date = end_date or today - timedelta(days=1)
    if not start_date <= end_date < today:
        raise ValueError("Choose an ordered range of completed dates in India.")
    logger.info("Backfilling %s through %s for %d states", start_date, end_date, len(STATE_COORDS))
    total_added = 0
    state_results = {}
    failures = []
    with SessionLocal() as session:
        for state, (lat, lon) in STATE_COORDS.items():
            try:
                data = fetch_archive_for_state(state, lat, lon, start_date, end_date)
                records = [
                    row for row in parse_completed_days(data, state, end_date + timedelta(days=1))
                    if row["date"] >= start_date
                ]
                if not records:
                    raise ValueError("No complete historical days returned")
                added = 0
                for index in range(0, len(records), 1000):
                    table = WeatherData.__table__
                    statement = insert(table).values(records[index : index + 1000]).on_conflict_do_nothing(
                        constraint="uq_weather_state_dist_loc_date",
                    ).returning(table.c.id)
                    added += len(session.scalars(statement).all())
                session.commit()
                total_added += added
                state_results[state] = added
            except Exception:
                session.rollback()
                failures.append(state)
                logger.exception("Archive backfill failed for %s", state)
            finally:
                time.sleep(1.0)

    logger.info("Archive backfill added %d rows across %d states", total_added, len(state_results))
    if failures:
        raise RuntimeError(f"Backfill incomplete for: {', '.join(failures)}")
    return total_added, state_results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-date", type=date.fromisoformat, default=START_DATE)
    parser.add_argument("--end-date", type=date.fromisoformat)
    args = parser.parse_args()
    backfill(args.start_date, args.end_date)
