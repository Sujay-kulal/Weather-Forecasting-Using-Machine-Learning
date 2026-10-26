"""Explicit, idempotent PostgreSQL schema migration for this application.

Run from the backend directory with ``python migrate_db.py --apply``. The
application itself never changes the database schema during normal startup.
"""
import argparse
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Connection

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))


def _constraint_definition(conn: Connection, table: str, name: str) -> str | None:
    return conn.execute(
        text("""
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = to_regclass(:table) AND conname = :name
        """),
        {"table": table, "name": name},
    ).scalar_one_or_none()


def _duplicate_groups(conn: Connection, query: str) -> int:
    return int(conn.execute(text(query)).scalar_one())


def upgrade(conn: Connection) -> None:
    """Create current tables, add location columns, and remove legacy keys."""
    # Fresh databases are created from the current ORM definitions. Existing
    # databases are upgraded below; create_all intentionally does not migrate
    # existing tables.
    from app.database import Base
    import app.models  # noqa: F401 - register the ORM tables on Base

    Base.metadata.create_all(bind=conn)

    conn.execute(text(
        "ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS "
        "district VARCHAR(100) NOT NULL DEFAULT ''"
    ))
    conn.execute(text(
        "ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS "
        "location VARCHAR(100) NOT NULL DEFAULT ''"
    ))
    conn.execute(text(
        "ALTER TABLE predictions ADD COLUMN IF NOT EXISTS "
        "district VARCHAR(100) NOT NULL DEFAULT ''"
    ))
    conn.execute(text(
        "ALTER TABLE predictions ADD COLUMN IF NOT EXISTS "
        "location VARCHAR(100) NOT NULL DEFAULT ''"
    ))
    for statement in (
        "CREATE INDEX IF NOT EXISTS ix_weather_data_date ON weather_data (date)",
        "CREATE INDEX IF NOT EXISTS ix_weather_data_state ON weather_data (state)",
        "CREATE INDEX IF NOT EXISTS ix_weather_data_district ON weather_data (district)",
        "CREATE INDEX IF NOT EXISTS ix_weather_data_location ON weather_data (location)",
        "CREATE INDEX IF NOT EXISTS ix_predictions_state ON predictions (state)",
        "CREATE INDEX IF NOT EXISTS ix_predictions_forecast_date ON predictions (forecast_date)",
        "CREATE INDEX IF NOT EXISTS ix_predictions_district ON predictions (district)",
        "CREATE INDEX IF NOT EXISTS ix_predictions_location ON predictions (location)",
    ):
        conn.execute(text(statement))

    current = _constraint_definition(
        conn, "weather_data", "uq_weather_state_dist_loc_date"
    )
    if current is None:
        duplicates = _duplicate_groups(conn, """
            SELECT count(*) FROM (
                SELECT state, district, location, date
                FROM weather_data
                GROUP BY state, district, location, date
                HAVING count(*) > 1
            ) AS duplicate_keys
        """)
        if duplicates:
            raise RuntimeError(
                f"Cannot add weather location uniqueness: {duplicates} duplicate key groups exist."
            )
        conn.execute(text(
            "ALTER TABLE weather_data ADD CONSTRAINT "
            "uq_weather_state_dist_loc_date "
            "UNIQUE (state, district, location, date)"
        ))
    elif current != "UNIQUE (state, district, location, date)":
        raise RuntimeError(
            "Constraint uq_weather_state_dist_loc_date exists with an unexpected definition."
        )

    legacy = _constraint_definition(conn, "weather_data", "uq_weather_state_date")
    if legacy is not None:
        if legacy != "UNIQUE (state, date)":
            raise RuntimeError(
                "Constraint uq_weather_state_date exists with an unexpected definition."
            )
        conn.execute(text(
            "ALTER TABLE weather_data DROP CONSTRAINT uq_weather_state_date"
        ))

    old_prediction = _constraint_definition(conn, "predictions", "uq_prediction_run")
    if old_prediction is not None:
        conn.execute(text(
            "ALTER TABLE predictions DROP CONSTRAINT uq_prediction_run"
        ))

    prediction = _constraint_definition(
        conn, "predictions", "uq_prediction_run_dist_loc"
    )
    expected_prediction = (
        "UNIQUE (state, district, location, forecast_date, created_at)"
    )
    if prediction is None:
        duplicates = _duplicate_groups(conn, """
            SELECT count(*) FROM (
                SELECT state, district, location, forecast_date, created_at
                FROM predictions
                GROUP BY state, district, location, forecast_date, created_at
                HAVING count(*) > 1
            ) AS duplicate_keys
        """)
        if duplicates:
            raise RuntimeError(
                f"Cannot add prediction uniqueness: {duplicates} duplicate key groups exist."
            )
        conn.execute(text(
            "ALTER TABLE predictions ADD CONSTRAINT "
            "uq_prediction_run_dist_loc "
            "UNIQUE (state, district, location, forecast_date, created_at)"
        ))
    elif prediction != expected_prediction:
        raise RuntimeError(
            "Constraint uq_prediction_run_dist_loc exists with an unexpected definition."
        )


def downgrade(conn: Connection) -> None:
    """Restore legacy constraints only when the old state/date key is valid."""
    weather_locations = int(conn.execute(text(
        "SELECT count(*) FROM weather_data "
        "WHERE district <> '' OR location <> ''"
    )).scalar_one())
    if weather_locations:
        raise RuntimeError(
            "Cannot downgrade: location-specific weather rows would be incompatible "
            "with the legacy (state, date) key."
        )

    weather_duplicates = _duplicate_groups(conn, """
        SELECT count(*) FROM (
            SELECT state, date FROM weather_data
            GROUP BY state, date HAVING count(*) > 1
        ) AS duplicate_keys
    """)
    if weather_duplicates:
        raise RuntimeError(
            f"Cannot downgrade: {weather_duplicates} duplicate (state, date) groups exist."
        )

    prediction_locations = int(conn.execute(text(
        "SELECT count(*) FROM predictions "
        "WHERE district <> '' OR location <> ''"
    )).scalar_one())
    if prediction_locations:
        raise RuntimeError(
            "Cannot downgrade: location-specific predictions would be incompatible "
            "with the legacy prediction key."
        )

    old_prediction_duplicates = _duplicate_groups(conn, """
        SELECT count(*) FROM (
            SELECT state, forecast_date, created_at FROM predictions
            GROUP BY state, forecast_date, created_at HAVING count(*) > 1
        ) AS duplicate_keys
    """)
    if old_prediction_duplicates:
        raise RuntimeError(
            "Cannot downgrade: duplicate legacy prediction key groups exist."
        )

    if _constraint_definition(conn, "weather_data", "uq_weather_state_date") is None:
        conn.execute(text(
            "ALTER TABLE weather_data ADD CONSTRAINT uq_weather_state_date "
            "UNIQUE (state, date)"
        ))
    if _constraint_definition(conn, "predictions", "uq_prediction_run") is None:
        conn.execute(text(
            "ALTER TABLE predictions ADD CONSTRAINT uq_prediction_run "
            "UNIQUE (state, forecast_date, created_at)"
        ))

    conn.execute(text(
        "ALTER TABLE weather_data DROP CONSTRAINT IF EXISTS "
        "uq_weather_state_dist_loc_date"
    ))
    conn.execute(text(
        "ALTER TABLE predictions DROP CONSTRAINT IF EXISTS "
        "uq_prediction_run_dist_loc"
    ))
    conn.execute(text("ALTER TABLE weather_data DROP COLUMN IF EXISTS location"))
    conn.execute(text("ALTER TABLE weather_data DROP COLUMN IF EXISTS district"))
    conn.execute(text("ALTER TABLE predictions DROP COLUMN IF EXISTS location"))
    conn.execute(text("ALTER TABLE predictions DROP COLUMN IF EXISTS district"))
    conn.execute(text("DROP TABLE IF EXISTS weather_import_batches"))
    conn.execute(text("DROP TABLE IF EXISTS weather_location_metadata"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--apply", action="store_true", help="Apply the schema upgrade")
    action.add_argument("--downgrade", action="store_true", help="Restore the legacy schema")
    parser.add_argument(
        "--allow-host",
        help="Required exact database hostname acknowledgement for non-local targets",
    )
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR / ".env")
    from app.database import engine
    host = engine.url.host
    local_hosts = {"localhost", "127.0.0.1", "::1"}
    if host not in local_hosts and args.allow_host != host:
        parser.error(
            f"database host {host!r} is non-local; repeat it explicitly with --allow-host {host}"
        )
    if args.allow_host is not None and args.allow_host != host:
        parser.error(f"--allow-host does not match configured database host {host!r}")

    operation = downgrade if args.downgrade else upgrade
    print(f"Applying schema {'downgrade' if args.downgrade else 'upgrade'} to database {engine.url.database!r} on host {host!r}.")
    with engine.begin() as conn:
        operation(conn)
    print("Schema downgrade completed." if args.downgrade else "Schema upgrade completed.")


if __name__ == "__main__":
    main()
