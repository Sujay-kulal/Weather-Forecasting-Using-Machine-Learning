"""Read-only unit checks for health status and default forecast dates."""
import sys
import unittest
import os
from datetime import date
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, Response

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.routes import admin, health, prediction  # noqa: E402


class HealthStatusTests(unittest.TestCase):
    def test_unreachable_database_returns_service_unavailable(self):
        with patch.object(health, "check_connection", return_value=False), patch.object(
            health, "pipeline_loaded", return_value=True
        ):
            response = Response()
            result = health.health(response)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(result.status, "degraded")
        self.assertEqual(result.database, "unreachable")

    def test_missing_model_returns_service_unavailable(self):
        with patch.object(health, "check_connection", return_value=True), patch.object(
            health, "pipeline_loaded", return_value=False
        ):
            response = Response()
            result = health.health(response)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(result.status, "degraded")
        self.assertFalse(result.model_loaded)

    def test_healthy_dependencies_keep_success_status(self):
        with patch.object(health, "check_connection", return_value=True), patch.object(
            health, "pipeline_loaded", return_value=True
        ):
            response = Response()
            result = health.health(response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(result.status, "healthy")


class ForecastDefaultTests(unittest.TestCase):
    def test_default_is_today_when_latest_observation_plus_two_is_past(self):
        self.assertEqual(
            prediction.default_forecast_target(date(2026, 10, 23), date(2026, 10, 26)),
            date(2026, 10, 26),
        )

    def test_default_stays_two_days_after_a_recent_observation(self):
        self.assertEqual(
            prediction.default_forecast_target(date(2026, 10, 28), date(2026, 10, 26)),
            date(2026, 10, 30),
        )


class AdminErrorTests(unittest.TestCase):
    def test_ingestion_failure_does_not_expose_internal_exception(self):
        with patch.dict(os.environ, {"ADMIN_TOKEN": "audit-test-token"}), patch.object(
            admin,
            "run_ingestion_with_lock",
            side_effect=RuntimeError("internal_db_error_details"),
        ):
            with self.assertLogs("admin", level="ERROR"):
                with self.assertRaises(HTTPException) as raised:
                    admin.admin_ingest("audit-test-token", 7)

        self.assertEqual(raised.exception.status_code, 500)
        self.assertNotIn("internal_db_error_details", raised.exception.detail)


if __name__ == "__main__":
    unittest.main(verbosity=2)
