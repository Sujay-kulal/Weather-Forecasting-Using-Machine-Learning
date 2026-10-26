from datetime import date, datetime, timedelta, timezone
import math
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import Prediction, WeatherData
from app.routes import prediction as prediction_routes
from app.services.prediction_store import upsert_prediction
from app.services.temperature import normalize_temperature, round_temperature
from app.services.metrics_service import fill_missing_actuals, rolling_live_metrics
from evaluate_deployed_artifact import _metrics_by_horizon


def make_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    from sqlalchemy.orm import sessionmaker
    return sessionmaker(bind=engine, expire_on_commit=False)()


def test_prediction_upsert_deduplicates_same_model_forecast():
    session = make_session()
    try:
        values = dict(
            state="Karnataka",
            district="Bengaluru Urban",
            location="Bengaluru",
            forecast_date=date(2026, 10, 28),
            model_version="weather_model_v3",
        )
        upsert_prediction(session, **values, predicted_temp_avg=[22.0] * 7)
        upsert_prediction(session, **values, predicted_temp_avg=[23.0] * 7)
        assert session.scalar(select(func.count()).select_from(Prediction)) == 1
        record = session.scalar(select(Prediction))
        assert record.predicted_temp_avg == [23.0] * 7
        assert record.model_version == "weather_model_v3"
    finally:
        session.close()


def test_per_horizon_metrics_has_seven_days_and_standard_metrics():
    import numpy as np

    actual = np.array([[float(i + day) for day in range(7)] for i in range(4)])
    predicted = actual + 0.5
    metrics = _metrics_by_horizon(actual, predicted)
    assert list(metrics) == [f"day_{day}" for day in range(1, 8)]
    assert set(metrics["day_1"]) == {"MAE", "RMSE", "R2"}
    assert metrics["day_7"]["MAE"] == 0.5


def test_forecast_all_day_parameter_selects_requested_horizon(monkeypatch):
    session = make_session()
    try:
        for offset in range(1, 8):
            session.add(WeatherData(
                date=date(2025, 1, 8) - timedelta(days=offset),
                state="Karnataka",
                district="",
                location="",
                temp_max=30.0,
                temp_min=20.0,
                temp_avg=25.0,
                humidity=60.0,
                rainfall=0.0,
            ))
        session.commit()

        monkeypatch.setattr(prediction_routes.model_service, "model_info", {"states": ["Karnataka"]})
        monkeypatch.setattr(
            prediction_routes.model_service,
            "predict",
            lambda features, pipeline=None: [11.0, 12.0, 13.456, 14.0, 15.0, 16.0, 17.0],
        )
        app = FastAPI()
        app.include_router(prediction_routes.router)
        app.state.pipeline = object()

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db
        with TestClient(app) as client:
            response = client.get("/forecast/all?date=2025-01-09&day=3")
        assert response.status_code == 200
        assert response.json() == {"Karnataka": 13.46}
    finally:
        session.close()


def test_live_metrics_endpoint_returns_valid_empty_window():
    session = make_session()
    try:
        app = FastAPI()
        app.include_router(prediction_routes.router)

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db
        with TestClient(app) as client:
            response = client.get("/metrics/live")
        assert response.status_code == 200
        assert response.json()["rolling_days"] == 30
        assert response.json()["models"] == []
    finally:
        session.close()


def test_actual_backfill_and_live_mae_use_matching_series():
    session = make_session()
    try:
        today = date(2026, 10, 26)
        previous_day = today - timedelta(days=2)
        forecast_day = today - timedelta(days=1)
        session.add_all([
            WeatherData(
                date=previous_day, state="Karnataka", district="", location="",
                temp_max=15.0, temp_min=5.0, temp_avg=10.0, humidity=50.0, rainfall=0.0,
            ),
            WeatherData(
                date=forecast_day, state="Karnataka", district="", location="",
                temp_max=17.0, temp_min=7.0, temp_avg=12.0, humidity=50.0, rainfall=0.0,
            ),
            Prediction(
                state="Karnataka", district="", location="", forecast_date=forecast_day,
                predicted_temp_avg=[11.5] * 7, model_version="weather_model_v3",
                created_at=datetime.now(timezone.utc),
            ),
        ])
        session.commit()

        assert fill_missing_actuals(session, today=today) == 1
        metrics = rolling_live_metrics(session, today=today)
        assert metrics["models"][0]["model_version"] == "weather_model_v3"
        assert metrics["models"][0]["sample_count"] == 1
        assert metrics["models"][0]["model_mae"] == 0.5
        assert metrics["models"][0]["persistence_mae"] == 2.0
        assert metrics["models"][0]["skill_vs_persistence"] == 0.75
    finally:
        session.close()


def test_predictions_pagination_filters_and_total_count():
    session = make_session()
    try:
        for state, version in (
            ("Karnataka", "weather_model_v3"),
            ("Karnataka", "weather_model_v2"),
            ("Delhi", "weather_model_v3"),
        ):
            session.add(Prediction(
                state=state, district="", location="", forecast_date=date(2026, 10, 28),
                predicted_temp_avg=[20.0] * 7, model_version=version,
                created_at=datetime.now(timezone.utc) + timedelta(microseconds=len(session.new)),
            ))
        session.commit()
        app = FastAPI()
        app.include_router(prediction_routes.router)

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db
        with TestClient(app) as client:
            response = client.get("/predictions?state=karnataka&model_version=weather_model_v3&limit=1")
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["count"] == 1
        assert payload["limit"] == 1
        assert payload["offset"] == 0
        assert len(payload["predictions"]) == 1
    finally:
        session.close()


def test_model_info_exposes_artifact_evaluation_dates_and_horizons():
    app = FastAPI()
    app.include_router(prediction_routes.router)
    with TestClient(app) as client:
        response = client.get("/model-info")
    assert response.status_code == 200
    payload = response.json()
    assert payload["loaded_artifact_version"]
    assert len(payload["test_period"]) == 2
    assert all(value != "Not evaluated" for value in payload["test_period"])
    assert date.fromisoformat(payload["test_period"][0]) <= date.fromisoformat(payload["test_period"][1])
    assert set(payload["evaluation"]["metrics"]["LightGBM"]["by_horizon"]) == {
        f"day_{day}" for day in range(1, 8)
    }
    assert payload["validated_for_artifact"] is False


def test_negative_zero_is_normalized_before_api_output():
    assert round_temperature(-0.004, 2) == 0.0
    assert math.copysign(1.0, round_temperature(-0.004, 2)) == 1.0
    assert normalize_temperature(-0.04) == 0.0
