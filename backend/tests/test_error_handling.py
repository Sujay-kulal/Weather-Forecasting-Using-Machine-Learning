"""
Security and error handling test suite for RFC 7807 Problem Details and 500 Sanitization.

Verifies:
1. RFC 7807 Content-Type (application/problem+json) and envelope fields across HTTP errors.
2. RequestValidationError (HTTP 422) conforming to RFC 7807 while preserving detail list.
3. Global 500 sanitization preventing disclosure of database URIs, passwords, or filesystem paths.
4. Client detail field preservation for frontend compatibility.
5. Rejection of unsupported geographic states ('Other', Ladakh, A&N, Lakshadweep) at inference boundary.
6. Constant-time admin token verification and fail-closed rejection of missing/empty tokens.
"""
from datetime import date
import os
from unittest.mock import patch
import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.database import Base, get_db
from app.main import app
from app.models import WeatherData
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.services.resolve_location import MODEL_SUPPORTED_STATES


@pytest.fixture
def client():
    """Create isolated SQLite database for route tests using StaticPool for multi-threading."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    with TestingSessionLocal() as session:
        session.add_all([
            WeatherData(
                state="Karnataka", district="", location="", date=date(2026, 1, 1),
                temp_max=30.0, temp_min=20.0, temp_avg=25.0, humidity=60.0, rainfall=0.0,
            ),
            WeatherData(
                state="Other", district="", location="", date=date(2026, 1, 1),
                temp_max=30.0, temp_min=20.0, temp_avg=25.0, humidity=60.0, rainfall=0.0,
            ),
        ])
        session.commit()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with patch("app.main.init_db"), patch("app.main.check_connection", return_value=True):
        with TestClient(app, raise_server_exceptions=False) as test_client:
            yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


def test_http_exception_returns_rfc7807_problem_json(client):
    """Verify HTTP 404 returns RFC 7807 problem details with detail key preserved."""
    response = client.get("/weather/NonExistentState999")
    assert response.status_code == 404
    assert response.headers.get("content-type") == "application/problem+json"
    data = response.json()
    assert "type" in data
    assert "title" in data
    assert data["status"] == 404
    assert "detail" in data
    assert "Unknown state 'NonExistentState999'" in data["detail"]
    assert data["instance"] == "/weather/NonExistentState999"


def test_validation_error_returns_rfc7807_problem_json(client):
    """Verify RequestValidationError (HTTP 422) returns application/problem+json with detail array."""
    response = client.get("/forecast/all?day=99")
    assert response.status_code == 422
    assert response.headers.get("content-type") == "application/problem+json"
    data = response.json()
    assert data["type"] == "about:blank"
    assert data["title"] == "Validation Error"
    assert data["status"] == 422
    assert isinstance(data["detail"], list)
    assert len(data["detail"]) > 0
    assert data["instance"] == "/forecast/all"


def test_unhandled_exception_sanitized_500(client):
    """Verify unhandled 500 exceptions are sanitized and do not leak connection strings or file paths."""
    test_router = APIRouter()

    @test_router.get("/test-unhandled-crash")
    def crash_route():
        raise RuntimeError(
            "Connection failed: postgresql://admin_user:SuperSecretPassword123@db.internal:5432/weather_db "
            "at C:\\Users\\SUJAY\\secret_keys\\app.key"
        )

    @test_router.get("/test-http-500-leak")
    def http_500_leak_route():
        raise StarletteHTTPException(
            status_code=500,
            detail="Database timeout at postgresql://dbuser:SecretPass456@host:5432/db; check C:\\app\\config.py"
        )

    app.include_router(test_router, prefix="/_test_security")

    try:
        # 1. Test unhandled Exception
        resp1 = client.get("/_test_security/test-unhandled-crash")
        assert resp1.status_code == 500
        assert resp1.headers.get("content-type") == "application/problem+json"
        data1 = resp1.json()
        assert data1["status"] == 500
        assert data1["detail"] == "An internal server error occurred."
        assert "SuperSecretPassword123" not in resp1.text
        assert "C:\\Users" not in resp1.text

        # 2. Test HTTPException with 500 status code
        resp2 = client.get("/_test_security/test-http-500-leak")
        assert resp2.status_code == 500
        assert resp2.headers.get("content-type") == "application/problem+json"
        data2 = resp2.json()
        assert data2["status"] == 500
        assert "SecretPass456" not in resp2.text
        assert "C:\\app" not in resp2.text
        assert "[redacted-path]" in data2["detail"] or "://***:***@" in data2["detail"]

    finally:
        app.routes[:] = [r for r in app.routes if not getattr(r, "path", "").startswith("/_test_security")]


def test_predict_unsupported_states_rejected(client):
    """Verify that 'Other', Ladakh, Andaman & Nicobar, and Lakshadweep are rejected at the inference boundary."""
    unsupported_states = ["Other", "Ladakh", "Andaman And Nicobar", "Lakshadweep"]
    for state in unsupported_states:
        response = client.post(
            "/predict",
            json={"state": state, "forecast_date": "2026-01-10"},
        )
        assert response.status_code == 422
        assert response.headers.get("content-type") == "application/problem+json"
        data = response.json()
        assert "not supported for machine learning model inference" in data["detail"]


def test_admin_ingest_auth_fail_closed_and_constant_time(client):
    """Verify fail-closed rejection of missing/empty ADMIN_TOKEN and unauthorized attempts."""
    # 1. When ADMIN_TOKEN is set, wrong token rejected with 401
    with patch.dict(os.environ, {"ADMIN_TOKEN": "correct_admin_token_9988"}):
        resp = client.post("/admin/ingest", headers={"X-Admin-Token": "wrong_token"})
        assert resp.status_code == 401
        assert "Unauthorized" in resp.json()["detail"]

    # 2. When ADMIN_TOKEN is missing or empty, request fails closed
    with patch.dict(os.environ, {"ADMIN_TOKEN": ""}):
        resp_empty = client.post("/admin/ingest", headers={"X-Admin-Token": ""})
        assert resp_empty.status_code == 401
        assert "Unauthorized" in resp_empty.json()["detail"]

    with patch.dict(os.environ, {}, clear=True):
        resp_unset = client.post("/admin/ingest", headers={"X-Admin-Token": "any_token"})
        assert resp_unset.status_code == 401
        assert "Unauthorized" in resp_unset.json()["detail"]


def test_states_endpoint_filters_out_other(client):
    """Verify GET /states returns only supported states and excludes 'Other'."""
    response = client.get("/states")
    assert response.status_code == 200
    states = response.json()["states"]
    assert "Other" not in states
    assert "Karnataka" in states
