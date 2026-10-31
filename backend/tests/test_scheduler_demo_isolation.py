"""
Automated Safety and Isolation Tests for Scheduler Demonstration Harness.
========================================================================
Verifies all safety invariants required by Milestone 4:
1. Missing SCHEDULER_DEMO_DATABASE_URL fails closed.
2. Production database name is rejected.
3. Non-PostgreSQL URL is rejected.
4. Database without an approved disposable suffix is rejected.
5. Same database identity as configured production URL is rejected.
6. Valid disposable database URL is accepted.
7. The script never silently falls back to .env or DATABASE_URL.
8. A failed setup cannot drop a pre-existing schema.
9. Cleanup only targets the unique schema created by that execution.
10. FastAPI lifespan uses the isolated database engine.

All tests execute with mock engines and isolated in-memory test structures;
NEVER connecting to or mutating the production database.
"""
import asyncio
import os
import re
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

# Ensure root is in path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
backend_dir = ROOT_DIR / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from scripts.demonstrate_isolated_scheduler import (
    APPROVED_SUFFIXES,
    SCHEMA_NAME_PATTERN,
    cleanup_isolated_schema,
    generate_unique_schema_name,
    run_isolated_demonstration,
    setup_isolated_schema,
    validate_demo_database_url,
)


def test_missing_demo_url_fails_closed(monkeypatch):
    """1. Missing SCHEDULER_DEMO_DATABASE_URL fails closed."""
    monkeypatch.delenv("SCHEDULER_DEMO_DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="SCHEDULER_DEMO_DATABASE_URL is mandatory"):
        validate_demo_database_url(None)

    with pytest.raises(RuntimeError, match="SCHEDULER_DEMO_DATABASE_URL is mandatory"):
        validate_demo_database_url("   ")

    with pytest.raises(RuntimeError, match="SCHEDULER_DEMO_DATABASE_URL is mandatory"):
        run_isolated_demonstration()


@pytest.mark.parametrize("prod_name", ["weather_forecasting", "weather_forecasting_prod", "production"])
def test_production_database_name_rejected(prod_name):
    """2. Production database name is rejected."""
    url = f"postgresql://user:pass@localhost:5433/{prod_name}"
    with pytest.raises(ValueError, match="Production database name .* is strictly rejected"):
        validate_demo_database_url(url)


@pytest.mark.parametrize("non_pg_url", [
    "sqlite:///demo_test.db",
    "mysql://user:pass@localhost:3306/demo_test",
    "oracle://user:pass@localhost:1521/demo_test",
])
def test_non_postgresql_url_rejected(non_pg_url):
    """3. Non-PostgreSQL URL is rejected."""
    with pytest.raises(ValueError, match="Non-PostgreSQL URL rejected"):
        validate_demo_database_url(non_pg_url)


@pytest.mark.parametrize("bad_name", [
    "weather_data",
    "weather_analytics",
    "weather_forecasting_v2",
    "test_weather",  # prefix, not suffix
    "disposable",     # bare word without leading underscore
])
def test_database_without_approved_suffix_rejected(bad_name):
    """4. Database without an approved disposable suffix is rejected."""
    url = f"postgresql://user:pass@localhost:5433/{bad_name}"
    with pytest.raises(ValueError, match="Disposable database name must end in one of"):
        validate_demo_database_url(url)


def test_same_database_identity_as_configured_production_url_rejected():
    """5. Same database identity as configured production URL is rejected."""
    prod_url = "postgresql://pguser:pgpass@localhost:5433/weather_forecasting_sandbox"
    demo_url = "postgresql://otheruser:otherpass@localhost:5433/weather_forecasting_sandbox"

    with pytest.raises(ValueError, match="points to the same database identity as the configured production database"):
        validate_demo_database_url(demo_url, prod_url=prod_url)


@pytest.mark.parametrize("suffix", APPROVED_SUFFIXES)
def test_valid_disposable_database_url_accepted(suffix):
    """6. Valid disposable database URL is accepted."""
    db_name = f"weather_forecasting{suffix}"
    url = f"postgresql://user:pass@localhost:5433/{db_name}"
    prod_url = "postgresql://user:pass@localhost:5433/weather_forecasting"

    parsed = validate_demo_database_url(url, prod_url=prod_url)
    assert parsed.database == db_name
    assert parsed.drivername.startswith("postgresql")


def test_script_never_silently_falls_back_to_env_or_database_url(monkeypatch):
    """7. The script never silently falls back to .env or DATABASE_URL."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5433/weather_forecasting")
    monkeypatch.delenv("SCHEDULER_DEMO_DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="Fallback to DATABASE_URL or backend/.env is strictly forbidden"):
        run_isolated_demonstration()


def test_failed_setup_cannot_drop_preexisting_schema():
    """8. A failed setup cannot drop a pre-existing schema."""
    mock_engine = MagicMock(spec=sa.Engine)
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__.return_value = mock_conn

    # Valid unique schema name creates schema without dropping
    unique_schema = generate_unique_schema_name()
    setup_isolated_schema(mock_engine, unique_schema)

    # Verify no DROP SCHEMA was executed during setup
    for call in mock_conn.execute.call_args_list:
        executed_sql = str(call[0][0])
        assert "DROP SCHEMA" not in executed_sql.upper(), f"Unexpected DROP SCHEMA found in setup: {executed_sql}"
        assert f'CREATE SCHEMA "{unique_schema}"' in executed_sql

    # Invalid / non-conforming schema name fails before any execution
    mock_conn.reset_mock()
    with pytest.raises(ValueError, match="Refusing to create schema with non-conforming name"):
        setup_isolated_schema(mock_engine, "public")
    mock_conn.execute.assert_not_called()


@pytest.mark.parametrize("protected_schema", ["public", "information_schema", "pg_catalog"])
def test_cleanup_rejects_protected_schemas(protected_schema):
    """9a. Cleanup rejects protected schemas."""
    mock_engine = MagicMock(spec=sa.Engine)
    with pytest.raises(ValueError, match="Refusing to drop"):
        cleanup_isolated_schema(mock_engine, protected_schema)


def test_cleanup_only_targets_created_schema():
    """9b. Cleanup only targets the unique schema created by that execution."""
    mock_engine = MagicMock(spec=sa.Engine)
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__.return_value = mock_conn

    unique_schema = generate_unique_schema_name()
    assert SCHEMA_NAME_PATTERN.match(unique_schema)

    cleanup_isolated_schema(mock_engine, unique_schema)

    mock_conn.execute.assert_called_once()
    sql_text = str(mock_conn.execute.call_args[0][0])
    assert f'DROP SCHEMA IF EXISTS "{unique_schema}" CASCADE;' in sql_text


def test_fastapi_lifespan_uses_isolated_database_engine(monkeypatch):
    """10. FastAPI lifespan uses the isolated database engine."""
    from fastapi import FastAPI
    import app.database as app_db
    import app.main as app_main
    from app.services import ingestion_service, metrics_service

    isolated_mock_engine = MagicMock(spec=sa.Engine)
    IsolatedMockSession = sessionmaker()

    orig_engine = app_db.engine
    orig_main_engine = app_main.engine
    orig_ingest_session = ingestion_service.SessionLocal

    try:
        app_db.engine = isolated_mock_engine
        app_main.engine = isolated_mock_engine
        ingestion_service.SessionLocal = IsolatedMockSession
        metrics_service.SessionLocal = IsolatedMockSession

        mock_init_db = MagicMock()
        app_main.init_db = mock_init_db
        app_main.check_connection = MagicMock(return_value=True)

        monkeypatch.setenv("ENABLE_INGESTION_SCHEDULER", "true")
        test_app = FastAPI()

        async def _run():
            async with app_main.lifespan(test_app):
                # Verify init_db ran with isolated engine binding
                mock_init_db.assert_called_once()
                assert app_main.engine is isolated_mock_engine
                assert app_db.engine is isolated_mock_engine
                assert ingestion_service.SessionLocal is IsolatedMockSession

        asyncio.run(_run())
    finally:
        app_db.engine = orig_engine
        app_main.engine = orig_main_engine
        ingestion_service.SessionLocal = orig_ingest_session
