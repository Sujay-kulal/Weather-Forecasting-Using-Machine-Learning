import sys
import time
import json
import logging
import argparse
import urllib.request
import urllib.error
from datetime import datetime, date
from pathlib import Path

# Make `app` importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal
from app.models import WeatherData
from sqlalchemy.dialects.postgresql import insert as pg_insert

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("update_weather")

STATE_COORDS = {
    'Andhra Pradesh': (15.9129, 79.7400),
    'Arunachal Pradesh': (28.2180, 94.7278),
    'Assam': (26.2006, 92.9376),
    'Bihar': (25.0961, 85.3131),
    'Chandigarh': (30.7333, 76.7794),
    'Chhattisgarh': (21.2787, 81.8661),
    'Dadra And Nagar Haveli And Daman And Diu': (20.3974, 72.8328),
    'Delhi': (28.7041, 77.1025),
    'Goa': (15.2993, 74.1240),
    'Gujarat': (22.2587, 71.1924),
    'Haryana': (29.0588, 76.0856),
    'Himachal Pradesh': (31.1048, 77.1666),
    'Jammu And Kashmir': (33.7782, 76.5762),
    'Jharkhand': (23.6102, 85.2799),
    'Karnataka': (15.3173, 75.7139),
    'Kerala': (10.8505, 76.2711),
    'Madhya Pradesh': (22.9734, 78.6569),
    'Maharashtra': (19.7515, 75.7139),
    'Manipur': (24.6637, 93.9063),
    'Meghalaya': (25.4670, 91.3662),
    'Mizoram': (23.1645, 92.9376),
    'Nagaland': (26.1584, 94.5624),
    'Odisha': (20.9517, 85.0985),
    'Other': (20.5937, 78.9629),
    'Puducherry': (11.9416, 79.8083),
    'Punjab': (31.1471, 75.3412),
    'Rajasthan': (27.0238, 74.2179),
    'Sikkim': (27.5330, 88.5122),
    'Tamil Nadu': (11.1271, 78.6569),
    'Telangana': (18.1124, 79.0193),
    'Tripura': (23.9408, 91.9882),
    'Uttar Pradesh': (26.8467, 80.9462),
    'Uttarakhand': (30.0668, 79.0193),
    'West Bengal': (22.9868, 87.8550)
}

def fetch_forecast_for_state(state: str, lat: float, lon: float, days_back: int = 7, max_retries: int = 5):
    """Fetch recent days using the Open-Meteo Forecast API with past_days."""
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&"
        f"past_days={days_back}&forecast_days=1&"
        f"daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean&"
        f"timezone=auto"
    )

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WeatherUpdate/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data
        except Exception as e:
            logger.warning(f"[{state}] Attempt {attempt}/{max_retries} failed: {e}")
            if attempt == max_retries:
                logger.error(f"[{state}] All {max_retries} attempts failed.")
                raise
            time.sleep(2 ** attempt)

def update_weather(days_back: int = 7, session=None) -> int:
    """
    Ingest recent weather data using the Open-Meteo Forecast API (past_days)
    and perform an idempotent UPSERT into weather_data.
    """
    close_session = False
    if session is None:
        session = SessionLocal()
        close_session = True

    logger.info(f"Starting weather update (days_back={days_back}) for {len(STATE_COORDS)} states...")
    added_or_updated_total = 0

    try:
        for state, (lat, lon) in STATE_COORDS.items():
            data = fetch_forecast_for_state(state, lat, lon, days_back=days_back)
            if not data or "daily" not in data or "time" not in data["daily"]:
                logger.warning(f"[{state}] No daily data in response")
                continue

            daily = data["daily"]
            times = daily["time"]
            t_max = daily["temperature_2m_max"]
            t_min = daily["temperature_2m_min"]
            t_mean = daily["temperature_2m_mean"]
            precip = daily["precipitation_sum"]
            humid = daily["relative_humidity_2m_mean"]

            buffer = []
            for i in range(len(times)):
                if t_max[i] is None or t_min[i] is None or t_mean[i] is None or precip[i] is None or humid[i] is None:
                    continue

                d = datetime.strptime(times[i], "%Y-%m-%d").date()
                buffer.append({
                    "state": state,
                    "district": "",
                    "location": "",
                    "date": d,
                    "temp_max": float(t_max[i]),
                    "temp_min": float(t_min[i]),
                    "temp_avg": float(t_mean[i]),
                    "humidity": float(humid[i]),
                    "rainfall": float(precip[i]),
                })

            if buffer:
                stmt = pg_insert(WeatherData).values(buffer)
                upsert_stmt = stmt.on_conflict_do_update(
                    constraint="uq_weather_state_dist_loc_date",
                    set_={
                        "temp_max": stmt.excluded.temp_max,
                        "temp_min": stmt.excluded.temp_min,
                        "temp_avg": stmt.excluded.temp_avg,
                        "humidity": stmt.excluded.humidity,
                        "rainfall": stmt.excluded.rainfall,
                    }
                )
                session.execute(upsert_stmt)
                session.commit()
                added_or_updated_total += len(buffer)
                logger.info(f"[{state}] Upserted {len(buffer)} records.")
            else:
                logger.info(f"[{state}] No valid records to upsert.")

            time.sleep(0.5)

        logger.info(f"Weather update completed. Total upserted records: {added_or_updated_total}")
        return added_or_updated_total
    finally:
        if close_session:
            session.close()

def main():
    parser = argparse.ArgumentParser(description="Update weather data from Open-Meteo Forecast API.")
    parser.add_argument("--days-back", type=int, default=7, help="Number of past days to fetch (default: 7)")
    args = parser.parse_args()
    update_weather(days_back=args.days_back)

if __name__ == "__main__":
    main()
