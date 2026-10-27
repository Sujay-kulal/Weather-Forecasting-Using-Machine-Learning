"""
Backfill Open-Meteo historical archive data from 2015-01-01 to latest available.
Batched per state with delays, retries, and row count logging. Safe to re-run.
"""
import sys
import time
import json
import logging
import urllib.request
import urllib.error
from datetime import datetime, date
from pathlib import Path

# Add backend directory to sys.path so app modules can be loaded
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.database import SessionLocal
from app.models import WeatherData
from sqlalchemy import select, text
from update_weather import STATE_COORDS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("backfill")

START_DATE = date(2015, 1, 1)

def fetch_archive_for_state(state: str, lat: float, lon: float, start_date: date, end_date: date, max_retries: int = 5):
    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lon}&"
        f"start_date={start_date.isoformat()}&end_date={end_date.isoformat()}&"
        f"daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean&"
        f"timezone=auto"
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

def backfill():
    end_date = date.today()
    logger.info(f"Starting historical backfill from {START_DATE} to {end_date} for {len(STATE_COORDS)} states.")
    session = SessionLocal()
    total_added = 0
    state_results = {}

    try:
        for state, (lat, lon) in STATE_COORDS.items():
            # Query existing dates for this state to prevent any duplicate insertion
            existing_dates = set(
                session.execute(
                    select(WeatherData.date).where(
                        WeatherData.state == state,
                        WeatherData.district == "",
                        WeatherData.location == ""
                    )
                ).scalars().all()
            )
            existing_count = len(existing_dates)

            logger.info(f"[{state}] Existing records in DB: {existing_count}. Fetching from Open-Meteo Archive...")
            data = fetch_archive_for_state(state, lat, lon, START_DATE, end_date)

            if "daily" not in data or "time" not in data["daily"]:
                logger.warning(f"[{state}] No daily data returned.")
                state_results[state] = 0
                continue

            daily = data["daily"]
            times = daily["time"]
            t_max = daily["temperature_2m_max"]
            t_min = daily["temperature_2m_min"]
            t_mean = daily["temperature_2m_mean"]
            precip = daily["precipitation_sum"]
            humid = daily["relative_humidity_2m_mean"]

            new_records = []
            for i in range(len(times)):
                if t_max[i] is None or t_min[i] is None or t_mean[i] is None or precip[i] is None or humid[i] is None:
                    continue
                d = datetime.strptime(times[i], "%Y-%m-%d").date()
                if d in existing_dates:
                    continue

                new_records.append(
                    WeatherData(
                        state=state,
                        district="",
                        location="",
                        date=d,
                        temp_max=float(t_max[i]),
                        temp_min=float(t_min[i]),
                        temp_avg=float(t_mean[i]),
                        humidity=float(humid[i]),
                        rainfall=float(precip[i]),
                    )
                )

            if new_records:
                session.bulk_save_objects(new_records)
                session.commit()
                added = len(new_records)
                total_added += added
                logger.info(f"[{state}] Added {added} new historical records. Total for state: {existing_count + added}")
            else:
                logger.info(f"[{state}] 0 new records to add (already up to date).")
                added = 0

            state_results[state] = added
            time.sleep(1.0) # gentle delay between states to respect rate limits

        logger.info(f"Backfill finished successfully! Total records added across all states: {total_added}")
        return total_added, state_results
    finally:
        session.close()

if __name__ == "__main__":
    backfill()
