"""
Milestone 1 Comprehensive Regression Test Suite:
Backend, Database, Security & Ingestion Hardening.

Verifies:
1. init_db() startup failure handling and /health reporting degraded mode.
2. RFC 7807 Problem Details shape for 422 RequestValidationError and uncaught 500 exceptions.
3. Admin route sanitized exception messages (no stack or sensitive system leakage).
4. CORS origin rejection of wildcard '*' with credentials.
5. Database engine connection pool options and session rollback on exception.
6. Open-Meteo client retry behavior under transient network drops and rate-limit guard.
7. Offline consistency test script missing CSV guard and CLI execution.
"""
from email.message import Message
import json
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import database
from app.database import get_db, get_engine_kwargs, engine
from app.main import app, sanitize_cors_origins, parse_and_validate_cors_origins
from app.routes import admin
from app.services import open_meteo_service
from tests.test_consistency import run_consistency_check, CSV


# ---------------------------------------------------------------------------
# Requirement 1: Startup init_db() resilience & /health degraded reporting
# ---------------------------------------------------------------------------
def test_init_db_failure_at_startup_reports_degraded_health():
    """Verify that if init_db() fails during startup, the lifespan does not abort
    and /health reports status='degraded' and database='unreachable'."""
    with patch("app.main.init_db", side_effect=OperationalError("Connection refused", None, None)), \
         patch("app.main.check_connection", return_value=False), \
         patch("app.routes.health.check_connection", return_value=False):
        with TestClient(app) as client:
            resp = client.get("/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "degraded"
            assert data["database"] == "unreachable"


def test_init_db_success_reports_healthy():
    """Verify that normal healthy startup reports status='healthy' and database='connected'."""
    with patch("app.main.init_db") as mock_init, \
         patch("app.main.check_connection", return_value=True), \
         patch("app.routes.health.check_connection", return_value=True):
        with TestClient(app) as client:
            resp = client.get("/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "healthy"
            assert data["database"] == "connected"
            mock_init.assert_called_once()


# ---------------------------------------------------------------------------
# Requirement 2: RFC 7807 Problem Details shape for 422 & uncaught 500
# ---------------------------------------------------------------------------
def test_rfc7807_request_validation_error_422():
    """Verify that 422 RequestValidationError returns RFC 7807 Problem Details shape."""
    with patch("app.main.init_db"), \
         patch("app.main.check_connection", return_value=True):
        with TestClient(app) as client:
            resp = client.post("/weather/lookup", json={"bad_field": 123})
            assert resp.status_code == 422
            assert "application/problem+json" in resp.headers.get("content-type", "")
            data = resp.json()
            assert data.get("type") == "about:blank"
            assert data.get("status") == 422
            assert data.get("title") == "Unprocessable Entity"
            assert "detail" in data
            assert data.get("instance") == "/weather/lookup"
            assert isinstance(data["detail"], list)


def test_rfc7807_uncaught_500_exception_format():
    """Verify that an uncaught 500 exception returns RFC 7807 Problem Details and sanitized detail."""
    with patch("app.main.init_db"), \
         patch("app.main.check_connection", return_value=True):
        with TestClient(app, raise_server_exceptions=False) as client:
            with patch("app.routes.weather.resolve_location", side_effect=RuntimeError("Internal password secret123")):
                resp = client.get("/weather/Karnataka")
                assert resp.status_code == 500
                assert "application/problem+json" in resp.headers.get("content-type", "")
                data = resp.json()
                assert data.get("type") == "about:blank"
                assert data.get("title") == "Internal Server Error"
                assert data.get("status") == 500
                assert "secret123" not in str(data.get("detail"))
                assert data.get("instance") == "/weather/Karnataka"


# ---------------------------------------------------------------------------
# Requirement 3: Admin route sanitized exception messages
# ---------------------------------------------------------------------------
def test_admin_route_sanitizes_internal_exception_details():
    """Verify that unhandled exceptions during admin ingestion do not leak hostnames, passwords, or sockets in HTTP 500 responses."""
    app_admin = FastAPI()
    app_admin.include_router(admin.router)
    client = TestClient(app_admin)
    sensitive_message = "password=super_secret_db_pass host=prod-db.internal:5432 /tmp/.s.PGSQL.5432"

    with patch.dict(os.environ, {"ADMIN_TOKEN": "test-admin-secret"}), \
         patch("app.routes.admin.run_ingestion_with_lock", side_effect=Exception(sensitive_message)):
        resp = client.post("/admin/ingest", headers={"X-Admin-Token": "test-admin-secret"})
        assert resp.status_code == 500
        detail = str(resp.json()["detail"])
        assert "super_secret_db_pass" not in detail
        assert "prod-db.internal" not in detail
        assert "/tmp/.s.PGSQL" not in detail
        assert "Weather data ingestion failed due to an internal server error." in detail


# ---------------------------------------------------------------------------
# Requirement 4: CORS origin rejection of wildcard '*' with credentials
# ---------------------------------------------------------------------------
def test_cors_origin_sanitizer_rejects_wildcard():
    """Verify that wildcard '*' is stripped from CORS allowed origins."""
    assert "*" not in sanitize_cors_origins("*")
    assert sanitize_cors_origins("*,http://localhost:3000") == ["http://localhost:3000"]
    assert sanitize_cors_origins(["*", "https://app.com"]) == ["https://app.com"]
    assert sanitize_cors_origins("*") == []
    assert parse_and_validate_cors_origins("*") == []


def test_cors_middleware_rejects_wildcard_with_credentials():
    """Verify that when CORS_ORIGINS='*' is configured, the server does not reflect '*' or credentials to arbitrary origins."""
    sanitized = sanitize_cors_origins("*", allow_credentials=True)
    assert "*" not in sanitized

    test_app = FastAPI()
    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=sanitized,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @test_app.get("/ping")
    def ping():
        return {"ok": True}

    with TestClient(test_app) as client:
        resp = client.get("/ping", headers={"Origin": "https://malicious.evil.com"})
        assert "access-control-allow-origin" not in resp.headers


# ---------------------------------------------------------------------------
# Requirement 5: Database engine connection pool & session rollback
# ---------------------------------------------------------------------------
def test_get_engine_kwargs_postgres():
    """Verify PostgreSQL URLs receive full QueuePool parameters."""
    pg_url = "postgresql+psycopg://user:pass@ep-test-123.ap-southeast-1.aws.neon.tech/weather"
    kwargs = get_engine_kwargs(pg_url)
    assert kwargs["pool_pre_ping"] is True
    assert kwargs["pool_recycle"] == 1800
    assert kwargs["pool_timeout"] == 30
    assert kwargs["pool_size"] == 5
    assert kwargs["max_overflow"] == 10
    assert kwargs["echo"] is False


def test_get_engine_kwargs_sqlite():
    """Verify SQLite URLs omit QueuePool parameters to avoid TypeError."""
    sqlite_url = "sqlite:///:memory:"
    kwargs = get_engine_kwargs(sqlite_url)
    assert kwargs["pool_pre_ping"] is True
    assert kwargs["pool_recycle"] == 1800
    assert kwargs["echo"] is False
    assert "pool_size" not in kwargs
    assert "max_overflow" not in kwargs
    assert "pool_timeout" not in kwargs


def test_database_engine_connection_pool_configuration():
    """Verify engine connection pool settings (pool_recycle=1800, pool_timeout=30, pool_size=5, max_overflow=10, pool_pre_ping=True)."""
    pool = database.engine.pool
    if hasattr(pool, "_recycle"):
        assert pool._recycle == 1800
    if hasattr(pool, "_timeout"):
        assert pool._timeout == 30
    if hasattr(pool, "size"):
        assert pool.size() == 5
    if hasattr(pool, "_max_overflow"):
        assert pool._max_overflow == 10
    if hasattr(pool, "_pre_ping"):
        assert pool._pre_ping is True


def test_sqlite_engine_creation_compatibility():
    """Verify engine creation succeeds without error on SQLite with dialect kwargs."""
    sqlite_engine = create_engine("sqlite:///:memory:", **get_engine_kwargs("sqlite:///:memory:"))
    with sqlite_engine.connect() as conn:
        res = conn.exec_driver_sql("SELECT 1").scalar()
        assert res == 1


def test_database_session_rollback_on_route_exception():
    """Verify that get_db() calls db.rollback() when an unhandled exception occurs before closing the session."""
    mock_session = MagicMock()
    with patch("app.database.SessionLocal", return_value=mock_session):
        gen = database.get_db()
        db_instance = next(gen)
        assert db_instance == mock_session

        with pytest.raises(RuntimeError, match="Simulated route error"):
            gen.throw(RuntimeError("Simulated route error"))

        mock_session.rollback.assert_called_once()
        mock_session.close.assert_called_once()


def test_database_session_normal_flow_does_not_rollback():
    """Verify that normal route completion closes the session without rollback."""
    mock_session = MagicMock()
    with patch("app.database.SessionLocal", return_value=mock_session):
        gen = database.get_db()
        db_instance = next(gen)
        assert db_instance == mock_session

        with pytest.raises(StopIteration):
            next(gen)

        mock_session.rollback.assert_not_called()
        mock_session.close.assert_called_once()


# ---------------------------------------------------------------------------
# Requirement 6: Open-Meteo client retry behavior & rate limit handling
# ---------------------------------------------------------------------------
def test_open_meteo_client_immediate_success():
    """Verify _request_json returns JSON dict on immediate 200 OK without retry."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps({"current": {"temperature_2m": 25.5}}).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    with patch("app.services.open_meteo_service.urlopen", return_value=mock_resp) as mock_urlopen:
        result = open_meteo_service._request_json("https://api.open-meteo.com/test", max_attempts=2)
        assert result == {"current": {"temperature_2m": 25.5}}
        assert mock_urlopen.call_count == 1


def test_open_meteo_client_retries_transient_network_error_and_succeeds():
    """Verify _request_json retries on transient URLError and succeeds on second attempt."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps({"current": {"temperature_2m": 26.0}}).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    with patch("app.services.open_meteo_service.urlopen", side_effect=[URLError("Connection reset"), mock_resp]) as mock_urlopen, \
         patch("app.services.open_meteo_service.time.sleep") as mock_sleep:
        result = open_meteo_service._request_json("https://api.open-meteo.com/test", max_attempts=2, backoff_seconds=0.5)
        assert result == {"current": {"temperature_2m": 26.0}}
        assert mock_urlopen.call_count == 2
        mock_sleep.assert_called_once_with(0.5)


def test_open_meteo_client_retries_transient_503_and_succeeds():
    """Verify _request_json retries on transient HTTP 503 and succeeds on second attempt."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps({"daily": {"time": ["2026-11-01"]}}).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    err_503 = HTTPError(url="https://api.open-meteo.com/test", code=503, msg="Service Unavailable", hdrs=None, fp=None)

    with patch("app.services.open_meteo_service.urlopen", side_effect=[err_503, mock_resp]) as mock_urlopen, \
         patch("app.services.open_meteo_service.time.sleep") as mock_sleep:
        result = open_meteo_service._request_json("https://api.open-meteo.com/test", max_attempts=2, backoff_seconds=0.5)
        assert result == {"daily": {"time": ["2026-11-01"]}}
        assert mock_urlopen.call_count == 2
        mock_sleep.assert_called_once_with(0.5)


def test_open_meteo_client_exhausted_retries_raises_provider_unavailable():
    """Verify WeatherProviderUnavailable is raised when all bounded retry attempts fail."""
    with patch("app.services.open_meteo_service.urlopen", side_effect=TimeoutError("Request timed out")) as mock_urlopen, \
         patch("app.services.open_meteo_service.time.sleep") as mock_sleep:
        with pytest.raises(open_meteo_service.WeatherProviderUnavailable, match="Open-Meteo is temporarily unavailable"):
            open_meteo_service._request_json("https://api.open-meteo.com/test", max_attempts=2, backoff_seconds=0.5)
        assert mock_urlopen.call_count == 2
        mock_sleep.assert_called_once_with(0.5)


def test_open_meteo_client_429_rate_limit_handled_without_looping():
    """Verify HTTP 429 raises WeatherProviderUnavailable immediately without looping or retrying."""
    hdrs = Message()
    hdrs.add_header("Retry-After", "60")
    err_429 = HTTPError(url="https://api.open-meteo.com/test", code=429, msg="Too Many Requests", hdrs=hdrs, fp=None)

    with patch("app.services.open_meteo_service.urlopen", side_effect=err_429) as mock_urlopen, \
         patch("app.services.open_meteo_service.time.sleep") as mock_sleep:
        with pytest.raises(open_meteo_service.WeatherProviderUnavailable, match="rate limit"):
            open_meteo_service._request_json("https://api.open-meteo.com/test", max_attempts=3, backoff_seconds=0.5)
        assert mock_urlopen.call_count == 1
        mock_sleep.assert_not_called()


def test_open_meteo_client_400_client_error_fails_immediately():
    """Verify HTTP 400 Client Error fails fast without attempting retries."""
    err_400 = HTTPError(url="https://api.open-meteo.com/test", code=400, msg="Bad Request", hdrs=None, fp=None)

    with patch("app.services.open_meteo_service.urlopen", side_effect=err_400) as mock_urlopen, \
         patch("app.services.open_meteo_service.time.sleep") as mock_sleep:
        with pytest.raises(open_meteo_service.WeatherProviderUnavailable, match="client error"):
            open_meteo_service._request_json("https://api.open-meteo.com/test", max_attempts=3, backoff_seconds=0.5)
        assert mock_urlopen.call_count == 1
        mock_sleep.assert_not_called()


# ---------------------------------------------------------------------------
# Requirement 7: Consistency check missing CSV guard & CLI execution
# ---------------------------------------------------------------------------
def test_consistency_script_missing_csv_guard():
    """Verify run_consistency_check handles missing raw CSV gracefully and returns True."""
    with patch("pathlib.Path.is_file", return_value=False):
        assert run_consistency_check() is True


def test_consistency_script_cli_execution():
    """Verify python backend/tests/test_consistency.py exits with code 0."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    result = subprocess.run(
        [sys.executable, str(repo_root / "backend" / "tests" / "test_consistency.py")],
        capture_output=True,
        text=True,
        cwd=str(repo_root),
    )
    assert result.returncode == 0
    assert "NOTICE: Consistency dataset not found" in result.stdout
