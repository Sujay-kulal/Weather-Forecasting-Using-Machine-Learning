from unittest.mock import MagicMock, call
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DatabaseError
from migrate_db import parse_args, validate_host, main, migrate, _constraint_exists


def test_parse_args_defaults():
    args = parse_args([])
    assert args.apply is False
    assert args.allow_host == []


def test_parse_args_flags():
    args = parse_args(["--apply", "--allow-host", "db", "--allow-host", "localhost,127.0.0.1"])
    assert args.apply is True
    assert args.allow_host == ["db", "localhost,127.0.0.1"]


def test_validate_host():
    assert validate_host("db", ["db"]) is True
    assert validate_host("DB", ["db"]) is True
    assert validate_host("localhost", ["db", "localhost"]) is True
    assert validate_host("prod.database.internal", ["db", "localhost"]) is False
    assert validate_host("db", []) is True  # no restriction if allow_host not passed


def test_main_rejects_disallowed_host():
    mock_engine = MagicMock()
    mock_engine.url.host = "unauthorized-remote-host"
    code = main(["--apply", "--allow-host", "db"], target_engine=mock_engine)
    assert code == 1


def test_main_dry_run_when_apply_omitted():
    mock_engine = MagicMock()
    mock_engine.url.host = "db"
    code = main(["--allow-host", "db"], target_engine=mock_engine)
    assert code == 0
    # Engine begin should not have been called in dry run mode
    mock_engine.begin.assert_not_called()


def test_main_applies_when_allowed():
    mock_engine = MagicMock()
    mock_engine.url.host = "db"
    code = main(["--apply", "--allow-host", "db"], target_engine=mock_engine)
    assert code == 0
    mock_engine.begin.assert_called_once()


def test_migrate_uses_begin_nested_savepoints_for_constraint_additions():
    """DEF-01 Regression: Verify migrate() uses begin_nested savepoints for constraint additions."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.begin.return_value.__enter__.return_value = mock_conn

    # pg_constraint returns None (constraint does not exist)
    mock_conn.execute.return_value.scalar.return_value = None

    nested_ctx = MagicMock()
    mock_conn.begin_nested.return_value = nested_ctx

    migrate(mock_engine)

    # Must invoke begin_nested() for savepoint protection
    assert mock_conn.begin_nested.call_count >= 3
    # Verify columns and constraints executed
    executed_statements = [str(call_args[0][0]) for call_args in mock_conn.execute.call_args_list]
    assert any("district" in stmt for stmt in executed_statements)
    assert any("uq_weather_state_dist_loc_date" in stmt for stmt in executed_statements)


def test_migrate_savepoint_rollback_on_duplicate_constraint_preserves_outer_transaction():
    """
    DEF-01 Regression: In PostgreSQL, if ADD CONSTRAINT raises DuplicateTable/DuplicateObject,
    the savepoint context must catch and roll back to savepoint without failing outer transaction.
    """
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.begin.return_value.__enter__.return_value = mock_conn

    # First constraint check returns False (proceeds to try ADD CONSTRAINT)
    mock_conn.execute.return_value.scalar.return_value = None

    class DuplicateConstraintError(DatabaseError):
        pass

    executed_ddl = []

    def mock_execute(stmt, *args, **kwargs):
        s = str(stmt)
        executed_ddl.append(s)
        if "ADD CONSTRAINT uq_weather_state_dist_loc_date" in s:
            raise DuplicateConstraintError("relation already exists", {}, None)
        res = MagicMock()
        res.scalar.return_value = None
        return res

    mock_conn.execute.side_effect = mock_execute

    # Run migrate - must NOT raise InFailedSqlTransaction or DuplicateConstraintError
    migrate(mock_engine)

    # Subsequent statements must still execute after the duplicate constraint error
    assert any("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS district" in s for s in executed_ddl)
    assert any("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS model_version" in s for s in executed_ddl)

    # Genuine migration errors (non-duplicate) must NOT be swallowed and must remain visible
    def mock_execute_fatal(stmt, *args, **kwargs):
        if "ADD CONSTRAINT uq_weather_state_dist_loc_date" in str(stmt):
            raise DatabaseError("disk I/O failure or permission denied", {}, None)
        res = MagicMock()
        res.scalar.return_value = None
        return res

    mock_conn.execute.side_effect = mock_execute_fatal
    with pytest.raises(DatabaseError, match="disk I/O failure or permission denied"):
        migrate(mock_engine)


def test_constraint_exists_helper():
    """Verify _constraint_exists queries pg_constraint properly."""
    mock_conn = MagicMock()
    mock_conn.execute.return_value.scalar.return_value = 1
    assert _constraint_exists(mock_conn, "uq_test") is True

    mock_conn.execute.return_value.scalar.return_value = None
    assert _constraint_exists(mock_conn, "uq_test") is False

    mock_conn.execute.side_effect = RuntimeError("Syntax error or not postgres")
    assert _constraint_exists(mock_conn, "uq_test") is False


def test_fresh_database_initialization():
    """Verify fresh database initialization creates all core ORM tables and columns."""
    from sqlalchemy import inspect
    from app.database import init_db

    fresh_engine = create_engine("sqlite:///:memory:")
    insp_before = inspect(fresh_engine)
    assert len(insp_before.get_table_names()) == 0

    init_db(fresh_engine)

    insp_after = inspect(fresh_engine)
    tables = set(insp_after.get_table_names())
    assert {"weather_data", "predictions", "weather_location_metadata", "weather_import_batches"}.issubset(tables)

    weather_cols = {c["name"] for c in insp_after.get_columns("weather_data")}
    assert {"id", "date", "state", "district", "location", "temp_max", "temp_min", "temp_avg", "humidity", "rainfall"}.issubset(weather_cols)

    pred_cols = {c["name"] for c in insp_after.get_columns("predictions")}
    assert {"id", "state", "district", "location", "forecast_date", "model_version", "actual_temp"}.issubset(pred_cols)


def test_migration_against_existing_legacy_database_schema():
    """Verify migration correctly upgrades an existing schema that lacks new columns."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.begin.return_value.__enter__.return_value = mock_conn
    mock_conn.execute.return_value.scalar.return_value = None

    executed_ddl = []
    def mock_execute(stmt, *args, **kwargs):
        executed_ddl.append(str(stmt))
        res = MagicMock()
        res.scalar.return_value = None
        return res

    mock_conn.execute.side_effect = mock_execute

    migrate(mock_engine)

    # Verify alter table additions for all modern columns
    assert any("ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS district" in s for s in executed_ddl)
    assert any("ALTER TABLE weather_data ADD COLUMN IF NOT EXISTS location" in s for s in executed_ddl)
    assert any("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS district" in s for s in executed_ddl)
    assert any("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS location" in s for s in executed_ddl)
    assert any("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS model_version" in s for s in executed_ddl)
    assert any("ALTER TABLE predictions ADD COLUMN IF NOT EXISTS actual_temp" in s for s in executed_ddl)


def test_repeated_migration_execution_is_idempotent():
    """Verify migrate() can be executed multiple times without failure or state corruption."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.begin.return_value.__enter__.return_value = mock_conn
    mock_conn.execute.return_value.scalar.return_value = None

    # First run
    migrate(mock_engine)

    # Second run (simulating existing constraints)
    mock_conn.execute.return_value.scalar.return_value = 1
    migrate(mock_engine)

    # Third run (simulating duplicate constraint race condition)
    class DuplicateConstraintError(DatabaseError):
        pass

    def mock_execute_dup(stmt, *args, **kwargs):
        if "ADD CONSTRAINT" in str(stmt):
            raise DuplicateConstraintError("already exists", {}, None)
        res = MagicMock()
        res.scalar.return_value = None
        return res

    mock_conn.execute.side_effect = mock_execute_dup
    migrate(mock_engine)


def test_existing_database_data_preservation():
    """Verify init_db and schema initialization preserve existing table records."""
    from app.database import init_db

    mem_engine = create_engine("sqlite:///:memory:")
    # Initialize schema
    init_db(mem_engine)

    # Insert sample records
    with mem_engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO weather_data (date, state, district, location, temp_max, temp_min, temp_avg, humidity, rainfall) "
            "VALUES ('2026-10-01', 'Karnataka', '', '', 31.5, 22.0, 26.75, 65.0, 0.0), "
            "       ('2026-10-02', 'Maharashtra', '', '', 33.0, 24.0, 28.5, 70.0, 2.5);"
        ))

    # Verify records exist before repeated init
    with mem_engine.connect() as conn:
        count_before = conn.execute(text("SELECT count(*) FROM weather_data")).scalar()
        assert count_before == 2

    # Re-run init_db (must NOT drop or truncate existing data)
    init_db(mem_engine)

    with mem_engine.connect() as conn:
        rows = conn.execute(text("SELECT state, temp_avg FROM weather_data ORDER BY date")).fetchall()
        assert len(rows) == 2
        assert rows[0] == ("Karnataka", 26.75)
        assert rows[1] == ("Maharashtra", 28.5)


def test_migration_failure_produces_nonzero_exit_status(capsys):
    """Verify main() catches fatal database migration failures and returns nonzero status (1)."""
    mock_engine = MagicMock()
    mock_engine.url.host = "db"
    mock_conn = MagicMock()
    mock_engine.begin.return_value.__enter__.return_value = mock_conn

    def mock_execute_fail(stmt, *args, **kwargs):
        if "ALTER TABLE weather_data" in str(stmt):
            raise DatabaseError("disk failure or permission denied", {}, None)
        res = MagicMock()
        res.scalar.return_value = None
        return res

    mock_conn.execute.side_effect = mock_execute_fail

    code = main(["--apply", "--allow-host", "db"], target_engine=mock_engine)
    assert code == 1

    captured = capsys.readouterr()
    assert "Database migration failed" in captured.err
