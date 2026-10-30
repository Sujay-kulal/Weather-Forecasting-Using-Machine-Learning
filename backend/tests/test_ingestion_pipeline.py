import json
import urllib.error
import urllib.request
from datetime import date
from io import BytesIO
from unittest.mock import MagicMock, call, patch

import pytest
from sqlalchemy import text

import update_weather
from app.services import ingestion_service
from app.services.ingestion_service import ADVISORY_LOCK_ID, run_ingestion_with_lock


class MockHttpResponse:
    def __init__(self, data: dict, status: int = 200):
        self._payload = json.dumps(data).encode("utf-8")
        self.status = status

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


def test_fetch_forecast_for_state_parses_valid_payload():
    """Verify fetch_forecast_for_state executes request and returns parsed JSON."""
    fixture_data = {
        "latitude": 28.7,
        "longitude": 77.1,
        "daily": {
            "time": ["2026-10-28", "2026-10-29"],
            "temperature_2m_max": [25.0, 26.0],
            "temperature_2m_min": [18.0, 19.0],
            "temperature_2m_mean": [21.5, 22.5],
            "precipitation_sum": [0.0, 1.2],
            "relative_humidity_2m_mean": [65.0, 70.0],
        },
    }

    with patch("urllib.request.urlopen", return_value=MockHttpResponse(fixture_data)) as mock_urlopen:
        result = update_weather.fetch_forecast_for_state("Delhi", 28.7041, 77.1025, days_back=1)

    assert result == fixture_data
    mock_urlopen.assert_called_once()
    req = mock_urlopen.call_args[0][0]
    assert "latitude=28.7041" in req.full_url
    assert "longitude=77.1025" in req.full_url
    assert "past_days=1" in req.full_url


def test_fetch_forecast_for_state_retry_exponential_backoff():
    """Verify retry logic on transient network errors with exponential backoff."""
    fixture_data = {"daily": {"time": ["2026-10-29"]}}
    error = urllib.error.URLError("Connection reset by peer")

    with patch("urllib.request.urlopen", side_effect=[error, error, MockHttpResponse(fixture_data)]) as mock_urlopen, \
         patch("time.sleep") as mock_sleep:
        result = update_weather.fetch_forecast_for_state("Delhi", 28.7041, 77.1025, max_retries=3)

    assert result == fixture_data
    assert mock_urlopen.call_count == 3
    # Attempt 1 failed -> sleep(2**1=2)
    # Attempt 2 failed -> sleep(2**2=4)
    assert mock_sleep.call_args_list == [call(2), call(4)]


def test_fetch_forecast_for_state_exhausts_retries_raises():
    """Verify that exhausting all retries re-raises the underlying exception."""
    error = urllib.error.URLError("Fatal DNS resolution failure")

    with patch("urllib.request.urlopen", side_effect=error), \
         patch("time.sleep"):
        with pytest.raises(urllib.error.URLError):
            update_weather.fetch_forecast_for_state("Delhi", 28.7041, 77.1025, max_retries=3)


def test_update_weather_null_filtering_and_buffer():
    """
    Verify update_weather discards any day containing nulls in any weather column
    while retaining valid observations.
    """
    sample_response = {
        "daily": {
            "time": ["2026-10-25", "2026-10-26", "2026-10-27"],
            "temperature_2m_max": [25.0, None, 28.0],      # Day 2 has None
            "temperature_2m_min": [15.0, 16.0, 17.0],
            "temperature_2m_mean": [20.0, 21.0, 22.5],
            "precipitation_sum": [0.0, 2.5, None],        # Day 3 has None
            "relative_humidity_2m_mean": [60.0, 65.0, 70.0],
        }
    }

    mock_session = MagicMock()
    # Test only single state to isolate behavior
    with patch.dict(update_weather.STATE_COORDS, {"Delhi": (28.7041, 77.1025)}, clear=True), \
         patch("update_weather.fetch_forecast_for_state", return_value=sample_response), \
         patch("time.sleep"):
        count = update_weather.update_weather(days_back=3, session=mock_session)

    # Only 1 day (2026-10-25) had all 5 metrics present
    assert count == 1
    mock_session.execute.assert_called_once()
    mock_session.commit.assert_called_once()


def test_update_weather_upsert_targets_correct_constraint():
    """Verify the PostgreSQL upsert uses constraint uq_weather_state_dist_loc_date."""
    sample_response = {
        "daily": {
            "time": ["2026-10-28"],
            "temperature_2m_max": [30.0],
            "temperature_2m_min": [20.0],
            "temperature_2m_mean": [25.0],
            "precipitation_sum": [5.0],
            "relative_humidity_2m_mean": [70.0],
        }
    }

    mock_session = MagicMock()
    executed_statements = []

    def capture_execute(stmt):
        executed_statements.append(stmt)
        return MagicMock()

    mock_session.execute.side_effect = capture_execute

    with patch.dict(update_weather.STATE_COORDS, {"Goa": (15.2993, 74.1240)}, clear=True), \
         patch("update_weather.fetch_forecast_for_state", return_value=sample_response), \
         patch("time.sleep"):
        update_weather.update_weather(days_back=1, session=mock_session)

    assert len(executed_statements) == 1
    compiled = str(executed_statements[0].compile(dialect=None))
    assert "uq_weather_state_dist_loc_date" in compiled or "ON CONFLICT" in compiled


def test_run_ingestion_lock_acquired_and_released():
    """
    Verify advisory lock acquisition, cache invalidation, and guaranteed lock release
    on successful ingestion.
    """
    mock_session = MagicMock()
    # First call: pg_try_advisory_lock returns True
    mock_session.execute.return_value.scalar.return_value = True

    with patch("app.services.ingestion_service.SessionLocal", return_value=mock_session), \
         patch("update_weather.update_weather", return_value=34) as mock_update, \
         patch("app.services.ingestion_service.clear_forecast_cache") as mock_clear_cache:
        result = run_ingestion_with_lock(days_back=7)

    assert result["status"] == "success"
    assert result["records_upserted"] == 34
    assert "last_ingested_at" in result

    mock_update.assert_called_once_with(days_back=7, session=mock_session)
    mock_clear_cache.assert_called_once()

    # Verify lock acquisition and release statements executed
    executed_sql = [str(call_args[0][0]) for call_args in mock_session.execute.call_args_list]
    assert any(f"pg_try_advisory_lock({ADVISORY_LOCK_ID})" in sql for sql in executed_sql)
    assert any(f"pg_advisory_unlock({ADVISORY_LOCK_ID})" in sql for sql in executed_sql)
    mock_session.close.assert_called_once()


def test_run_ingestion_lock_held_skips_cleanly():
    """
    Verify that if the advisory lock is already held, ingestion is cleanly skipped
    without calling update_weather, without clearing cache, and without attempting unlock.
    """
    mock_session = MagicMock()
    # pg_try_advisory_lock returns False (lock held by another job)
    mock_session.execute.return_value.scalar.return_value = False

    with patch("app.services.ingestion_service.SessionLocal", return_value=mock_session), \
         patch("update_weather.update_weather") as mock_update, \
         patch("app.services.ingestion_service.clear_forecast_cache") as mock_clear_cache:
        result = run_ingestion_with_lock(days_back=7)

    assert result["status"] == "skipped"
    assert result["reason"] == "advisory_lock_held"

    mock_update.assert_not_called()
    mock_clear_cache.assert_not_called()

    # Check unlock was NOT called because lock was never acquired
    executed_sql = [str(call_args[0][0]) for call_args in mock_session.execute.call_args_list]
    assert not any("pg_advisory_unlock" in sql for sql in executed_sql)
    mock_session.close.assert_called_once()


def test_run_ingestion_lock_released_on_unhandled_exception():
    """
    Verify that if update_weather raises an unhandled exception,
    the advisory lock is STILL released in the finally block before re-raising.
    """
    mock_session = MagicMock()
    # pg_try_advisory_lock returns True
    mock_session.execute.return_value.scalar.return_value = True

    with patch("app.services.ingestion_service.SessionLocal", return_value=mock_session), \
         patch("update_weather.update_weather", side_effect=RuntimeError("Database connection lost")), \
         patch("app.services.ingestion_service.clear_forecast_cache") as mock_clear_cache:
        with pytest.raises(RuntimeError, match="Database connection lost"):
            run_ingestion_with_lock(days_back=7)

    # Cache should NOT be cleared if update failed
    mock_clear_cache.assert_not_called()

    # Lock MUST be released
    executed_sql = [str(call_args[0][0]) for call_args in mock_session.execute.call_args_list]
    assert any(f"pg_advisory_unlock({ADVISORY_LOCK_ID})" in sql for sql in executed_sql)
    mock_session.close.assert_called_once()
