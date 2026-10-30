"""
Run the real scheduler/ingestion path against a separate disposable PostgreSQL database.

Required environment variable:
    SCHEDULER_DEMO_DATABASE_URL=postgresql+psycopg://.../weather_scheduler_demo

The database name MUST end in _test, _demo, _disposable, or _sandbox.
This script never reads backend/.env, never falls back to DATABASE_URL, and
never connects to the production database. It creates a unique temporary
schema only inside the explicitly supplied disposable database.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import sessionmaker


ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

ALLOWED_DB_SUFFIXES = ("_test", "_demo", "_disposable", "_sandbox")
PRODUCTION_DATABASE_NAMES = {"weather_forecasting"}


def _database_identity(url: URL) -> tuple[str | None, int | None, str | None]:
    return (url.host, url.port, url.database)


def validate_demo_database_url(raw_url: str | None, production_url: str | None = None) -> URL:
    """Fail closed unless an explicitly named disposable database is supplied."""
    if not raw_url:
        raise RuntimeError(
            "Set SCHEDULER_DEMO_DATABASE_URL to a separate disposable PostgreSQL database. "
            "There is deliberately no DATABASE_URL or backend/.env fallback."
        )

    try:
        demo_url = make_url(raw_url)
    except Exception as exc:
        raise RuntimeError("SCHEDULER_DEMO_DATABASE_URL is not a valid SQLAlchemy URL.") from exc

    if not demo_url.drivername.startswith("postgresql"):
        raise RuntimeError("Scheduler demonstration requires PostgreSQL; SQLite is not supported.")

    database_name = (demo_url.database or "").lower()
    if database_name in PRODUCTION_DATABASE_NAMES:
        raise RuntimeError("Refusing to run against the protected production database.")
    if not database_name.endswith(ALLOWED_DB_SUFFIXES):
        raise RuntimeError(
            "Refusing database name without an explicit disposable suffix. "
            "Use a database ending in _test, _demo, _disposable, or _sandbox."
        )

    if production_url:
        try:
            production_identity = _database_identity(make_url(production_url))
        except Exception:
            production_identity = None
        if production_identity and _database_identity(demo_url) == production_identity:
            raise RuntimeError("Refusing to run against the configured application database.")

    return demo_url


def run_isolated_demonstration() -> None:
    original_database_url = os.environ.get("DATABASE_URL")
    demo_url = validate_demo_database_url(
        os.environ.get("SCHEDULER_DEMO_DATABASE_URL"),
        production_url=original_database_url,
    )

    # Set this BEFORE importing app modules. app.database loads backend/.env
    # with override=False, so this explicit disposable URL remains authoritative.
    os.environ["DATABASE_URL"] = demo_url.render_as_string(hide_password=False)
    os.environ["ENABLE_INGESTION_SCHEDULER"] = "true"

    import app.database as database_module
    from app.database import Base
    from app.main import lifespan
    from app.services import ingestion_service
    from app.services.ingestion_service import ADVISORY_LOCK_ID
    import update_weather
    from fastapi import FastAPI

    schema_name = f"scheduler_demo_{uuid.uuid4().hex}"
    engine = sa.create_engine(
        demo_url,
        pool_pre_ping=True,
        connect_args={"options": f"-csearch_path={schema_name},public"},
    )
    schema_created = False
    original_session_local = ingestion_service.SessionLocal
    original_coords = update_weather.STATE_COORDS
    original_app_engine = database_module.engine

    try:
        with engine.begin() as conn:
            actual_db = conn.execute(sa.text("SELECT current_database()")).scalar_one()
            if actual_db != demo_url.database:
                raise RuntimeError("Connected database name does not match the validated disposable database.")
            conn.execute(sa.text(f'CREATE SCHEMA "{schema_name}"'))
            schema_created = True

        # Route the application's own lifespan/init_db engine to the same
        # disposable schema. Without this assignment, init_db() would use the
        # default engine and could create tables in public.
        database_module.engine = engine

        # Build tables from the repository's ORM metadata inside the unique
        # schema. No production tables are copied or referenced.
        Base.metadata.create_all(bind=engine)
        isolated_session_local = sessionmaker(bind=engine, autocommit=False, autoflush=False)

        with engine.connect() as conn:
            initial_count = conn.execute(sa.text("SELECT count(*) FROM weather_data")).scalar_one()
            search_path = conn.execute(sa.text("SHOW search_path")).scalar_one()
            print(f"[1] Disposable database: {actual_db}")
            print(f"[2] Unique temporary schema: {schema_name}")
            print(f"[3] search_path: {search_path}; initial weather_data rows: {initial_count}")
            assert initial_count == 0, "Temporary weather_data table must start empty."

        async def execute_lifecycle() -> None:
            nonlocal original_session_local, original_coords
            ingestion_service.SessionLocal = isolated_session_local
            update_weather.STATE_COORDS = {"Goa": (15.2993, 74.1240)}
            app = FastAPI()

            async with lifespan(app):
                scheduler = getattr(app.state, "scheduler", None)
                assert scheduler is not None and scheduler.running
                jobs = {job.id: job for job in scheduler.get_jobs()}
                assert "daily_weather_ingest" in jobs
                assert "fill_prediction_actuals" in jobs
                ingest_job = jobs["daily_weather_ingest"]

                print("[4] FastAPI lifespan and APScheduler started.")
                started = time.monotonic()
                first = ingest_job.func(days_back=2)
                print(f"[5] Live ingestion result: {first}")
                assert first["status"] == "success"
                assert first["records_upserted"] > 0
                print(f"    Execution time: {time.monotonic() - started:.2f}s")

                second = ingest_job.func(days_back=2)
                assert second["status"] == "success"
                print(f"[6] Idempotent upsert rerun: {second}")

                with engine.connect() as lock_conn:
                    lock_conn.execute(sa.text(f"SELECT pg_advisory_lock({ADVISORY_LOCK_ID})"))
                    try:
                        contention = ingest_job.func(days_back=1)
                        assert contention == {
                            "status": "skipped",
                            "reason": "advisory_lock_held",
                        }
                        print(f"[7] Advisory lock contention handled: {contention}")
                    finally:
                        lock_conn.execute(sa.text(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_ID})"))

            assert scheduler.running is False
            print("[8] FastAPI lifespan exited; APScheduler stopped cleanly.")

        asyncio.run(execute_lifecycle())

        with engine.connect() as conn:
            final_count = conn.execute(sa.text("SELECT count(*) FROM weather_data")).scalar_one()
            rows = conn.execute(
                sa.text("SELECT state, date, temp_max, temp_min, temp_avg "
                        "FROM weather_data ORDER BY date DESC")
            ).fetchall()
            print(f"[9] Temporary schema contains {final_count} weather rows.")
            for row in rows:
                print(f"    {row.state}: {row.date}, max={row.temp_max}, min={row.temp_min}, avg={row.temp_avg}")
            assert final_count > 0

        print("[PASS] Scheduler demonstration ran entirely inside the disposable database.")

    finally:
        ingestion_service.SessionLocal = original_session_local
        update_weather.STATE_COORDS = original_coords
        database_module.engine = original_app_engine
        engine.dispose()
        if schema_created:
            # Only the UUID schema created by this invocation is dropped.
            cleanup_engine = sa.create_engine(demo_url, pool_pre_ping=True)
            try:
                with cleanup_engine.begin() as conn:
                    conn.execute(sa.text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
            finally:
                cleanup_engine.dispose()
        print(f"[10] Removed only temporary schema {schema_name} from disposable database.")


if __name__ == "__main__":
    run_isolated_demonstration()
