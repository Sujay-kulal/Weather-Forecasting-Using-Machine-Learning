import argparse
import sys
from pathlib import Path
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.database import engine, init_db


def _constraint_exists(conn, constraint_name: str) -> bool:
    """Check if a constraint already exists in the database (e.g. PostgreSQL pg_constraint)."""
    try:
        query = text("SELECT 1 FROM pg_constraint WHERE conname = :conname")
        res = conn.execute(query, {"conname": constraint_name}).scalar()
        if res:
            return True
    except Exception:
        pass
    return False


def _is_duplicate_constraint_error(exc: Exception) -> bool:
    """Return True if the error is specifically a duplicate constraint or object in PostgreSQL/SQLAlchemy."""
    orig = getattr(exc, "orig", None)
    pgcode = getattr(orig, "pgcode", None) or getattr(exc, "pgcode", None)
    if pgcode in ("42710", "42P07"):
        return True

    msg = str(exc).lower()
    return "already exists" in msg or "duplicate" in msg


def migrate(target_engine=None):
    eng = target_engine or engine
    # Ensure all base ORM tables exist before running ALTER TABLE migrations
    init_db(eng)
    with eng.begin() as conn:
        conn.execute(text("ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS district VARCHAR(100) NOT NULL DEFAULT '';"))
        conn.execute(text("ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS location VARCHAR(100) NOT NULL DEFAULT '';"))
        conn.execute(text("ALTER TABLE weather_data DROP CONSTRAINT IF EXISTS uq_weather_state_date;"))

        # Add unique constraint on weather_data with savepoint and existence check for rerun safety
        if not _constraint_exists(conn, "uq_weather_state_dist_loc_date"):
            try:
                with conn.begin_nested():
                    conn.execute(text(
                        "ALTER TABLE weather_data ADD CONSTRAINT uq_weather_state_dist_loc_date "
                        "UNIQUE (state, district, location, date);"
                    ))
            except Exception as exc:
                if not _is_duplicate_constraint_error(exc):
                    raise

        conn.execute(text("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS district VARCHAR(100) NOT NULL DEFAULT '';"))
        conn.execute(text("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS location VARCHAR(100) NOT NULL DEFAULT '';"))
        conn.execute(text("ALTER TABLE predictions DROP CONSTRAINT IF EXISTS uq_prediction_run;"))

        # Add unique constraint on predictions with savepoint and existence check for rerun safety
        if not _constraint_exists(conn, "uq_prediction_run_dist_loc"):
            try:
                with conn.begin_nested():
                    conn.execute(text(
                        "ALTER TABLE predictions ADD CONSTRAINT uq_prediction_run_dist_loc "
                        "UNIQUE (state, district, location, forecast_date, created_at);"
                    ))
            except Exception as exc:
                if not _is_duplicate_constraint_error(exc):
                    raise

        conn.execute(text("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS model_version VARCHAR(100);"))
        conn.execute(text("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS actual_temp DOUBLE PRECISION;"))

        # Add unique constraint on predictions model_version with savepoint and existence check
        if not _constraint_exists(conn, "uq_prediction_state_location_date_model_version"):
            try:
                with conn.begin_nested():
                    conn.execute(text(
                        "ALTER TABLE predictions ADD CONSTRAINT uq_prediction_state_location_date_model_version "
                        "UNIQUE (state, district, location, forecast_date, model_version);"
                    ))
            except Exception as exc:
                if not _is_duplicate_constraint_error(exc):
                    raise

        # Ensure index parity with ORM model definitions for migrated columns
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_weather_data_district ON weather_data (district);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_weather_data_location ON weather_data (location);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_predictions_district ON predictions (district);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_predictions_location ON predictions (location);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_predictions_model_version ON predictions (model_version);"))


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Idempotent database schema migration for Weather Forecasting API."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        default=False,
        help="Apply database migrations. If not specified, dry-run mode is active and no schema changes occur.",
    )
    parser.add_argument(
        "--allow-host",
        action="append",
        default=[],
        help="Allowed database host(s) (e.g. 'db', 'localhost'). Can be passed multiple times or comma-separated.",
    )
    return parser.parse_args(argv)


def validate_host(db_host: str | None, raw_allowed_hosts: list[str]) -> bool:
    """Validate that the database host is within the allowed hosts list."""
    if not raw_allowed_hosts:
        return True

    allowed_set = set()
    for item in raw_allowed_hosts:
        for host in item.split(","):
            cleaned = host.strip()
            if cleaned:
                allowed_set.add(cleaned.lower())

    if not allowed_set:
        return True

    # If database has no network host (e.g., SQLite file/memory), allow if explicit or local
    target_host = (db_host or "").strip().lower()
    return target_host in allowed_set


def main(argv=None, target_engine=None):
    args = parse_args(argv)
    eng = target_engine or engine

    # Validate host restriction
    db_host = getattr(eng.url, "host", None)
    if args.allow_host and not validate_host(db_host, args.allow_host):
        print(
            f"ERROR: Target database host '{db_host}' is not in allowed hosts: {args.allow_host}",
            file=sys.stderr,
        )
        return 1

    if not args.apply:
        print("Dry-run mode: migrations checked but not applied. Pass --apply to execute.")
        return 0

    try:
        migrate(eng)
    except Exception as exc:
        print(f"ERROR: Database migration failed: {exc}", file=sys.stderr)
        return 1

    print("Migration successful")
    return 0


if __name__ == "__main__":
    sys.exit(main())
