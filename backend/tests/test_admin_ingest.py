from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.admin import router


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_admin_ingest_missing_token_returns_401(client, monkeypatch):
    """Verify missing X-Admin-Token header is rejected with 401 Unauthorized."""
    monkeypatch.setenv("ADMIN_TOKEN", "valid-secret-token")
    response = client.post("/admin/ingest")
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]


def test_admin_ingest_invalid_token_returns_401(client, monkeypatch):
    """Verify mismatched X-Admin-Token header is rejected with 401 Unauthorized."""
    monkeypatch.setenv("ADMIN_TOKEN", "valid-secret-token")
    response = client.post("/admin/ingest", headers={"X-Admin-Token": "wrong-token"})
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]


def test_admin_ingest_unset_admin_token_env_returns_401(client, monkeypatch):
    """Verify that if ADMIN_TOKEN is not configured on the server, requests are rejected with 401."""
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    response = client.post("/admin/ingest", headers={"X-Admin-Token": "any-token"})
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["detail"]


def test_admin_ingest_authorized_default_days_back(client, monkeypatch):
    """Verify successful authorization with default days_back=7 calls service and returns 200."""
    monkeypatch.setenv("ADMIN_TOKEN", "valid-secret-token")
    mock_payload = {
        "status": "success",
        "total_states": 34,
        "successful_states": ["Karnataka"],
        "failed_states": [],
        "successful_count": 1,
        "failed_count": 0,
        "records_upserted": 34,
        "records_inserted_or_updated": 34,
        "failed_state_errors": {},
        "last_ingested_at": "2026-10-30T12:00:00+00:00",
    }

    with patch("app.routes.admin.run_ingestion_with_lock", return_value=mock_payload) as mock_ingest:
        response = client.post("/admin/ingest", headers={"X-Admin-Token": "valid-secret-token"})

    assert response.status_code == 200
    assert response.json() == mock_payload
    mock_ingest.assert_called_once_with(days_back=7)


def test_admin_ingest_authorized_partial_success(client, monkeypatch):
    """Verify admin endpoint returns structured summary on partial_success."""
    monkeypatch.setenv("ADMIN_TOKEN", "valid-secret-token")
    mock_payload = {
        "status": "partial_success",
        "total_states": 2,
        "successful_states": ["StateA"],
        "failed_states": ["StateB"],
        "successful_count": 1,
        "failed_count": 1,
        "records_upserted": 10,
        "records_inserted_or_updated": 10,
        "failed_state_errors": {"StateB": "HTTP 500"},
        "last_ingested_at": "2026-10-30T12:00:00+00:00",
    }

    with patch("app.routes.admin.run_ingestion_with_lock", return_value=mock_payload) as mock_ingest:
        response = client.post("/admin/ingest", headers={"X-Admin-Token": "valid-secret-token"})

    assert response.status_code == 200
    assert response.json()["status"] == "partial_success"
    assert response.json()["failed_states"] == ["StateB"]
    mock_ingest.assert_called_once_with(days_back=7)


def test_admin_ingest_authorized_custom_days_back(client, monkeypatch):
    """Verify days_back query parameter is passed through to run_ingestion_with_lock."""
    monkeypatch.setenv("ADMIN_TOKEN", "valid-secret-token")
    mock_payload = {"status": "success", "records_upserted": 100}

    with patch("app.routes.admin.run_ingestion_with_lock", return_value=mock_payload) as mock_ingest:
        response = client.post("/admin/ingest?days_back=14", headers={"X-Admin-Token": "valid-secret-token"})

    assert response.status_code == 200
    assert response.json() == mock_payload
    mock_ingest.assert_called_once_with(days_back=14)


@pytest.mark.parametrize("invalid_days_back", [0, -1, 91, 500, "seven"])
def test_admin_ingest_parameter_validation_bounds(client, monkeypatch, invalid_days_back):
    """Verify days_back bounds: ge=1, le=90 enforced via FastAPI validation returning 422."""
    monkeypatch.setenv("ADMIN_TOKEN", "valid-secret-token")
    response = client.post(
        f"/admin/ingest?days_back={invalid_days_back}",
        headers={"X-Admin-Token": "valid-secret-token"}
    )
    assert response.status_code == 422


def test_admin_ingest_lock_held_delegation(client, monkeypatch):
    """Verify response payload when advisory lock is currently held by another worker."""
    monkeypatch.setenv("ADMIN_TOKEN", "valid-secret-token")
    mock_skipped = {"status": "skipped", "reason": "advisory_lock_held"}

    with patch("app.routes.admin.run_ingestion_with_lock", return_value=mock_skipped):
        response = client.post("/admin/ingest", headers={"X-Admin-Token": "valid-secret-token"})

    assert response.status_code == 200
    assert response.json() == mock_skipped


def test_admin_ingest_service_exception_returns_500(client, monkeypatch):
    """Verify unhandled service exception returns 500 Internal Server Error."""
    monkeypatch.setenv("ADMIN_TOKEN", "valid-secret-token")

    with patch("app.routes.admin.run_ingestion_with_lock", side_effect=RuntimeError("Database lock timeout")):
        response = client.post("/admin/ingest", headers={"X-Admin-Token": "valid-secret-token"})

    assert response.status_code == 500
    assert "Ingestion failed: Database lock timeout" in response.json()["detail"]
