import asyncio
from unittest.mock import patch
from fastapi import FastAPI
from app.main import lifespan


def test_scheduler_disabled_by_default(monkeypatch):
    async def _test():
        monkeypatch.delenv("ENABLE_INGESTION_SCHEDULER", raising=False)
        app = FastAPI()
        with patch("app.main.init_db"), patch("app.main.check_connection", return_value=True):
            async with lifespan(app):
                assert getattr(app.state, "scheduler", None) is None

    asyncio.run(_test())


def test_scheduler_starts_when_enabled(monkeypatch):
    async def _test():
        monkeypatch.setenv("ENABLE_INGESTION_SCHEDULER", "true")
        app = FastAPI()
        with patch("app.main.init_db"), patch("app.main.check_connection", return_value=True):
            async with lifespan(app):
                scheduler = getattr(app.state, "scheduler", None)
                assert scheduler is not None
                assert scheduler.running
                job_ids = [job.id for job in scheduler.get_jobs()]
                assert "daily_weather_ingest" in job_ids
                assert "fill_prediction_actuals" in job_ids
            # After lifespan exits, scheduler should be shut down
            assert not scheduler.running

    asyncio.run(_test())
