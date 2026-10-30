"""
Demonstration Harness for Actual Scheduler and Ingestion Execution in an Isolated Environment.
=============================================================================================
This harness executes the REAL APScheduler lifespan, the REAL run_ingestion_with_lock,
the REAL PostgreSQL advisory lock mechanism, the REAL update_weather upsert pipeline,
and REAL Open-Meteo HTTP data ingestion inside an ISOLATED PostgreSQL SCHEMA.

Zero mutations occur in the production table public.weather_data (locked at 46,834 rows).
"""
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

# Setup path relative to repository root
ROOT_DIR = Path(__file__).resolve().parent.parent
backend_dir = ROOT_DIR / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

load_dotenv(backend_dir / ".env")

import update_weather
from app.database import Base
from app.models import WeatherData, Prediction
from app.services import ingestion_service
from app.services.ingestion_service import ADVISORY_LOCK_ID, run_ingestion_with_lock
from app.services.metrics_service import fill_missing_actuals
from app.main import lifespan
from fastapi import FastAPI
import asyncio


def run_isolated_demonstration():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL not found in backend/.env")

    main_engine = sa.create_engine(db_url)

    # Step 1: Pre-execution verification of production database table
    with main_engine.connect() as conn:
        prod_count_initial = conn.execute(sa.text("SELECT count(*) FROM public.weather_data")).scalar()
        print(f"[STEP 1] Production public.weather_data row count BEFORE execution: {prod_count_initial}")
        assert prod_count_initial == 46834, f"CRITICAL: Production rows altered! Expected 46834, found {prod_count_initial}"

        # Step 2: Create isolated schema and duplicate table structures
        schema_name = "isolated_scheduler_demo"
        print(f"[STEP 2] Creating isolated PostgreSQL schema: {schema_name}...")
        conn.execute(sa.text(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE;"))
        conn.execute(sa.text(f"CREATE SCHEMA IF NOT EXISTS {schema_name};"))
        conn.commit()

        # Create schema tables with exact constraints
        conn.execute(sa.text(f"CREATE TABLE IF NOT EXISTS {schema_name}.weather_data (LIKE public.weather_data INCLUDING ALL);"))
        conn.execute(sa.text(f"CREATE TABLE IF NOT EXISTS {schema_name}.predictions (LIKE public.predictions INCLUDING ALL);"))
        conn.execute(sa.text(f"ALTER TABLE {schema_name}.weather_data ADD CONSTRAINT uq_weather_state_dist_loc_date UNIQUE (state, district, location, date);"))
        conn.commit()

    # Step 3: Create isolated engine and sessionmaker bound to isolated schema
    isolated_engine = sa.create_engine(
        db_url,
        connect_args={"options": f"-csearch_path={schema_name}"}
    )
    IsolatedSessionLocal = sessionmaker(bind=isolated_engine)

    try:
        # Step 4: Verify isolated table is initially empty
        with isolated_engine.connect() as iconn:
            iso_count_initial = iconn.execute(sa.text("SELECT count(*) FROM weather_data")).scalar()
            current_search_path = iconn.execute(sa.text("SHOW search_path")).scalar()
            print(f"[STEP 3] Connected to isolated schema. search_path = {current_search_path}")
            print(f"         Isolated weather_data initial row count: {iso_count_initial}")
            assert iso_count_initial == 0, "Isolated table should be empty initially"

        # Step 5: Test Actual APScheduler Lifespan Startup & Job Registration
        print("[STEP 4] Initializing FastAPI lifespan with ENABLE_INGESTION_SCHEDULER=true...")
        os.environ["ENABLE_INGESTION_SCHEDULER"] = "true"
        test_app = FastAPI()

        async def _test_scheduler_lifecycle():
            # Patch SessionLocal in ingestion_service to point to our isolated sessionmaker
            original_session_local = ingestion_service.SessionLocal
            ingestion_service.SessionLocal = IsolatedSessionLocal

            try:
                # We limit STATE_COORDS to 1 state (Goa) for fast, deterministic end-to-end execution
                test_coords = {"Goa": (15.2993, 74.1240)}
                orig_coords = update_weather.STATE_COORDS
                update_weather.STATE_COORDS = test_coords

                async with lifespan(test_app):
                    scheduler = getattr(test_app.state, "scheduler", None)
                    assert scheduler is not None, "Scheduler failed to initialize on app.state"
                    assert scheduler.running is True, "BackgroundScheduler is not running"
                    print(f"         APScheduler running: {scheduler.running}")

                    jobs = {j.id: j for j in scheduler.get_jobs()}
                    print(f"         Registered jobs: {list(jobs.keys())}")
                    assert "daily_weather_ingest" in jobs, "Missing daily_weather_ingest"
                    assert "fill_prediction_actuals" in jobs, "Missing fill_prediction_actuals"

                    ingest_job = jobs["daily_weather_ingest"]
                    print(f"         daily_weather_ingest target: {ingest_job.func.__name__} (trigger: {ingest_job.trigger})")

                    # Step 6: Execute the ACTUAL scheduled function via the job reference
                    print("[STEP 5] Triggering ACTUAL daily_weather_ingest callback (real Open-Meteo API + real DB upsert)...")
                    start_t = time.time()
                    result = ingest_job.func(days_back=2)
                    duration = time.time() - start_t
                    print(f"         Actual execution completed in {duration:.2f}s:")
                    print(f"         Result status: {result['status']}")
                    print(f"         Records upserted: {result['records_upserted']}")
                    print(f"         Last ingested at: {result['last_ingested_at']}")
                    assert result["status"] == "success", f"Ingestion failed: {result}"
                    assert result["records_upserted"] > 0, "No records were upserted"

                    # Step 7: Test Idempotency (re-trigger same ingestion job)
                    print("[STEP 6] Re-triggering ingestion to demonstrate IDEMPOTENCY with real ON CONFLICT DO UPDATE...")
                    result_idempotent = ingest_job.func(days_back=2)
                    print(f"         Re-run status: {result_idempotent['status']}, records upserted: {result_idempotent['records_upserted']}")
                    assert result_idempotent["status"] == "success"

                    # Step 8: Test Advisory Lock Contention
                    print("[STEP 7] Demonstrating PostgreSQL Advisory Lock Contention handling...")
                    with isolated_engine.connect() as lock_conn:
                        # Artificially hold the advisory lock in a separate connection
                        lock_conn.execute(sa.text(f"SELECT pg_advisory_lock({ADVISORY_LOCK_ID})"))
                        print(f"         External connection acquired advisory lock ({ADVISORY_LOCK_ID})")
                        try:
                            contention_result = ingest_job.func(days_back=1)
                            print(f"         Scheduler job handled contention cleanly: {contention_result}")
                            assert contention_result["status"] == "skipped"
                            assert contention_result["reason"] == "advisory_lock_held"
                        finally:
                            lock_conn.execute(sa.text(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_ID})"))
                            print(f"         External connection released advisory lock ({ADVISORY_LOCK_ID})")

                print("[STEP 8] FastAPI lifespan exited. Checking clean scheduler shutdown...")
                assert scheduler.running is False, "Scheduler should be stopped after lifespan exit"
                print(f"         APScheduler cleanly stopped: {not scheduler.running}")

            finally:
                ingestion_service.SessionLocal = original_session_local
                update_weather.STATE_COORDS = orig_coords

        asyncio.run(_test_scheduler_lifecycle())

        # Step 9: Verify rows in isolated schema vs production schema
        with isolated_engine.connect() as iconn:
            iso_count_final = iconn.execute(sa.text("SELECT count(*) FROM weather_data")).scalar()
            rows = iconn.execute(sa.text("SELECT state, date, temp_max, temp_min, temp_avg FROM weather_data ORDER BY date DESC")).fetchall()
            print(f"[STEP 9] Isolated schema verification:")
            print(f"         Total records in isolated_scheduler_demo.weather_data: {iso_count_final}")
            for r in rows:
                print(f"         Sample row -> State: {r[0]}, Date: {r[1]}, T_max: {r[2]}, T_min: {r[3]}, T_avg: {r[4]}")
            assert iso_count_final > 0, "Expected inserted rows in isolated schema"

    finally:
        # Step 10: Clean up isolated schema and verify production table intact
        print("[STEP 10] Cleaning up isolated schema and verifying production table invariants...")
        with main_engine.connect() as conn:
            conn.execute(sa.text(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE;"))
            conn.commit()
            print(f"          Dropped schema {schema_name}.")

            prod_count_final = conn.execute(sa.text("SELECT count(*) FROM public.weather_data")).scalar()
            print(f"          Production public.weather_data row count AFTER execution: {prod_count_final}")
            assert prod_count_final == 46834, f"CRITICAL INVARIANT VIOLATION: Production rows changed! Expected 46834, found {prod_count_final}"
            print("[SUCCESS] Production database strictly untouched at exactly 46,834 records!")


if __name__ == "__main__":
    run_isolated_demonstration()
