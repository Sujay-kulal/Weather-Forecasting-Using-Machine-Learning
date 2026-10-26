"""Unit checks for side-effect-free API startup and opt-in scheduling."""
import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://invalid:invalid@127.0.0.1:1/weather_startup_test",
)

from app import main  # noqa: E402


class StartupSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_scheduler_is_disabled_by_default_without_schema_creation(self):
        app = SimpleNamespace(state=SimpleNamespace())
        with patch.dict(os.environ, {"ENABLE_INGESTION_SCHEDULER": "false"}), patch.object(
            main, "check_connection", return_value=True
        ), patch.object(main, "BackgroundScheduler") as scheduler:
            async with main.lifespan(app):
                self.assertIsNone(app.state.scheduler)
            scheduler.assert_not_called()
        # Schema creation is deliberately absent from the startup module; its
        # only owner is the explicit migration command.
        self.assertNotIn("create_all", Path(main.__file__).read_text(encoding="utf-8"))

    async def test_scheduler_can_be_enabled_explicitly_and_shuts_down(self):
        app = SimpleNamespace(state=SimpleNamespace())
        scheduler = MagicMock()
        scheduler.add_job.return_value = SimpleNamespace(
            id="daily_weather_ingest",
            next_run_time="test",
        )
        with patch.dict(os.environ, {"ENABLE_INGESTION_SCHEDULER": "true"}), patch.object(
            main, "check_connection", return_value=True
        ), patch.object(main, "BackgroundScheduler", return_value=scheduler):
            async with main.lifespan(app):
                self.assertIs(app.state.scheduler, scheduler)
                scheduler.start.assert_called_once()
            scheduler.shutdown.assert_called_once_with(wait=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
