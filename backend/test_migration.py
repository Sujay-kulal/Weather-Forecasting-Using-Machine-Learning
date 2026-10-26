"""Integration test for the migration; requires a disposable local PostgreSQL DB.

Set WEATHER_TEST_DATABASE_URL to a local database named
``weather_migration_test``. All DDL and writes are rolled back after the test.
"""
import os
import sys
import unittest
from datetime import date
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

test_url = os.environ.get("WEATHER_TEST_DATABASE_URL", "")
if test_url:
    parsed_url = make_url(test_url)
    if parsed_url.host not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("Migration tests are restricted to a local PostgreSQL host.")
    if parsed_url.database != "weather_migration_test":
        raise RuntimeError("Migration tests require database weather_migration_test.")
    os.environ["DATABASE_URL"] = test_url
else:
    # Keep imports harmless when tests are collected without their isolated DB.
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+psycopg://invalid:invalid@127.0.0.1:1/weather_migration_test",
    )

from app.database import Base  # noqa: E402
from app.models import WeatherData  # noqa: E402,F401
from migrate_db import downgrade, upgrade  # noqa: E402
from update_weather import upsert_weather_batch  # noqa: E402


@unittest.skipUnless(test_url, "set WEATHER_TEST_DATABASE_URL to a disposable local PostgreSQL database")
class MigrationIntegrationTests(unittest.TestCase):
    def test_upgrade_location_upserts_and_safe_downgrade(self):
        engine = create_engine(test_url)
        with engine.connect() as conn:
            transaction = conn.begin()
            try:
                # This test database is explicitly disposable and the whole test
                # runs in one transaction, which is rolled back in tearDown.
                Base.metadata.drop_all(bind=conn)
                conn.execute(text("""
                    CREATE TABLE weather_data (
                        id SERIAL PRIMARY KEY,
                        date DATE NOT NULL,
                        state VARCHAR(100) NOT NULL,
                        temp_max DOUBLE PRECISION NOT NULL,
                        temp_min DOUBLE PRECISION NOT NULL,
                        temp_avg DOUBLE PRECISION NOT NULL,
                        humidity DOUBLE PRECISION NOT NULL,
                        rainfall DOUBLE PRECISION NOT NULL,
                        CONSTRAINT uq_weather_state_date UNIQUE (state, date)
                    )
                """))
                conn.execute(text("""
                    INSERT INTO weather_data
                        (date, state, temp_max, temp_min, temp_avg, humidity, rainfall)
                    VALUES ('2025-01-01', 'Audit State', 30, 20, 25, 60, 0)
                """))

                upgrade(conn)
                upgrade(conn)  # Repeat to verify migration idempotency.
                constraints = set(conn.execute(text("""
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'weather_data'::regclass
                """)).scalars())
                self.assertIn("uq_weather_state_dist_loc_date", constraints)
                self.assertNotIn("uq_weather_state_date", constraints)
                prediction_constraints = set(conn.execute(text("""
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'predictions'::regclass
                """)).scalars())
                self.assertIn("uq_prediction_run_dist_loc", prediction_constraints)

                first_location = {
                    "state": "Audit State", "district": "North", "location": "One",
                    "date": date(2025, 1, 1), "temp_max": 31.0, "temp_min": 20.0,
                    "temp_avg": 25.5, "humidity": 61.0, "rainfall": 0.0,
                }
                updated_location = {**first_location, "temp_avg": 26.0}
                second_location = {**first_location, "location": "Two", "temp_avg": 24.0}

                upsert_weather_batch(conn, [first_location])
                upsert_weather_batch(conn, [updated_location])
                upsert_weather_batch(conn, [second_location])
                rows = conn.execute(text("""
                    SELECT location, temp_avg FROM weather_data
                    WHERE state = 'Audit State' AND date = '2025-01-01'
                    ORDER BY location
                """)).all()
                self.assertEqual(rows, [("", 25.0), ("One", 26.0), ("Two", 24.0)])

                with self.assertRaisesRegex(RuntimeError, "location-specific weather rows"):
                    downgrade(conn)
                self.assertEqual(conn.execute(text("SELECT count(*) FROM weather_data")).scalar_one(), 3)

                conn.execute(text("""
                    DELETE FROM weather_data WHERE state='Audit State' AND location='Two'
                """))
                conn.execute(text("""
                    DELETE FROM weather_data WHERE state='Audit State' AND location='One'
                """))
                conn.execute(text("""
                    INSERT INTO predictions
                        (state, district, location, forecast_date, predicted_temp_avg)
                    VALUES ('Audit State', 'North', 'One', '2025-01-02', '[]'::json)
                """))
                with self.assertRaisesRegex(RuntimeError, "location-specific predictions"):
                    downgrade(conn)
                conn.execute(text("DELETE FROM predictions WHERE state='Audit State'"))

                downgrade(conn)
                old_constraints = set(conn.execute(text("""
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'weather_data'::regclass
                """)).scalars())
                self.assertIn("uq_weather_state_date", old_constraints)
                self.assertNotIn("uq_weather_state_dist_loc_date", old_constraints)
                old_prediction_constraints = set(conn.execute(text("""
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'predictions'::regclass
                """)).scalars())
                self.assertIn("uq_prediction_run", old_prediction_constraints)
                self.assertNotIn("uq_prediction_run_dist_loc", old_prediction_constraints)

                upgrade(conn)
                current_constraints = set(conn.execute(text("""
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'weather_data'::regclass
                """)).scalars())
                self.assertIn("uq_weather_state_dist_loc_date", current_constraints)
                self.assertNotIn("uq_weather_state_date", current_constraints)
                upgraded_prediction_constraints = set(conn.execute(text("""
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'predictions'::regclass
                """)).scalars())
                self.assertIn("uq_prediction_run_dist_loc", upgraded_prediction_constraints)
                self.assertNotIn("uq_prediction_run", upgraded_prediction_constraints)
            finally:
                transaction.rollback()
                conn.close()
        engine.dispose()


if __name__ == "__main__":
    unittest.main(verbosity=2)
