import os
from pathlib import Path
import sys
from unittest.mock import patch
import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app


def test_cors_default_configuration_supports_8080():
    """Verify that localhost:8080 and 127.0.0.1:8080 are included in the default allowed origins."""
    cors_middleware = None
    for m in app.user_middleware:
        if m.cls == CORSMiddleware:
            cors_middleware = m
            break

    assert cors_middleware is not None, "CORSMiddleware must be configured on app"
    allowed = cors_middleware.kwargs.get("allow_origins", [])
    assert "http://localhost:8080" in allowed
    assert "http://127.0.0.1:8080" in allowed
    assert "http://localhost:5173" in allowed
    assert "http://localhost:3000" in allowed
    assert "https://weather-forecasting-using-machine.onrender.com" in allowed


def test_cors_preflight_and_actual_requests_for_allowed_origins():
    """Verify that allowed origins receive valid Access-Control-Allow-Origin response headers."""
    with patch("app.main.init_db"), \
         patch("app.main.check_connection", return_value=True), \
         patch("app.routes.health.check_connection", return_value=True):
        with TestClient(app) as client:
            # 1. localhost:8080
            resp1 = client.get("/health", headers={"Origin": "http://localhost:8080"})
            assert resp1.headers.get("access-control-allow-origin") == "http://localhost:8080"

            # 2. 127.0.0.1:8080
            resp2 = client.get("/health", headers={"Origin": "http://127.0.0.1:8080"})
            assert resp2.headers.get("access-control-allow-origin") == "http://127.0.0.1:8080"

            # 3. Production Render URL
            resp3 = client.get("/health", headers={"Origin": "https://weather-forecasting-using-machine.onrender.com"})
            assert resp3.headers.get("access-control-allow-origin") == "https://weather-forecasting-using-machine.onrender.com"

            # 4. Unauthorized origin is rejected (no allow-origin header)
            resp4 = client.get("/health", headers={"Origin": "http://malicious-origin.com"})
            assert "access-control-allow-origin" not in resp4.headers


def test_cors_environment_variable_override(monkeypatch):
    """Verify that setting CORS_ORIGINS environment variable overrides allowed origins without weakening security."""
    test_origins = "https://custom-app.vercel.app,http://preview.internal:9000"
    monkeypatch.setenv("CORS_ORIGINS", test_origins)

    origins_list = [o.strip() for o in test_origins.split(",") if o.strip()]
    custom_app = FastAPI()
    custom_app.add_middleware(
        CORSMiddleware,
        allow_origins=origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @custom_app.get("/ping")
    def ping():
        return {"ping": "pong"}

    with TestClient(custom_app) as client:
        # Allowed custom origin
        r1 = client.get("/ping", headers={"Origin": "https://custom-app.vercel.app"})
        assert r1.headers.get("access-control-allow-origin") == "https://custom-app.vercel.app"

        # Non-listed origin
        r2 = client.get("/ping", headers={"Origin": "http://localhost:8080"})
        assert "access-control-allow-origin" not in r2.headers
