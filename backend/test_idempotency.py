"""Deterministic ingestion idempotency test for a disposable local PostgreSQL DB.

Run after the schema migration with WEATHER_TEST_DATABASE_URL set to a local
database named ``weather_migration_test``. No external weather API is called.
"""
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

test_url = os.environ.get("WEATHER_TEST_DATABASE_URL", "")
if not test_url:
    raise SystemExit(
        "Set WEATHER_TEST_DATABASE_URL to a disposable local PostgreSQL database "
        "named weather_migration_test."
    )
parsed_url = make_url(test_url)
if parsed_url.host not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit("Idempotency writes are restricted to a local PostgreSQL host.")
if parsed_url.database != "weather_migration_test":
    raise SystemExit("Idempotency writes require database weather_migration_test.")
os.environ["DATABASE_URL"] = test_url

import update_weather  # noqa: E402


def _fixture_response(temp_offset: float) -> dict:
    yesterday = datetime.now(ZoneInfo("Asia/Kolkata")).date() - timedelta(days=1)
    days = [yesterday - timedelta(days=1), yesterday]
    return {
        "daily": {
            "time": [day.isoformat() for day in days],
            "temperature_2m_max": [30.0 + temp_offset, 31.0 + temp_offset],
            "temperature_2m_min": [20.0 + temp_offset, 21.0 + temp_offset],
            "temperature_2m_mean": [25.0 + temp_offset, 26.0 + temp_offset],
            "precipitation_sum": [0.0, 1.0],
            "relative_humidity_2m_mean": [50.0, 55.0],
        }
    }


def verify_idempotency() -> tuple[int, int, int]:
    engine = create_engine(test_url)
    with engine.connect() as conn:
        count_before = conn.execute(text("SELECT COUNT(*) FROM weather_data")).scalar_one()

    print(f"Count before: {count_before}")
    for run, temp_offset in ((1, 0.0), (2, 1.0)):
        print(f"Running isolated ingestion simulation {run}...")
        fixture = _fixture_response(temp_offset)
        with patch.object(
            update_weather,
            "fetch_forecast_for_state",
            return_value=fixture,
        ), patch.object(update_weather.time, "sleep"):
            update_weather.update_weather(days_back=2)
        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM weather_data")).scalar_one()
        if run == 1:
            count_after_1 = count
        else:
            count_after_2 = count
        print(f"Count after run {run}: {count}")

    assert count_after_1 >= count_before
    assert count_after_2 == count_after_1, (
        f"Repeated upsert changed row count: first={count_after_1}, second={count_after_2}"
    )
    with engine.connect() as conn:
        updated_value = conn.execute(text("""
            SELECT temp_avg FROM weather_data
            WHERE state = 'Karnataka' AND district = '' AND location = ''
            ORDER BY date DESC LIMIT 1
        """)).scalar_one()
    expected = _fixture_response(1.0)["daily"]["temperature_2m_mean"][-1]
    assert updated_value == expected, f"Upsert did not refresh the latest value: {updated_value}"
    engine.dispose()
    print("PASS: second ingestion kept row count stable and refreshed existing records.")
    return count_before, count_after_1, count_after_2


if __name__ == "__main__":
    verify_idempotency()
