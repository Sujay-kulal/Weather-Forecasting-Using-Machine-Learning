"""
Regression tests for data provenance integrity:
Ensures uncompleted current-day forecast-derived estimates and future dates
are never stored in weather_data or consumed as historical ML lag features.
"""
from datetime import date, timedelta
import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import update_weather
from app.database import Base, get_db
from app.models import Prediction, WeatherData
from app.routes import prediction as prediction_routes
from app.services import feature_service, model_service
from app.services.feature_service import InsufficientHistoryError, build_features
from app.services.ingestion_service import run_ingestion_with_lock


def make_test_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


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


# ============================================================================
# 1. URL Parameter Invariant: Open-Meteo must be queried with forecast_days=0
# ============================================================================

def test_fetch_forecast_for_state_queries_forecast_days_zero():
    """Verify fetch_forecast_for_state explicitly requests forecast_days=0 to avoid forecast days."""
    fixture_data = {"daily": {"time": ["2026-11-08"]}}
    with patch("urllib.request.urlopen", return_value=MockHttpResponse(fixture_data)) as mock_urlopen:
        update_weather.fetch_forecast_for_state("Karnataka", 15.3173, 75.7139, days_back=7)

    assert mock_urlopen.call_count == 1
    req = mock_urlopen.call_args[0][0]
    assert "forecast_days=0" in req.full_url, f"Expected forecast_days=0 in URL, got {req.full_url}"
    assert "past_days=7" in req.full_url


# ============================================================================
# 2. Ingestion Filtering: Current-Day Incomplete Data & Future Dates Excluded
# ============================================================================

def test_update_weather_excludes_current_day_and_future_dates():
    """
    Verify that even if upstream returns current-day or future dates in the payload,
    update_weather strictly excludes any date >= today from entering weather_data.
    """
    controlled_today = date(2026, 11, 9)
    # Payload contains 2 completed past days, current day (today), and 1 future day
    payload = {
        "daily": {
            "time": ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"],
            "temperature_2m_max": [30.0, 31.0, 32.0, 33.0],
            "temperature_2m_min": [20.0, 21.0, 22.0, 23.0],
            "temperature_2m_mean": [25.0, 26.0, 27.0, 28.0],
            "precipitation_sum": [0.0, 0.5, 1.0, 2.0],
            "relative_humidity_2m_mean": [60.0, 62.0, 65.0, 70.0],
        }
    }

    session = make_test_session()
    try:
        with patch.dict(update_weather.STATE_COORDS, {"Karnataka": (15.3173, 75.7139)}, clear=True), \
             patch("update_weather.fetch_forecast_for_state", return_value=payload):
            summary = update_weather.update_weather(days_back=7, session=session, today=controlled_today)

        assert summary["status"] == "success"
        # Only 2 completed past dates (Nov 7 and Nov 8) must be upserted
        assert summary["records_upserted"] == 2

        stored_rows = session.execute(
            select(WeatherData.date).order_by(WeatherData.date.asc())
        ).scalars().all()

        assert stored_rows == [date(2026, 11, 7), date(2026, 11, 8)]
        assert date(2026, 11, 9) not in stored_rows, "Current-day date 2026-11-09 was erroneously ingested!"
        assert date(2026, 11, 10) not in stored_rows, "Future date 2026-11-10 was erroneously ingested!"
    finally:
        session.close()


def test_update_weather_idempotent_on_repeated_ingestion():
    """Verify repeated ingestion of the same completed records does not duplicate rows."""
    controlled_today = date(2026, 11, 9)
    payload = {
        "daily": {
            "time": ["2026-11-07", "2026-11-08"],
            "temperature_2m_max": [30.0, 31.0],
            "temperature_2m_min": [20.0, 21.0],
            "temperature_2m_mean": [25.0, 26.0],
            "precipitation_sum": [0.0, 0.5],
            "relative_humidity_2m_mean": [60.0, 62.0],
        }
    }

    session = make_test_session()
    try:
        with patch.dict(update_weather.STATE_COORDS, {"Karnataka": (15.3173, 75.7139)}, clear=True), \
             patch("update_weather.fetch_forecast_for_state", return_value=payload):
            # First pass
            update_weather.update_weather(days_back=7, session=session, today=controlled_today)
            assert session.scalar(select(func.count(WeatherData.id))) == 2

            # Second pass (repeated ingestion)
            update_weather.update_weather(days_back=7, session=session, today=controlled_today)
            assert session.scalar(select(func.count(WeatherData.id))) == 2
    finally:
        session.close()


# ============================================================================
# 3. Feature Selection: ML Pipeline Excludes Current-Day Uncompleted Data
# ============================================================================

def test_feature_selection_cannot_consume_current_day_observation_for_future_prediction():
    """
    Adversarial Check: Even if a record with date == today exists in weather_data
    (e.g. from a legacy ingestion before the fix), predicting for day D >= today+2 (e.g. Nov 11)
    MUST NOT consume today's record as lag-1 feature, and must reject with 422.
    """
    controlled_today = date(2026, 11, 9)
    session = make_test_session()
    try:
        # Insert 7 consecutive days ending at 2026-11-09 (today)
        # Nov 3 through Nov 9
        for i in range(7):
            d = date(2026, 11, 3) + timedelta(days=i)
            session.add(WeatherData(
                state="Karnataka",
                district="",
                location="",
                date=d,
                temp_max=30.0,
                temp_min=20.0,
                temp_avg=25.0 + i * 0.1,
                humidity=60.0,
                rainfall=0.0,
            ))
        session.commit()

        app = FastAPI()
        app.include_router(prediction_routes.router)
        app.state.pipeline = object()
        app.state.today = controlled_today

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db

        with patch.object(model_service, "model_info", {"states": ["Karnataka"], "best_model": "LightGBM"}), \
             TestClient(app) as client:
            # Requesting forecast for Nov 11 (asof = Nov 10, required D-2 = Nov 9)
            resp = client.post("/predict", json={"state": "Karnataka", "forecast_date": "2026-11-11"})

        # Must reject with 422 because Nov 9 is excluded (date < today = Nov 9).
        # With 7 rows (Nov 3..Nov 9), excluding Nov 9 leaves only 6 completed records,
        # so it fails with Insufficient historical data.
        assert resp.status_code == 422
        detail = resp.json().get("detail", "")
        assert "Insufficient historical data" in detail
        assert "found 6" in detail
    finally:
        session.close()


def test_feature_selection_with_7_prior_records_rejects_because_D_minus_2_is_uncompleted():
    """
    Verify that when 8 records (Nov 2..Nov 9) exist in database, excluding Nov 9 (today)
    leaves 7 valid records (Nov 2..Nov 8), but predicting Nov 11 requires D-2 = Nov 9.
    Because Nov 9 is excluded, the latest record is Nov 8 (D-3), so consecutive day check fails.
    """
    controlled_today = date(2026, 11, 9)
    session = make_test_session()
    try:
        # Insert 8 consecutive days: Nov 2 through Nov 9 (today)
        for i in range(8):
            d = date(2026, 11, 2) + timedelta(days=i)
            session.add(WeatherData(
                state="Karnataka",
                district="",
                location="",
                date=d,
                temp_max=30.0,
                temp_min=20.0,
                temp_avg=25.0 + i * 0.1,
                humidity=60.0,
                rainfall=0.0,
            ))
        session.commit()

        app = FastAPI()
        app.include_router(prediction_routes.router)
        app.state.pipeline = object()
        app.state.today = controlled_today

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db

        with patch.object(model_service, "model_info", {"states": ["Karnataka"], "best_model": "LightGBM"}), \
             TestClient(app) as client:
            resp = client.post("/predict", json={"state": "Karnataka", "forecast_date": "2026-11-11"})

        assert resp.status_code == 422
        detail = resp.json().get("detail", "")
        assert "must represent 7 consecutive calendar days" in detail
        assert "Record at index 0 has date 2026-11-08, expected 2026-11-09" in detail
    finally:
        session.close()


def test_feature_selection_accepts_valid_completed_history_for_next_day_forecast():
    """
    Verify that for a valid next-day forecast (D = today + 1 = Nov 10),
    where completed observations exist from D-8 (Nov 2) through D-2 (Nov 8),
    the prediction succeeds cleanly with 200 OK.
    """
    controlled_today = date(2026, 11, 9)
    session = make_test_session()
    try:
        # Insert 7 consecutive completed days: Nov 2 through Nov 8 (D-8 to D-2 for target Nov 10)
        for i in range(7):
            d = date(2026, 11, 2) + timedelta(days=i)
            session.add(WeatherData(
                state="Karnataka",
                district="",
                location="",
                date=d,
                temp_max=30.0,
                temp_min=20.0,
                temp_avg=25.0,
                humidity=60.0,
                rainfall=0.0,
            ))
        session.commit()

        app = FastAPI()
        app.include_router(prediction_routes.router)
        app.state.pipeline = object()
        app.state.today = controlled_today

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db

        with patch.object(model_service, "model_info", {"states": ["Karnataka"], "best_model": "LightGBM"}), \
             patch.object(model_service, "predict", return_value=[25.5] * 7), \
             TestClient(app) as client:
            resp = client.post("/predict", json={"state": "Karnataka", "forecast_date": "2026-11-10"})

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["daily_forecasts"]) == 7
        assert data["last_known"]["date"] == "2026-11-08"
    finally:
        session.close()


def test_build_features_strictly_rejects_dates_on_or_after_today():
    """Verify build_features raises InsufficientHistoryError if any record date >= today."""
    controlled_today = date(2026, 11, 9)
    asof = date(2026, 11, 10)
    # History includes Nov 9 (today)
    history = [
        MagicMock(date=date(2026, 11, 9), temp_avg=25.0, temp_max=30.0, temp_min=20.0, humidity=60.0, rainfall=0.0),
        MagicMock(date=date(2026, 11, 8), temp_avg=25.0, temp_max=30.0, temp_min=20.0, humidity=60.0, rainfall=0.0),
        MagicMock(date=date(2026, 11, 7), temp_avg=25.0, temp_max=30.0, temp_min=20.0, humidity=60.0, rainfall=0.0),
        MagicMock(date=date(2026, 11, 6), temp_avg=25.0, temp_max=30.0, temp_min=20.0, humidity=60.0, rainfall=0.0),
        MagicMock(date=date(2026, 11, 5), temp_avg=25.0, temp_max=30.0, temp_min=20.0, humidity=60.0, rainfall=0.0),
        MagicMock(date=date(2026, 11, 4), temp_avg=25.0, temp_max=30.0, temp_min=20.0, humidity=60.0, rainfall=0.0),
        MagicMock(date=date(2026, 11, 3), temp_avg=25.0, temp_max=30.0, temp_min=20.0, humidity=60.0, rainfall=0.0),
    ]

    with pytest.raises(InsufficientHistoryError, match="cannot be on or after current date"):
        build_features(history, "Karnataka", asof, today=controlled_today)
