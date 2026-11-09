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


def test_predict_route_excludes_asof_and_future_weather_rows(monkeypatch):
    """The real POST /predict query must only use observations dated before D-1."""
    session = make_session()
    try:
        target_date = date(2025, 1, 10)
        # Include valid historical rows plus measurements on/after D-1.
        for offset in range(-10, 3):
            observed = target_date + timedelta(days=offset)
            value = float(100 + offset)
            session.add(WeatherData(
                date=observed,
                state="Karnataka",
                district="",
                location="",
                temp_max=value + 2,
                temp_min=value - 2,
                temp_avg=value,
                humidity=60.0 + offset,
                rainfall=float(offset + 11),
            ))
        session.commit()

        captured = {}

        def fake_predict(features, pipeline=None):
            captured["features"] = features.copy()
            return [24.0, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6]

        monkeypatch.setattr(prediction_routes.model_service, "predict", fake_predict)
        monkeypatch.setattr(
            prediction_routes.weather_forecast_service,
            "build_daily_forecasts",
            lambda history, forecast_date, predicted_temp_avg: ([], None),
        )

        app = FastAPI()
        app.include_router(prediction_routes.router)
        app.state.pipeline = object()

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db
        with TestClient(app) as client:
            response = client.post(
                "/predict",
                json={"state": "Karnataka", "forecast_date": target_date.isoformat()},
            )

        assert response.status_code == 200, response.text
        # asof = D-1 (Jan 9); the SQL predicate is date < asof,
        # so the newest usable observation is D-2 (Jan 8), value 98.
        assert captured["features"].iloc[0]["lag1_temp_avg"] == 98.0
        assert response.json()["last_known"]["date"] == "2025-01-08"
        assert response.json()["predicted_temp_avg"] == [24.0, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6]
    finally:
        session.close()


def test_weather_data_orm_unique_constraint_allows_multiple_districts():
    """DEF-02 Regression: Verify WeatherData ORM table args define only uq_weather_state_dist_loc_date,
    allowing multiple districts for the same state on the same date."""
    session = make_session()
    try:
        # Check constraints defined on WeatherData table
        constraint_names = {c.name for c in WeatherData.__table__.constraints if c.name}
        assert "uq_weather_state_dist_loc_date" in constraint_names
        assert "uq_weather_state_date" not in constraint_names, "Obsolete uq_weather_state_date must be dropped from ORM"

        # Verify multiple districts on the same date can be inserted without constraint violation
        d1 = WeatherData(
            date=date(2026, 10, 31), state="Karnataka", district="Bengaluru Urban", location="Bengaluru",
            temp_max=30.0, temp_min=20.0, temp_avg=25.0, humidity=60.0, rainfall=0.0
        )
        d2 = WeatherData(
            date=date(2026, 10, 31), state="Karnataka", district="Mysuru", location="Mysuru",
            temp_max=29.0, temp_min=19.0, temp_avg=24.0, humidity=65.0, rainfall=0.0
        )
        session.add_all([d1, d2])
        session.commit()

        count = session.scalar(select(func.count()).select_from(WeatherData))
        assert count == 2
    finally:
        session.close()


def test_predict_rejects_district_and_location_inputs():
    """Verify POST /predict strictly rejects district and location inputs to prevent fabricated ML forecasts."""
    session = make_session()
    try:
        app = FastAPI()
        app.include_router(prediction_routes.router)

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db
        with TestClient(app) as client:
            resp1 = client.post(
                "/predict",
                json={
                    "state": "Karnataka",
                    "district": "Udupi",
                    "forecast_date": "2026-11-01",
                },
            )
            assert resp1.status_code == 422
            assert "only supports statewide forecasts" in resp1.json()["detail"]

            resp2 = client.post(
                "/predict",
                json={
                    "state": "Karnataka",
                    "location": "Kundapura",
                    "forecast_date": "2026-11-01",
                },
            )
            assert resp2.status_code == 422
            assert "only supports statewide forecasts" in resp2.json()["detail"]
    finally:
        session.close()


def test_predict_rejects_unsupported_states():
    """Verify POST /predict strictly rejects unsupported states including 'Other' and non-33 states."""
    session = make_session()
    try:
        app = FastAPI()
        app.include_router(prediction_routes.router)

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db
        with TestClient(app) as client:
            resp1 = client.post(
                "/predict",
                json={"state": "Other", "forecast_date": "2026-11-01"},
            )
            assert resp1.status_code == 422
            assert "not supported by the deployed ML model" in resp1.json()["detail"]

            resp2 = client.post(
                "/predict",
                json={"state": "California", "forecast_date": "2026-11-01"},
            )
            assert resp2.status_code == 422
            assert "not supported by the deployed ML model" in resp2.json()["detail"]
    finally:
        session.close()


def test_predict_horizon_alignment_and_strict_seven_days(monkeypatch):
    """Verify POST /predict returns exactly 7 forecast days with sequential date alignment."""
    session = make_session()
    try:
        target_date = date(2025, 2, 10)
        asof = target_date - timedelta(days=1)
        for offset in range(1, 8):
            session.add(WeatherData(
                date=asof - timedelta(days=offset),
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

        monkeypatch.setattr(
            prediction_routes.model_service,
            "predict",
            lambda features, pipeline=None: [24.0, 24.2, 24.4, 24.6, 24.8, 25.0, 25.2],
        )

        app = FastAPI()
        app.include_router(prediction_routes.router)
        app.state.pipeline = object()

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db
        with TestClient(app) as client:
            response = client.post(
                "/predict",
                json={"state": "Karnataka", "forecast_date": target_date.isoformat()},
            )

        assert response.status_code == 200, response.text
        data = response.json()
        assert len(data["predicted_temp_avg"]) == 7
        assert len(data["daily_forecasts"]) == 7
        assert data["district"] == ""
        assert data["location"] == ""
        for i, df in enumerate(data["daily_forecasts"]):
            assert df["day"] == i + 1
            expected_date = (target_date + timedelta(days=i)).isoformat()
            assert df["date"] == expected_date
    finally:
        session.close()


def test_build_features_enforces_safety_and_contract():
    """Verify feature builder guards against invalid numerical values, future rows, and duplicate dates."""
    from app.services.feature_service import build_features, InsufficientHistoryError

    asof = date(2025, 6, 15)

    class MockRow:
        def __init__(self, d, avg, mx, mn, hum, rain):
            self.date = d
            self.temp_avg = avg
            self.temp_max = mx
            self.temp_min = mn
            self.humidity = hum
            self.rainfall = rain

    # 1. Less than 7 records
    short_history = [MockRow(asof - timedelta(days=i), 25.0, 30.0, 20.0, 60.0, 0.0) for i in range(1, 5)]
    try:
        build_features(short_history, "Karnataka", asof)
        assert False, "Should have raised InsufficientHistoryError"
    except InsufficientHistoryError as e:
        assert "Need 7 historical records" in str(e)

    # 2. Record dated on or after asof (future-data leakage attempt)
    leakage_history = [MockRow(asof, 25.0, 30.0, 20.0, 60.0, 0.0)] + [
        MockRow(asof - timedelta(days=i), 25.0, 30.0, 20.0, 60.0, 0.0) for i in range(1, 7)
    ]
    try:
        build_features(leakage_history, "Karnataka", asof)
        assert False, "Should have raised InsufficientHistoryError for date >= asof"
    except InsufficientHistoryError as e:
        assert "not strictly before asof" in str(e)

    # 3. Duplicate dates
    dup_history = [
        MockRow(asof - timedelta(days=1), 25.0, 30.0, 20.0, 60.0, 0.0),
        MockRow(asof - timedelta(days=1), 25.5, 30.5, 20.5, 61.0, 0.0),
    ] + [MockRow(asof - timedelta(days=i), 25.0, 30.0, 20.0, 60.0, 0.0) for i in range(3, 8)]
    try:
        build_features(dup_history, "Karnataka", asof)
        assert False, "Should have raised InsufficientHistoryError for duplicate dates"
    except InsufficientHistoryError as e:
        assert "duplicate dates" in str(e)

    # 4. NaN / non-finite values
    nan_history = [
        MockRow(asof - timedelta(days=1), float("nan"), 30.0, 20.0, 60.0, 0.0)
    ] + [MockRow(asof - timedelta(days=i), 25.0, 30.0, 20.0, 60.0, 0.0) for i in range(2, 8)]
    try:
        build_features(nan_history, "Karnataka", asof)
        assert False, "Should have raised InsufficientHistoryError for NaN"
    except InsufficientHistoryError as e:
        assert "invalid or missing value" in str(e)


def test_location_weather_lookup_never_claims_ml_for_city_or_district(monkeypatch):
    """Verify lookup_location_weather serves provider forecasts for cities, never fabricated ML predictions."""
    from app.schemas import LocationOption
    from app.services.location_weather_service import lookup_location_weather
    from app.services import open_meteo_service

    session = make_session()
    try:
        # Mock Open-Meteo forecast provider
        mock_provider_weather = open_meteo_service.ProviderWeather(
            temperature=28.5,
            temperature_min=22.0,
            temperature_max=32.0,
            humidity=55.0,
            rainfall=0.0,
            wind_speed=12.0,
            weather_code=1,
            weather_description="Mainly Clear",
        )
        monkeypatch.setattr(
            open_meteo_service,
            "fetch_forecast_weather",
            lambda lat, lon, req_date, today=None: mock_provider_weather,
        )

        city_option = LocationOption(
            name="Bengaluru",
            district="Bengaluru Urban",
            state="Karnataka",
            latitude=12.97,
            longitude=77.59,
            scope="place",
        )

        today_val = date(2026, 11, 1)
        future_val = date(2026, 11, 5)

        # Query city for future date
        result = lookup_location_weather(
            city_option,
            future_val,
            session,
            today=today_val,
        )

        # Must be genuine Weather API Forecast, NEVER ML Prediction
        assert result.source == "Weather API Forecast"
        assert result.model is None
        assert result.temperature == 28.5
    finally:
        session.close()
def test_feature_service_consecutive_calendar_days_invariant():
    """Verify build_features strictly enforces consecutive calendar days D-2 down to D-8."""
    from app.services.feature_service import build_features, InsufficientHistoryError

    asof = date(2026, 11, 9)  # D = 2026-11-10, asof = D-1 = 2026-11-09

    class MockRow:
        def __init__(self, d, avg=25.0, mx=30.0, mn=20.0, hum=60.0, rain=0.0):
            self.date = d
            self.temp_avg = avg
            self.temp_max = mx
            self.temp_min = mn
            self.humidity = hum
            self.rainfall = rain

    # 1. Seven consecutive daily records (D-2 through D-8) are accepted
    consecutive_dates = [asof - timedelta(days=i) for i in range(1, 8)]
    # i.e. [2026-11-08, 2026-11-07, 2026-11-06, 2026-11-05, 2026-11-04, 2026-11-03, 2026-11-02]
    valid_history = [MockRow(d, avg=20.0 + i) for i, d in enumerate(consecutive_dates)]
    df = build_features(valid_history, "Karnataka", asof)
    assert len(df) == 1
    assert df.iloc[0]["lag1_temp_avg"] == 20.0  # D-2
    assert df.iloc[0]["lag2_temp_avg"] == 21.0  # D-3
    assert df.iloc[0]["lag3_temp_avg"] == 22.0  # D-4

    # 2. One missing date in the middle is rejected (e.g. D-5 missing, D-9 included)
    mid_missing_dates = [
        asof - timedelta(days=1),  # D-2
        asof - timedelta(days=2),  # D-3
        asof - timedelta(days=3),  # D-4
        # D-5 is skipped
        asof - timedelta(days=5),  # D-6
        asof - timedelta(days=6),  # D-7
        asof - timedelta(days=7),  # D-8
        asof - timedelta(days=8),  # D-9
    ]
    mid_missing_history = [MockRow(d) for d in mid_missing_dates]
    try:
        build_features(mid_missing_history, "Karnataka", asof)
        assert False, "Should have raised InsufficientHistoryError for middle date gap"
    except InsufficientHistoryError as e:
        assert "must represent 7 consecutive calendar days" in str(e)
        assert "expected 2026-11-05" in str(e)

    # 3. Missing latest observation is rejected (D-2 missing, starts at D-3 down to D-9)
    latest_missing_dates = [asof - timedelta(days=i) for i in range(2, 9)]
    latest_missing_history = [MockRow(d) for d in latest_missing_dates]
    try:
        build_features(latest_missing_history, "Karnataka", asof)
        assert False, "Should have raised InsufficientHistoryError for missing latest observation"
    except InsufficientHistoryError as e:
        assert "must represent 7 consecutive calendar days" in str(e)
        assert "expected 2026-11-08" in str(e)

    # 4. Missing oldest observation is rejected (D-8 missing, has D-2..D-7 and D-9)
    oldest_missing_dates = [asof - timedelta(days=i) for i in range(1, 7)] + [asof - timedelta(days=8)]
    oldest_missing_history = [MockRow(d) for d in oldest_missing_dates]
    try:
        build_features(oldest_missing_history, "Karnataka", asof)
        assert False, "Should have raised InsufficientHistoryError for missing oldest observation"
    except InsufficientHistoryError as e:
        assert "must represent 7 consecutive calendar days" in str(e)
        assert "expected 2026-11-02" in str(e)

    # 5. Duplicate dates remain rejected
    dup_history = [MockRow(asof - timedelta(days=1))] * 2 + [MockRow(asof - timedelta(days=i)) for i in range(3, 8)]
    try:
        build_features(dup_history, "Karnataka", asof)
        assert False, "Should have raised InsufficientHistoryError for duplicate dates"
    except InsufficientHistoryError as e:
        assert "duplicate dates" in str(e)

    # 6. Future-dated records remain rejected (date >= asof)
    future_history = [MockRow(asof)] + [MockRow(asof - timedelta(days=i)) for i in range(1, 7)]
    try:
        build_features(future_history, "Karnataka", asof)
        assert False, "Should have raised InsufficientHistoryError for future observation"
    except InsufficientHistoryError as e:
        assert "not strictly before asof" in str(e)

    # 7. Existing valid feature values and 20-feature ordering remain unchanged
    expected_feature_cols = [
        "lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg",
        "lag1_temp_max", "lag1_temp_min", "lag1_humidity", "lag1_rainfall",
        "lag2_humidity", "lag2_rainfall", "temp_range",
        "roll3_temp_avg", "roll7_temp_avg", "rainfall_roll3", "rainfall_roll7",
        "month_sin", "month_cos", "day_of_year_sin", "day_of_year_cos",
        "Season", "State"
    ]
    assert list(df.columns) == expected_feature_cols
    # Verify exact calculations on test inputs
    test_rows = [
        MockRow(asof - timedelta(days=1), avg=25.0, mx=30.0, mn=20.0, hum=60.0, rain=2.0),
        MockRow(asof - timedelta(days=2), avg=24.0, mx=29.0, mn=19.0, hum=65.0, rain=5.0),
        MockRow(asof - timedelta(days=3), avg=23.0, mx=28.0, mn=18.0, hum=70.0, rain=0.0),
        MockRow(asof - timedelta(days=4), avg=22.0, mx=27.0, mn=17.0, hum=75.0, rain=1.0),
        MockRow(asof - timedelta(days=5), avg=21.0, mx=26.0, mn=16.0, hum=80.0, rain=0.0),
        MockRow(asof - timedelta(days=6), avg=20.0, mx=25.0, mn=15.0, hum=85.0, rain=3.0),
        MockRow(asof - timedelta(days=7), avg=19.0, mx=24.0, mn=14.0, hum=90.0, rain=4.0),
    ]
    df_calc = build_features(test_rows, "Kerala", asof)
    assert df_calc.iloc[0]["lag1_temp_avg"] == 25.0
    assert df_calc.iloc[0]["lag2_temp_avg"] == 24.0
    assert df_calc.iloc[0]["lag3_temp_avg"] == 23.0
    assert df_calc.iloc[0]["lag1_temp_max"] == 30.0
    assert df_calc.iloc[0]["lag1_temp_min"] == 20.0
    assert df_calc.iloc[0]["temp_range"] == 10.0
    assert df_calc.iloc[0]["lag1_humidity"] == 60.0
    assert df_calc.iloc[0]["lag2_humidity"] == 65.0
    assert df_calc.iloc[0]["lag1_rainfall"] == 2.0
    assert df_calc.iloc[0]["lag2_rainfall"] == 5.0
    assert abs(df_calc.iloc[0]["roll3_temp_avg"] - 24.0) < 1e-6
    assert abs(df_calc.iloc[0]["roll7_temp_avg"] - 22.0) < 1e-6
    assert df_calc.iloc[0]["rainfall_roll3"] == 7.0
    assert df_calc.iloc[0]["rainfall_roll7"] == 15.0
    assert df_calc.iloc[0]["State"] == "Kerala"
    assert df_calc.iloc[0]["Season"] == "Post-Monsoon"


def test_predict_endpoint_enforces_consecutive_calendar_days_invariant(monkeypatch):
    """Verify POST /predict returns HTTP 422 when historical observations are non-consecutive or missing."""
    target_date = date(2026, 11, 10)  # asof = 2026-11-09
    asof = target_date - timedelta(days=1)

    monkeypatch.setattr(
        prediction_routes.model_service,
        "predict",
        lambda features, pipeline=None: [25.0, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6],
    )
    monkeypatch.setattr(
        prediction_routes.weather_forecast_service,
        "build_daily_forecasts",
        lambda history, forecast_date, predicted_temp_avg: ([], None),
    )

    def _setup_app_with_dates(dates_list):
        session = make_session()
        for d in dates_list:
            session.add(WeatherData(
                date=d,
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
        app = FastAPI()
        app.include_router(prediction_routes.router)
        app.state.pipeline = object()

        def override_db():
            yield session

        app.dependency_overrides[get_db] = override_db
        return app, session

    # 1. Consecutive D-2 through D-8 -> HTTP 200
    prediction_routes.prediction_cache.clear()
    consecutive_dates = [asof - timedelta(days=i) for i in range(1, 8)]
    app1, s1 = _setup_app_with_dates(consecutive_dates)
    try:
        with TestClient(app1) as client:
            resp = client.post("/predict", json={"state": "Karnataka", "forecast_date": target_date.isoformat()})
            assert resp.status_code == 200, resp.text
            assert resp.json()["predicted_temp_avg"] == [25.0, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6]
    finally:
        s1.close()

    # 2. Missing date in middle (D-5 missing, has D-9) -> HTTP 422
    prediction_routes.prediction_cache.clear()
    mid_missing_dates = [asof - timedelta(days=i) for i in (1, 2, 3, 5, 6, 7, 8)]
    app2, s2 = _setup_app_with_dates(mid_missing_dates)
    try:
        with TestClient(app2) as client:
            resp = client.post("/predict", json={"state": "Karnataka", "forecast_date": target_date.isoformat()})
            assert resp.status_code == 422
            assert "consecutive calendar days" in resp.json()["detail"]
    finally:
        s2.close()

    # 3. Missing latest observation (D-2 missing, latest is D-3) -> HTTP 422
    prediction_routes.prediction_cache.clear()
    latest_missing_dates = [asof - timedelta(days=i) for i in range(2, 9)]
    app3, s3 = _setup_app_with_dates(latest_missing_dates)
    try:
        with TestClient(app3) as client:
            resp = client.post("/predict", json={"state": "Karnataka", "forecast_date": target_date.isoformat()})
            assert resp.status_code == 422
            assert "consecutive calendar days" in resp.json()["detail"]
    finally:
        s3.close()

    # 4. Missing oldest observation (D-8 missing, has D-2..D-7 and D-9) -> HTTP 422
    prediction_routes.prediction_cache.clear()
    oldest_missing_dates = [asof - timedelta(days=i) for i in range(1, 7)] + [asof - timedelta(days=8)]
    app4, s4 = _setup_app_with_dates(oldest_missing_dates)
    try:
        with TestClient(app4) as client:
            resp = client.post("/predict", json={"state": "Karnataka", "forecast_date": target_date.isoformat()})
            assert resp.status_code == 422
            assert "consecutive calendar days" in resp.json()["detail"]
    finally:
        s4.close()

    # 5. Future record only (has D-1 and D-2..D-7, so only 6 records before asof) -> HTTP 422
    prediction_routes.prediction_cache.clear()
    future_leakage_dates = [asof] + [asof - timedelta(days=i) for i in range(1, 7)]
    app5, s5 = _setup_app_with_dates(future_leakage_dates)
    try:
        with TestClient(app5) as client:
            resp = client.post("/predict", json={"state": "Karnataka", "forecast_date": target_date.isoformat()})
            assert resp.status_code == 422
            assert "Insufficient historical data" in resp.json()["detail"]
    finally:
        s5.close()
