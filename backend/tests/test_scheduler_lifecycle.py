import asyncio
from unittest.mock import MagicMock, patch

import pytest
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI

from app.main import lifespan
from app.services.ingestion_service import run_ingestion_with_lock
from app.services.metrics_service import fill_missing_actuals


@pytest.mark.parametrize("flag_value", ["true", "True", "1", "yes", "YES"])
def test_scheduler_lifecycle_starts_when_truthy(monkeypatch, flag_value):
    """Verify scheduler starts for various truthy environment variable strings."""
    async def _test():
        monkeypatch.setenv("ENABLE_INGESTION_SCHEDULER", flag_value)
        app = FastAPI()
        with patch("app.main.init_db"), patch("app.main.check_connection", return_value=True):
            async with lifespan(app):
                scheduler = getattr(app.state, "scheduler", None)
                assert scheduler is not None
                assert isinstance(scheduler, BackgroundScheduler)
                assert scheduler.running
            # Exiting lifespan triggers shutdown
            assert not scheduler.running

    asyncio.run(_test())


@pytest.mark.parametrize("flag_value", ["false", "False", "0", "no", "NO", "", "random_string"])
def test_scheduler_lifecycle_disabled_when_falsy(monkeypatch, flag_value):
    """Verify scheduler remains disabled for falsy or unrecognized strings."""
    async def _test():
        monkeypatch.setenv("ENABLE_INGESTION_SCHEDULER", flag_value)
        app = FastAPI()
        with patch("app.main.init_db"), patch("app.main.check_connection", return_value=True):
            async with lifespan(app):
                assert getattr(app.state, "scheduler", None) is None

    asyncio.run(_test())


def test_scheduler_lifecycle_disabled_when_unset(monkeypatch):
    """Verify scheduler remains disabled when ENABLE_INGESTION_SCHEDULER is unset."""
    async def _test():
        monkeypatch.delenv("ENABLE_INGESTION_SCHEDULER", raising=False)
        app = FastAPI()
        with patch("app.main.init_db"), patch("app.main.check_connection", return_value=True):
            async with lifespan(app):
                assert getattr(app.state, "scheduler", None) is None

    asyncio.run(_test())


def test_scheduler_job_specifications_and_triggers(monkeypatch):
    """
    Verify exact job registrations, CronTriggers, timezone, coalesce,
    max_instances, and misfire_grace_time.
    """
    async def _test():
        monkeypatch.setenv("ENABLE_INGESTION_SCHEDULER", "true")
        app = FastAPI()
        with patch("app.main.init_db"), patch("app.main.check_connection", return_value=True):
            async with lifespan(app):
                scheduler = getattr(app.state, "scheduler", None)
                assert scheduler is not None

                jobs = {job.id: job for job in scheduler.get_jobs()}
                assert "daily_weather_ingest" in jobs
                assert "fill_prediction_actuals" in jobs

                # 1. Check daily_weather_ingest
                ingest_job = jobs["daily_weather_ingest"]
                assert ingest_job.func == run_ingestion_with_lock
                assert ingest_job.max_instances == 1
                assert ingest_job.coalesce is True
                assert ingest_job.misfire_grace_time == 3600
                assert isinstance(ingest_job.trigger, CronTrigger)
                # Check 06:30 Asia/Kolkata
                fields = {f.name: str(f) for f in ingest_job.trigger.fields}
                assert fields["hour"] == "6"
                assert fields["minute"] == "30"
                assert str(ingest_job.trigger.timezone) == "Asia/Kolkata"

                # 2. Check fill_prediction_actuals
                fill_job = jobs["fill_prediction_actuals"]
                assert fill_job.func == fill_missing_actuals
                assert fill_job.max_instances == 1
                assert fill_job.coalesce is True
                assert fill_job.misfire_grace_time == 3600
                assert isinstance(fill_job.trigger, CronTrigger)
                # Check 07:00 Asia/Kolkata
                fill_fields = {f.name: str(f) for f in fill_job.trigger.fields}
                assert fill_fields["hour"] == "7"
                assert fill_fields["minute"] == "0"
                assert str(fill_job.trigger.timezone) == "Asia/Kolkata"

    asyncio.run(_test())


def test_scheduler_job_execution_delegates_to_service(monkeypatch):
    """Verify that triggering the registered scheduler callbacks calls the underlying targets."""
    async def _test():
        monkeypatch.setenv("ENABLE_INGESTION_SCHEDULER", "true")
        app = FastAPI()
        with patch("app.main.init_db"), patch("app.main.check_connection", return_value=True), \
             patch("app.main.run_ingestion_with_lock") as mock_ingest, \
             patch("app.main.fill_missing_actuals") as mock_fill:

            async with lifespan(app):
                scheduler = getattr(app.state, "scheduler", None)
                jobs = {job.id: job for job in scheduler.get_jobs()}

                # Directly invoke the scheduled functions
                jobs["daily_weather_ingest"].func()
                mock_ingest.assert_called_once()

                jobs["fill_prediction_actuals"].func()
                mock_fill.assert_called_once()

    asyncio.run(_test())
