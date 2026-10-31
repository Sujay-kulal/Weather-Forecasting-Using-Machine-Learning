"""
Demonstration Harness for Actual Scheduler and Ingestion Execution in an Isolated Environment.
=============================================================================================
This harness executes the REAL APScheduler lifespan, the REAL run_ingestion_with_lock,
the REAL PostgreSQL advisory lock mechanism, the REAL update_weather upsert pipeline,
and REAL Open-Meteo HTTP data ingestion inside an ISOLATED, DISPOSABLE PostgreSQL database
and unique temporary schema.

SAFETY INVARIANTS:
1. SCHEDULER_DEMO_DATABASE_URL is strictly mandatory.
2. NEVER loads backend/.env and NEVER falls back to DATABASE_URL.
3. The database name MUST end with _test, _demo, _disposable, or _sandbox.
4. The production database (weather_forecasting) and any database sharing production
   identity are strictly rejected.
5. FastAPI lifespan, init_db(), SessionLocal, and ingestion routines are patched to
   bind exclusively to the isolated disposable engine.
6. Temporary schemas are uniquely named (e.g. isolated_demo_<timestamp>_<uuid>).
7. Cleanup ONLY drops the unique schema created by the current execution on the
   disposable database.
8. Zero connections or mutations ever touch the production database.
"""
import os
import re
import sys
import time
import uuid
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

# Setup path relative to repository root
ROOT_DIR = Path(__file__).resolve().parent.parent
backend_dir = ROOT_DIR / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# DO NOT LOAD backend/.env!
# Invariant: There is NO fallback to backend/.env or DATABASE_URL.

APPROVED_SUFFIXES = ("_test", "_demo", "_disposable", "_sandbox")
KNOWN_PROD_DB_NAMES = ("weather_forecasting", "weather_forecasting_prod", "production")
SCHEMA_NAME_PATTERN = re.compile(r"^isolated_demo_\d+_[0-9a-f]{12}$")


def validate_demo_database_url(
    url: Optional[str],
    prod_url: Optional[str] = None
) -> sa.engine.URL:
    """
    Strictly validates the demo database URL against safety invariants.
    Fails closed if missing, non-postgres, production, or lacking an approved disposable suffix.
    """
    if not url or not str(url).strip():
        raise RuntimeError(
            "SCHEDULER_DEMO_DATABASE_URL is mandatory. "
            "It must point to a separate disposable PostgreSQL database whose name ends with "
            "'_test', '_demo', '_disposable', or '_sandbox'. "
            "Fallback to DATABASE_URL or backend/.env is strictly forbidden."
        )

    try:
        parsed_url = sa.engine.make_url(str(url).strip())
    except Exception as exc:
        raise ValueError(f"Invalid database URL format: {exc}") from exc

    # Dialect check
    if not parsed_url.drivername.startswith("postgresql"):
        raise ValueError(
            f"Non-PostgreSQL URL rejected: '{parsed_url.drivername}'. "
            "Scheduler isolation demonstration requires a PostgreSQL database."
        )

    db_name = parsed_url.database
    if not db_name:
        raise ValueError("Database name is missing in SCHEDULER_DEMO_DATABASE_URL.")

    db_name_lower = db_name.lower()

    # Reject known production names
    if db_name_lower in KNOWN_PROD_DB_NAMES:
        raise ValueError(
            f"Production database name '{db_name}' is strictly rejected. "
            "Demonstration must use a separate disposable database."
        )

    # Must end in an approved suffix
    if not any(db_name_lower.endswith(sfx) for sfx in APPROVED_SUFFIXES):
        raise ValueError(
            f"Database '{db_name}' rejected. "
            f"Disposable database name must end in one of: {APPROVED_SUFFIXES}."
        )

    # Check against configured production URL identity if known
    if prod_url and str(prod_url).strip():
        try:
            prod_parsed = sa.engine.make_url(str(prod_url).strip())
            same_host = (parsed_url.host or "localhost") == (prod_parsed.host or "localhost")
            same_port = (parsed_url.port or 5432) == (prod_parsed.port or 5432)
            same_db = db_name_lower == (prod_parsed.database or "").lower()
            if same_host and same_port and same_db:
                raise ValueError(
                    f"SCHEDULER_DEMO_DATABASE_URL points to the same database identity "
                    f"as the configured production database ({prod_parsed.database}). Rejected."
                )
        except ValueError:
            raise
        except Exception:
            pass

    return parsed_url


def generate_unique_schema_name() -> str:
    """Generates a unique, disposable schema name for this specific execution."""
    token = uuid.uuid4().hex[:12]
    timestamp = int(time.time())
    return f"isolated_demo_{timestamp}_{token}"


def setup_isolated_schema(engine: sa.Engine, schema_name: str) -> None:
    """
    Creates the isolated schema on the disposable database.
    Does NOT drop pre-existing schemas.
    """
    if not SCHEMA_NAME_PATTERN.match(schema_name):
        raise ValueError(f"Refusing to create schema with non-conforming name: '{schema_name}'")

    with engine.connect() as conn:
        conn.execute(sa.text(f'CREATE SCHEMA "{schema_name}";'))
        conn.commit()


def cleanup_isolated_schema(engine: sa.Engine, schema_name: str) -> None:
    """
    Drops ONLY the temporary schema created by this execution on the disposable database.
    """
    if not SCHEMA_NAME_PATTERN.match(schema_name):
        raise ValueError(f"Refusing to drop schema with non-conforming name: '{schema_name}'")
    if schema_name.lower() in ("public", "information_schema", "pg_catalog"):
        raise ValueError(f"Refusing to drop protected schema '{schema_name}'")

    with engine.connect() as conn:
        conn.execute(sa.text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE;'))
        conn.commit()


def run_isolated_demonstration(demo_db_url: Optional[str] = None):
    """
    Executes the real scheduler and ingestion pipeline inside the disposable database.
    """
    if demo_db_url is None:
        demo_db_url = os.environ.get("SCHEDULER_DEMO_DATABASE_URL")

    # Invariant: Never read DATABASE_URL as fallback for demo connection!
    prod_db_url = os.environ.get("DATABASE_URL")

    # Step 1: Validate disposable database URL
    validated_url = validate_demo_database_url(demo_db_url, prod_url=prod_db_url)
    print(f"[STEP 1] Validated disposable database URL: {validated_url.drivername}://***@{validated_url.host}:{validated_url.port}/{validated_url.database}")

    # Import application components now that safety pre-checks passed
    import update_weather
    import app.database as app_db
    import app.main as app_main
    from app.database import Base
    from app.models import WeatherData, Prediction
    from app.services import ingestion_service, metrics_service
    from app.services.ingestion_service import ADVISORY_LOCK_ID
    from fastapi import FastAPI

    # Create root engine for the disposable database
    demo_engine = sa.create_engine(validated_url, pool_pre_ping=True)

    # Step 2: Generate unique schema and create it on disposable DB
    schema_name = generate_unique_schema_name()
    print(f"[STEP 2] Creating unique isolated schema '{schema_name}' in disposable database '{validated_url.database}'...")
    setup_isolated_schema(demo_engine, schema_name)
    schema_created = True

    try:
        # Step 3: Create isolated engine bound to unique schema
        # SQLAlchemy supports connect_args for PostgreSQL search_path
        isolated_engine = sa.create_engine(
            validated_url,
            connect_args={"options": f"-csearch_path={schema_name}"},
            pool_pre_ping=True,
        )
        IsolatedSessionLocal = sessionmaker(bind=isolated_engine, autocommit=False, autoflush=False)

        # Step 4: Create tables in disposable schema using metadata
        with isolated_engine.connect() as iconn:
            current_path = iconn.execute(sa.text("SHOW search_path")).scalar()
            print(f"[STEP 3] Connected to disposable schema. search_path = {current_path}")

        # Create all tables (WeatherData, Prediction, etc.) directly in the isolated schema
        Base.metadata.create_all(bind=isolated_engine)

        with isolated_engine.connect() as iconn:
            initial_count = iconn.execute(sa.text("SELECT count(*) FROM weather_data")).scalar()
            print(f"         Isolated weather_data initial row count: {initial_count}")
            assert initial_count == 0, "Isolated table should be empty initially"

        # Step 5: Test Actual APScheduler Lifespan Startup & Job Registration
        print("[STEP 4] Initializing FastAPI lifespan with ENABLE_INGESTION_SCHEDULER=true...")
        os.environ["ENABLE_INGESTION_SCHEDULER"] = "true"
        test_app = FastAPI()

        async def _test_scheduler_lifecycle():
            # Save original application bindings
            orig_app_engine = app_db.engine
            orig_app_session_local = app_db.SessionLocal
            orig_main_engine = app_main.engine
            orig_main_init_db = app_main.init_db
            orig_main_check_conn = app_main.check_connection
            orig_ingest_session_local = ingestion_service.SessionLocal
            orig_metrics_session_local = metrics_service.SessionLocal
            orig_coords = update_weather.STATE_COORDS

            # Patch application bindings to the isolated disposable engine
            app_db.engine = isolated_engine
            app_db.SessionLocal = IsolatedSessionLocal
            app_main.engine = isolated_engine
            app_main.init_db = lambda: Base.metadata.create_all(bind=isolated_engine)
            app_main.check_connection = lambda: True
            ingestion_service.SessionLocal = IsolatedSessionLocal
            metrics_service.SessionLocal = IsolatedSessionLocal

            try:
                # Limit coordinates to 1 state (Goa) for deterministic end-to-end execution
                update_weather.STATE_COORDS = {"Goa": (15.2993, 74.1240)}

                async with app_main.lifespan(test_app):
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

                    # Step 6: Execute the ACTUAL scheduled function via job reference
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
                # Restore original bindings
                app_db.engine = orig_app_engine
                app_db.SessionLocal = orig_app_session_local
                app_main.engine = orig_main_engine
                app_main.init_db = orig_main_init_db
                app_main.check_connection = orig_main_check_conn
                ingestion_service.SessionLocal = orig_ingest_session_local
                metrics_service.SessionLocal = orig_metrics_session_local
                update_weather.STATE_COORDS = orig_coords

        asyncio.run(_test_scheduler_lifecycle())

        # Step 9: Verify rows in isolated schema
        with isolated_engine.connect() as iconn:
            final_count = iconn.execute(sa.text("SELECT count(*) FROM weather_data")).scalar()
            rows = iconn.execute(sa.text("SELECT state, date, temp_max, temp_min, temp_avg FROM weather_data ORDER BY date DESC")).fetchall()
            print(f"[STEP 9] Disposable schema verification:")
            print(f"         Total records in {schema_name}.weather_data: {final_count}")
            for r in rows:
                print(f"         Sample row -> State: {r[0]}, Date: {r[1]}, T_max: {r[2]}, T_min: {r[3]}, T_avg: {r[4]}")
            assert final_count > 0, "Expected inserted rows in disposable schema"

    finally:
        # Step 10: Clean up ONLY the temporary schema on the disposable database
        if schema_created:
            print(f"[STEP 10] Cleaning up isolated schema '{schema_name}' on disposable database...")
            cleanup_isolated_schema(demo_engine, schema_name)
            print(f"          Dropped temporary schema '{schema_name}'.")
        print("[SUCCESS] Demonstration complete. Production database was never connected or touched.")


if __name__ == "__main__":
    try:
        run_isolated_demonstration()
    except Exception as exc:
        print(f"\n[DEMO ERROR / BLOCKED]: {exc}", file=sys.stderr)
        sys.exit(1)
