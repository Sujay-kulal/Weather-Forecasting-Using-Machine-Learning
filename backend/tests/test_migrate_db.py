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


def test_constraint_exists_helper():
    """Verify _constraint_exists queries pg_constraint properly."""
    mock_conn = MagicMock()
    mock_conn.execute.return_value.scalar.return_value = 1
    assert _constraint_exists(mock_conn, "uq_test") is True

    mock_conn.execute.return_value.scalar.return_value = None
    assert _constraint_exists(mock_conn, "uq_test") is False

    mock_conn.execute.side_effect = RuntimeError("Syntax error or not postgres")
    assert _constraint_exists(mock_conn, "uq_test") is False
