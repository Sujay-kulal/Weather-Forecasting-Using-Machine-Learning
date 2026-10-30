import json
import urllib.error
import urllib.request
from datetime import date
from io import BytesIO
from unittest.mock import MagicMock, call, patch

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

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


def _make_daily_fixture(t_max=25.0, t_min=15.0, t_mean=20.0, precip=0.0, humid=60.0, num_days=1):
    return {
        "latitude": 28.7,
        "longitude": 77.1,
        "daily": {
            "time": [f"2026-10-{20 + i}" for i in range(num_days)],
            "temperature_2m_max": [t_max] * num_days,
            "temperature_2m_min": [t_min] * num_days,
            "temperature_2m_mean": [t_mean] * num_days,
            "precipitation_sum": [precip] * num_days,
            "relative_humidity_2m_mean": [humid] * num_days,
        },
    }


# ============================================================================
# Baseline Ingestion & Retry Semantics Tests (Preserved)
# ============================================================================

def test_fetch_forecast_for_state_parses_valid_payload():
    """Verify fetch_forecast_for_state executes request and returns parsed JSON."""
    fixture_data = _make_daily_fixture(num_days=2)

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
    with patch.dict(update_weather.STATE_COORDS, {"Delhi": (28.7041, 77.1025)}, clear=True), \
         patch("update_weather.fetch_forecast_for_state", return_value=sample_response), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=3, session=mock_session)

    # Only 1 day (2026-10-25) had all 5 metrics present
    assert summary["records_upserted"] == 1
    assert summary["status"] == "success"
    assert summary == 1  # IngestionSummary backwards-compatible int evaluation
    mock_session.execute.assert_called_once()
    mock_session.commit.assert_called_once()


def test_update_weather_upsert_targets_correct_constraint():
    """Verify the PostgreSQL upsert uses constraint uq_weather_state_dist_loc_date."""
    sample_response = _make_daily_fixture(num_days=1)

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


# ============================================================================
# Advisory Lock Acquisition & Release Tests (Preserved)
# ============================================================================

def test_run_ingestion_lock_acquired_and_released():
    """
    Verify advisory lock acquisition, cache invalidation, and guaranteed lock release
    on successful ingestion.
    """
    mock_session = MagicMock()
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
    mock_session.execute.return_value.scalar.return_value = False

    with patch("app.services.ingestion_service.SessionLocal", return_value=mock_session), \
         patch("update_weather.update_weather") as mock_update, \
         patch("app.services.ingestion_service.clear_forecast_cache") as mock_clear_cache:
        result = run_ingestion_with_lock(days_back=7)

    assert result["status"] == "skipped"
    assert result["reason"] == "advisory_lock_held"

    mock_update.assert_not_called()
    mock_clear_cache.assert_not_called()

    executed_sql = [str(call_args[0][0]) for call_args in mock_session.execute.call_args_list]
    assert not any("pg_advisory_unlock" in sql for sql in executed_sql)
    mock_session.close.assert_called_once()


def test_run_ingestion_lock_released_on_unhandled_exception():
    """
    Verify that if an unhandled unexpected exception occurs,
    the advisory lock is STILL released in the finally block before re-raising.
    """
    mock_session = MagicMock()
    mock_session.execute.return_value.scalar.return_value = True

    with patch("app.services.ingestion_service.SessionLocal", return_value=mock_session), \
         patch("update_weather.update_weather", side_effect=RuntimeError("Database connection lost")), \
         patch("app.services.ingestion_service.clear_forecast_cache") as mock_clear_cache:
        with pytest.raises(RuntimeError, match="Database connection lost"):
            run_ingestion_with_lock(days_back=7)

    mock_clear_cache.assert_not_called()
    executed_sql = [str(call_args[0][0]) for call_args in mock_session.execute.call_args_list]
    assert any(f"pg_advisory_unlock({ADVISORY_LOCK_ID})" in sql for sql in executed_sql)
    mock_session.close.assert_called_once()


# ============================================================================
# DEF-001: Per-State Failure Isolation & Structured Summary Tests (R1, R2, R4)
# ============================================================================

def test_per_state_failure_isolation_single_state_failure():
    """
    R1 & R4: Verify one state failing does NOT terminate ingestion for remaining states.
    Given State A (success), State B (fails), State C (success):
    - All 3 states are processed.
    - State A and C are committed.
    - State B has session.rollback() called.
    - Status is 'partial_success'.
    """
    states = {
        "StateA": (10.0, 70.0),
        "StateB": (20.0, 80.0),
        "StateC": (30.0, 90.0),
    }

    def mock_fetch(state, lat, lon, days_back=7, max_retries=5):
        if state == "StateB":
            raise urllib.error.URLError("Network connection timed out")
        return _make_daily_fixture(num_days=2)

    mock_session = MagicMock()

    with patch.dict(update_weather.STATE_COORDS, states, clear=True), \
         patch("update_weather.fetch_forecast_for_state", side_effect=mock_fetch), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=2, session=mock_session)

    assert summary["status"] == "partial_success"
    assert summary["total_states"] == 3
    assert summary["successful_states"] == ["StateA", "StateC"]
    assert summary["failed_states"] == ["StateB"]
    assert summary["successful_count"] == 2
    assert summary["failed_count"] == 1
    assert summary["records_upserted"] == 4  # 2 days from StateA + 2 days from StateC
    assert "StateB" in summary["failed_state_errors"]
    assert "URLError: <urlopen error Network connection timed out>" in summary["failed_state_errors"]["StateB"]

    # Verify commits for StateA and StateC, and rollback for StateB
    assert mock_session.commit.call_count == 2
    assert mock_session.rollback.call_count == 1


def test_per_state_failure_isolation_multiple_state_failures():
    """
    R1 & R4: Verify multiple states failing with different errors continue processing.
    State 1 (success), State 2 (HTTP 500), State 3 (Timeout), State 4 (success).
    """
    states = {
        "State1": (10.0, 70.0),
        "State2": (20.0, 80.0),
        "State3": (30.0, 90.0),
        "State4": (40.0, 100.0),
    }

    def mock_fetch(state, lat, lon, days_back=7, max_retries=5):
        if state == "State2":
            raise urllib.error.HTTPError("https://api.open-meteo.com", 500, "Internal Server Error", {}, BytesIO(b"{}"))
        elif state == "State3":
            raise TimeoutError("Read timed out")
        return _make_daily_fixture(num_days=3)

    mock_session = MagicMock()

    with patch.dict(update_weather.STATE_COORDS, states, clear=True), \
         patch("update_weather.fetch_forecast_for_state", side_effect=mock_fetch), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=3, session=mock_session)

    assert summary["status"] == "partial_success"
    assert summary["total_states"] == 4
    assert summary["successful_states"] == ["State1", "State4"]
    assert summary["failed_states"] == ["State2", "State3"]
    assert summary["successful_count"] == 2
    assert summary["failed_count"] == 2
    assert summary["records_upserted"] == 6  # 3 from State1 + 3 from State4
    assert "HTTPError" in summary["failed_state_errors"]["State2"]
    assert "TimeoutError" in summary["failed_state_errors"]["State3"]

    assert mock_session.commit.call_count == 2
    assert mock_session.rollback.call_count == 2


def test_per_state_failure_isolation_all_states_fail():
    """
    R2 & R4: Verify status is 'failed' when all states encounter errors.
    """
    states = {
        "Alpha": (10.0, 70.0),
        "Beta": (20.0, 80.0),
    }

    def mock_fetch(state, lat, lon, days_back=7, max_retries=5):
        raise ConnectionRefusedError(f"Connection refused for {state}")

    mock_session = MagicMock()

    with patch.dict(update_weather.STATE_COORDS, states, clear=True), \
         patch("update_weather.fetch_forecast_for_state", side_effect=mock_fetch), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=7, session=mock_session)

    assert summary["status"] == "failed"
    assert summary["total_states"] == 2
    assert summary["successful_states"] == []
    assert summary["failed_states"] == ["Alpha", "Beta"]
    assert summary["successful_count"] == 0
    assert summary["failed_count"] == 2
    assert summary["records_upserted"] == 0
    assert "ConnectionRefusedError" in summary["failed_state_errors"]["Alpha"]
    assert "ConnectionRefusedError" in summary["failed_state_errors"]["Beta"]

    assert mock_session.commit.call_count == 0
    assert mock_session.rollback.call_count == 2


def test_per_state_failure_isolation_api_timeout():
    """
    R4: Explicit test for API timeout failure isolation.
    """
    states = {
        "TimeoutState": (10.0, 70.0),
        "HealthyState": (20.0, 80.0),
    }

    def mock_fetch(state, lat, lon, days_back=7, max_retries=5):
        if state == "TimeoutState":
            raise urllib.error.URLError("timed out")
        return _make_daily_fixture(num_days=1)

    mock_session = MagicMock()

    with patch.dict(update_weather.STATE_COORDS, states, clear=True), \
         patch("update_weather.fetch_forecast_for_state", side_effect=mock_fetch), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=1, session=mock_session)

    assert summary["status"] == "partial_success"
    assert "TimeoutState" in summary["failed_states"]
    assert "HealthyState" in summary["successful_states"]
    assert "timed out" in summary["failed_state_errors"]["TimeoutState"]
    assert summary["records_upserted"] == 1


def test_per_state_failure_isolation_http_500():
    """
    R4: Explicit test for HTTP 500 error failure isolation.
    """
    states = {
        "ServerErrorState": (10.0, 70.0),
        "HealthyState": (20.0, 80.0),
    }

    def mock_fetch(state, lat, lon, days_back=7, max_retries=5):
        if state == "ServerErrorState":
            raise urllib.error.HTTPError("https://api.open-meteo.com", 500, "Internal Server Error", {}, BytesIO(b"Server Down"))
        return _make_daily_fixture(num_days=2)

    mock_session = MagicMock()

    with patch.dict(update_weather.STATE_COORDS, states, clear=True), \
         patch("update_weather.fetch_forecast_for_state", side_effect=mock_fetch), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=2, session=mock_session)

    assert summary["status"] == "partial_success"
    assert "ServerErrorState" in summary["failed_states"]
    assert "HealthyState" in summary["successful_states"]
    assert "HTTP Error 500: Internal Server Error" in summary["failed_state_errors"]["ServerErrorState"]
    assert summary["records_upserted"] == 2


def test_per_state_failure_isolation_database_upsert_failure():
    """
    R4: Explicit test for database upsert failure isolation.
    If session.execute raises OperationalError on one state, that state is rolled back,
    and remaining states succeed and are committed.
    """
    states = {
        "FailingDbState": (10.0, 70.0),
        "SucceedingDbState": (20.0, 80.0),
    }

    mock_session = MagicMock()

    def mock_execute(stmt):
        params = stmt.compile().params
        if any(v == "FailingDbState" for v in params.values()):
            raise OperationalError("INSERT", {}, Exception("deadlock detected"))
        return MagicMock()

    mock_session.execute.side_effect = mock_execute

    with patch.dict(update_weather.STATE_COORDS, states, clear=True), \
         patch("update_weather.fetch_forecast_for_state", return_value=_make_daily_fixture(num_days=1)), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=1, session=mock_session)

    assert summary["status"] == "partial_success"
    assert summary["failed_states"] == ["FailingDbState"]
    assert summary["successful_states"] == ["SucceedingDbState"]
    assert "OperationalError" in summary["failed_state_errors"]["FailingDbState"]
    assert summary["records_upserted"] == 1

    # Verify rollback was called for failing state, and commit for succeeding state
    assert mock_session.rollback.call_count == 1
    assert mock_session.commit.call_count == 1


def test_per_state_failure_isolation_retry_exhaustion():
    """
    R4: Explicit test verifying fetch_forecast_for_state exhausts all retries,
    raises, and update_weather isolates the failure to that state.
    """
    states = {
        "FlakyState": (10.0, 70.0),
        "GoodState": (20.0, 80.0),
    }

    mock_session = MagicMock()
    urlopen_calls = []

    def mock_urlopen(req, timeout=20):
        url = req.full_url
        urlopen_calls.append(url)
        if "latitude=10.0" in url:
            raise urllib.error.URLError("Persistent network partition")
        return MockHttpResponse(_make_daily_fixture(num_days=1))

    with patch.dict(update_weather.STATE_COORDS, states, clear=True), \
         patch("urllib.request.urlopen", side_effect=mock_urlopen), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=1, session=mock_session)

    # FlakyState exhausted 5 retries (default max_retries=5)
    flaky_calls = [u for u in urlopen_calls if "latitude=10.0" in u]
    assert len(flaky_calls) == 5

    assert summary["status"] == "partial_success"
    assert summary["failed_states"] == ["FlakyState"]
    assert summary["successful_states"] == ["GoodState"]
    assert summary["records_upserted"] == 1


def test_summary_count_accuracy_and_structure():
    """
    R2 & R4: Verify structured ingestion summary counts and fields.
    """
    states = {f"State_{i}": (float(i), float(i)) for i in range(5)}

    def mock_fetch(state, lat, lon, days_back=7, max_retries=5):
        if state in ("State_1", "State_3"):
            raise ValueError(f"Invalid state data for {state}")
        # State_0 -> 1 day, State_2 -> 2 days, State_4 -> 3 days
        idx = int(state.split("_")[1])
        num_days = idx if idx > 0 else 1
        return _make_daily_fixture(num_days=num_days)

    mock_session = MagicMock()

    with patch.dict(update_weather.STATE_COORDS, states, clear=True), \
         patch("update_weather.fetch_forecast_for_state", side_effect=mock_fetch), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=7, session=mock_session)

    assert summary["status"] == "partial_success"
    assert summary["total_states"] == 5
    assert summary["successful_count"] == 3
    assert summary["failed_count"] == 2
    assert summary["successful_states"] == ["State_0", "State_2", "State_4"]
    assert summary["failed_states"] == ["State_1", "State_3"]
    # records: 1 (State_0) + 2 (State_2) + 4 (State_4) = 7
    assert summary["records_upserted"] == 7
    assert summary["records_inserted_or_updated"] == 7
    assert len(summary["failed_state_errors"]) == 2
    assert "ValueError: Invalid state data for State_1" in summary["failed_state_errors"]["State_1"]
    assert "ValueError: Invalid state data for State_3" in summary["failed_state_errors"]["State_3"]


def test_run_ingestion_lock_released_upon_partial_and_total_failure():
    """
    R2 & R4: Verify advisory lock is reliably released in finally block
    both when ingestion yields 'partial_success' and when it yields 'failed'.
    """
    mock_session = MagicMock()
    mock_session.execute.return_value.scalar.return_value = True

    # 1. Partial success: lock released, cache cleared, timestamp updated
    partial_summary = {
        "status": "partial_success",
        "total_states": 2,
        "successful_states": ["A"],
        "failed_states": ["B"],
        "successful_count": 1,
        "failed_count": 1,
        "records_upserted": 5,
        "records_inserted_or_updated": 5,
        "failed_state_errors": {"B": "Timeout"},
    }

    with patch("app.services.ingestion_service.SessionLocal", return_value=mock_session), \
         patch("update_weather.update_weather", return_value=partial_summary), \
         patch("app.services.ingestion_service.clear_forecast_cache") as mock_clear:
        res = run_ingestion_with_lock(days_back=7)

    assert res["status"] == "partial_success"
    assert res["records_upserted"] == 5
    assert res["last_ingested_at"] is not None
    mock_clear.assert_called_once()

    executed_sql = [str(call_args[0][0]) for call_args in mock_session.execute.call_args_list]
    assert any(f"pg_advisory_unlock({ADVISORY_LOCK_ID})" in sql for sql in executed_sql)

    # 2. Total failure: lock released, cache NOT cleared
    mock_session.reset_mock()
    mock_session.execute.return_value.scalar.return_value = True

    failed_summary = {
        "status": "failed",
        "total_states": 2,
        "successful_states": [],
        "failed_states": ["A", "B"],
        "successful_count": 0,
        "failed_count": 2,
        "records_upserted": 0,
        "records_inserted_or_updated": 0,
        "failed_state_errors": {"A": "Err1", "B": "Err2"},
    }

    with patch("app.services.ingestion_service.SessionLocal", return_value=mock_session), \
         patch("update_weather.update_weather", return_value=failed_summary), \
         patch("app.services.ingestion_service.clear_forecast_cache") as mock_clear:
        res = run_ingestion_with_lock(days_back=7)

    assert res["status"] == "failed"
    assert res["records_upserted"] == 0
    mock_clear.assert_not_called()

    executed_sql = [str(call_args[0][0]) for call_args in mock_session.execute.call_args_list]
    assert any(f"pg_advisory_unlock({ADVISORY_LOCK_ID})" in sql for sql in executed_sql)
    mock_session.close.assert_called_once()


def test_successful_states_persist_when_subsequent_states_fail():
    """
    Acceptance Criteria: Successful states are committed and persisted;
    failure of subsequent states does not roll back previously succeeded states.
    """
    states = {
        "StateSuccess": (12.0, 76.0),
        "StateFail": (13.0, 77.0),
    }

    mock_session = MagicMock()
    transaction_events = []

    def mock_commit():
        transaction_events.append("commit")

    def mock_rollback():
        transaction_events.append("rollback")

    mock_session.commit.side_effect = mock_commit
    mock_session.rollback.side_effect = mock_rollback

    def mock_fetch(state, lat, lon, days_back=7, max_retries=5):
        if state == "StateFail":
            raise urllib.error.URLError("DNS resolution failed")
        return _make_daily_fixture(num_days=1)

    with patch.dict(update_weather.STATE_COORDS, states, clear=True), \
         patch("update_weather.fetch_forecast_for_state", side_effect=mock_fetch), \
         patch("time.sleep"):
        summary = update_weather.update_weather(days_back=1, session=mock_session)

    assert summary["status"] == "partial_success"
    assert summary["successful_states"] == ["StateSuccess"]
    assert summary["failed_states"] == ["StateFail"]
    assert summary["records_upserted"] == 1

    # Verify chronological sequence: commit happened for StateSuccess FIRST,
    # and rollback happened for StateFail SECOND without affecting the commit.
    assert transaction_events == ["commit", "rollback"]
