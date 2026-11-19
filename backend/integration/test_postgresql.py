"""PostgreSQL checks. Run with a disposable localhost database ending in _test."""

import json
import os
import sys
from collections import Counter
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool
from sqlalchemy.schema import CreateSchema, DropSchema

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import database
from app.database_url import postgres_url
from app.main import app
from app.models import Prediction, WeatherData
from app.services import ingestion_service
from app.services.open_meteo_service import india_today
from app.services.metrics_service import fill_missing_actuals, rolling_live_metrics
from app.services.prediction_store import target_start_utc, upsert_prediction
from migrate_db import migrate
from import_data import import_weather_dataframe


@pytest.fixture
def pg_engine():
    url = postgres_url(os.environ["WEATHER_TEST_DATABASE_URL"])
    if url.host not in {"localhost", "127.0.0.1"} or not (url.database or "").endswith("_test"):
        pytest.fail("A local disposable PostgreSQL database ending in _test is required")
    if "host" in url.query or "hostaddr" in url.query:
        pytest.fail("The PostgreSQL test URL must use the localhost address in its authority")
    schema = f"weathercheck_{uuid4().hex}"
    admin_engine = create_engine(url, hide_parameters=True, connect_args={"connect_timeout": 5})
    with admin_engine.begin() as conn:
        assert conn.scalar(text("SELECT current_database()")) == url.database
        conn.execute(CreateSchema(schema))
    engine = create_engine(url, hide_parameters=True, connect_args={"options": f"-csearch_path={schema}"})
    try:
        yield engine
    finally:
        engine.dispose()
        with admin_engine.begin() as conn:
            conn.execute(DropSchema(schema, cascade=True))
        admin_engine.dispose()


def test_migration_preserves_legacy_rows_and_can_rerun(pg_engine):
    with pg_engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE weather_data (
              id serial PRIMARY KEY, state varchar(100) NOT NULL, date date NOT NULL,
              temp_max double precision, temp_min double precision, temp_avg double precision,
              rainfall double precision, humidity double precision,
              CONSTRAINT uq_weather_state_date UNIQUE (state, date)
            )
        """))
        conn.execute(text("INSERT INTO weather_data (state, date, temp_avg) VALUES ('Kerala', '2025-01-01', 25)"))
    migrate(pg_engine)
    migrate(pg_engine)
    assert {item["name"] for item in inspect(pg_engine).get_unique_constraints("weather_data")} == {
        "uq_weather_state_dist_loc_date",
    }
    with pg_engine.connect() as conn:
        assert tuple(conn.execute(text("SELECT state, district, location, temp_avg FROM weather_data")).one()) == (
            "Kerala", "", "", 25.0,
        )


def test_real_postgres_serves_and_deduplicates_forecasts(pg_engine, monkeypatch):
    migrate(pg_engine)
    monkeypatch.setattr(database, "engine", pg_engine)
    monkeypatch.setenv("ENABLE_INGESTION_SCHEDULER", "false")
    target = india_today() + timedelta(days=1)
    with Session(pg_engine) as db:
        # Deterministic test rows exercise database behavior. Provider ingestion is verified separately.
        db.add_all([
            WeatherData(state="Karnataka", district="", location="", date=target - timedelta(days=i),
                        temp_min=20, temp_max=32, temp_avg=25, humidity=65, rainfall=1)
            for i in range(2, 9)
        ])
        db.commit()

    def isolated_session():
        with Session(pg_engine) as db:
            yield db

    monkeypatch.setitem(app.dependency_overrides, database.get_db, isolated_session)
    with TestClient(app) as client:
        assert client.get("/ready").status_code == 200
        assert client.get("/states").json()["model_states"] == ["Karnataka"]
        params = {"state": "Karnataka", "forecast_date": target.isoformat()}
        prediction = client.post("/predict", json=params)
        assert prediction.status_code == 200, prediction.text
        parsed = prediction.json()
        assert len(parsed["predicted_temp_avg"]) == 7
        assert parsed["daily_forecasts"][-1]["date"] == (target + timedelta(days=6)).isoformat()
        assert client.post("/predict", json=params).status_code == 200
        archive = client.get("/predictions", params={"state": "Karnataka", "limit": 1, "q": target.isoformat()}).json()
        assert archive["total"] == archive["stored_count"] == 1
        stored = archive["predictions"][0]["predicted_temp_avg"]
        assert [round(value, 2) for value in stored] == parsed["predicted_temp_avg"]
        assert client.get("/forecast/all", params={"day": 7}).json() == {"Karnataka": parsed["predicted_temp_avg"][-1]}
        assert client.get("/weather/Karnataka", params={"start_date": (target - timedelta(days=4)).isoformat()}).json()["count"] == 3
        assert client.get("/weather/Karnataka", params={"start_date": target.isoformat(), "end_date": "2025-01-01"}).status_code == 422
        assert client.post("/predict", json=dict(params, forecast_date="0001-01-01")).status_code == 422
        assert client.post("/predict", json=dict(params, state="Other")).status_code == 422
        assert client.post("/admin/ingest").status_code == 401


def test_ingestion_lock_survives_commit_and_releases_on_error(pg_engine, monkeypatch):
    statement = text("SELECT pg_try_advisory_lock(:key)")
    unlock = text("SELECT pg_advisory_unlock(:key)")
    params = {"key": ingestion_service.ADVISORY_LOCK_ID}
    monkeypatch.setattr(ingestion_service, "engine", pg_engine)

    def fail_after_commit(days_back, session):
        assert session.scalar(text("SELECT 1")) == 1
        session.commit()
        with pg_engine.connect() as contender:
            assert contender.scalar(statement, params) is False
        raise RuntimeError("forced ingestion failure")

    monkeypatch.setattr(ingestion_service.update_weather, "update_weather", fail_after_commit)
    with pytest.raises(RuntimeError, match="forced ingestion failure"):
        ingestion_service.run_ingestion_with_lock()
    with pg_engine.connect() as contender:
        assert contender.scalar(statement, params) is True
        assert contender.scalar(unlock, params) is True


@pytest.fixture
def direct_ingestion_on_postgres(pg_engine, monkeypatch):
    """Test the Neon endpoint selection while executing the lock on real local PostgreSQL."""
    migrate(pg_engine)
    with pg_engine.connect() as conn:
        schema = conn.scalar(text("SELECT current_schema()"))

    serving_url = pg_engine.url.set(host="ep-integration-pooler.example.neon.tech")
    serving_engine = Mock(url=serving_url)

    def open_local_direct_engine(url, *, poolclass, connect_args, hide_parameters):
        assert url == serving_url.set(host="ep-integration.example.neon.tech")
        assert poolclass is NullPool
        assert hide_parameters is True
        return create_engine(
            pg_engine.url, poolclass=poolclass, hide_parameters=hide_parameters,
            connect_args={**connect_args, "options": f"-csearch_path={schema}"},
        )

    monkeypatch.setattr(ingestion_service, "engine", serving_engine)
    monkeypatch.setattr(ingestion_service, "create_engine", open_local_direct_engine)
    monkeypatch.setattr(database, "engine", pg_engine)
    monkeypatch.setenv("ENABLE_INGESTION_SCHEDULER", "false")
    yield
    serving_engine.connect.assert_not_called()


def test_admin_ingestion_retries_and_preserves_weather_and_predictions(pg_engine, direct_ingestion_on_postgres, monkeypatch):
    today = india_today()
    prior_day = today - timedelta(days=2)
    latest_day = today - timedelta(days=1)
    historical_day = today - timedelta(days=90)
    with Session(pg_engine) as session:
        session.add_all([
            WeatherData(state="Goa", district="", location="", date=day,
                        temp_min=20, temp_max=30, temp_avg=23, humidity=63, rainfall=0)
            for day in (historical_day, prior_day)
        ])
        prediction = Prediction(state="Goa", district="", location="", forecast_date=latest_day,
                                predicted_temp_avg=[22.0] * 7, model_version="weather_model_v3")
        session.add(prediction)
        session.flush()
        prediction_id = prediction.id
        session.commit()

    source = ingestion_service.update_weather
    coords = {"Goa": (15.2993, 74.124), "Karnataka": (15.3173, 75.7139)}
    monkeypatch.setattr(source, "STATE_COORDS", coords)
    monkeypatch.setattr(source, "time", SimpleNamespace(sleep=lambda _: None))
    monkeypatch.setattr(source, "get_india_today", lambda: today)
    monkeypatch.setenv("ADMIN_TOKEN", "local-test-token")

    calls = Counter()
    recovering = False
    payload = json.dumps({"daily": {
        "time": [day.isoformat() for day in (prior_day, latest_day, today)],
        "temperature_2m_min": [21, 21, 21], "temperature_2m_max": [33, 33, 33],
        "temperature_2m_mean": [27, 27, 27], "relative_humidity_2m_mean": [60, 62, 65],
        "precipitation_sum": [0, 0, 0],
    }}).encode()

    def provider(request, *, timeout):
        query = parse_qs(urlsplit(request.full_url).query)
        assert query["past_days"] == ["7"]
        assert query["forecast_days"] == ["0"]
        state = "Goa" if float(query["latitude"][0]) == coords["Goa"][0] else "Karnataka"
        calls[state] += 1
        if state == "Goa" and calls[state] == 1:
            raise URLError("transient provider failure")
        if state == "Karnataka" and not recovering:
            if calls[state] == 1:
                # Goa's commit is visible, yet another worker still cannot take the lock.
                with Session(pg_engine) as observer:
                    row = observer.scalar(select(WeatherData).where(WeatherData.state == "Goa", WeatherData.date == latest_day))
                    assert row.temp_avg == 27
                assert ingestion_service.run_ingestion_with_lock()["reason"] == "advisory_lock_held"
            raise URLError("regional provider failure")
        return BytesIO(payload)

    monkeypatch.setattr(source.urllib.request, "urlopen", provider)
    headers = {"X-Admin-Token": "local-test-token"}
    with TestClient(app) as client:
        response = client.post("/admin/ingest?days_back=7", headers=headers)
        assert response.status_code == 200
        first = response.json()
        assert first["status"] == "partial_success"
        assert first["records_inserted"] == 1
        assert first["failed_states"] == ["Karnataka"]
        assert calls == {"Goa": 2, "Karnataka": 5}

        recovering = True
        response = client.post("/admin/ingest?days_back=7", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert response.json()["records_inserted"] == 2
        response = client.post("/admin/ingest?days_back=7", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert response.json()["records_inserted"] == 0

    with Session(pg_engine) as session:
        assert {(row.state, row.date): row.temp_avg for row in session.scalars(select(WeatherData))} == {
            ("Goa", historical_day): 23, ("Goa", prior_day): 23, ("Goa", latest_day): 27,
            ("Karnataka", prior_day): 27, ("Karnataka", latest_day): 27,
        }
        prediction = session.scalars(select(Prediction)).one()
        assert prediction.id == prediction_id
        assert prediction.predicted_temp_avg == [22.0] * 7
        assert prediction.actual_temp is None


def test_direct_ingestion_does_not_reconnect_after_losing_lock(pg_engine, direct_ingestion_on_postgres, monkeypatch):
    source = ingestion_service.update_weather
    coords = {"Goa": (15.3, 74.1), "Karnataka": (15.4, 75.7), "Kerala": (10.9, 76.3)}
    monkeypatch.setattr(source, "STATE_COORDS", coords)
    monkeypatch.setattr(source, "time", SimpleNamespace(sleep=lambda _: None))
    today = india_today()
    payload = {"daily": {
        "time": [(today - timedelta(days=1)).isoformat()],
        "temperature_2m_min": [20], "temperature_2m_max": [30], "temperature_2m_mean": [25],
        "relative_humidity_2m_mean": [60], "precipitation_sum": [0],
    }}
    terminated = False
    attempted = []
    key = ingestion_service.ADVISORY_LOCK_ID

    def fetch(state, *args, **kwargs):
        nonlocal terminated
        attempted.append(state)
        if state == "Karnataka" and not terminated:
            with pg_engine.connect() as observer:
                terminated = observer.scalar(text("""
                    SELECT pg_terminate_backend(pid, 5000)
                    FROM pg_locks
                    WHERE locktype = 'advisory' AND granted AND objsubid = 1
                      AND classid = :high AND objid = :low
                      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
                """), {"high": key >> 32, "low": key & 0xffffffff})
                assert terminated is True
        return payload

    monkeypatch.setattr(source, "fetch_forecast_for_state", fetch)
    with pytest.raises(RuntimeError, match="lost its locked database session"):
        ingestion_service.run_ingestion_with_lock(today=today)
    assert attempted == ["Goa", "Karnataka"]
    with Session(pg_engine) as observer:
        assert set(observer.scalars(select(WeatherData.state))) == {"Goa"}

    summary = ingestion_service.run_ingestion_with_lock(today=today)
    assert summary["status"] == "success"
    assert summary["records_inserted"] == 2
    with Session(pg_engine) as observer:
        assert set(observer.scalars(select(WeatherData.state))) == set(coords)


def test_postgres_csv_import_counts_rows_inserted_and_skipped(pg_engine):
    migrate(pg_engine)
    rows = pd.DataFrame([dict(state="Kerala", date=india_today() - timedelta(days=1),
                              temp_min=20, temp_max=30, temp_avg=25, humidity=65, rainfall=4)])
    with Session(pg_engine) as db:
        assert import_weather_dataframe(rows, db) == (1, 0)
        assert import_weather_dataframe(rows, db) == (0, 1)


def test_live_metrics_use_issued_forecast_and_same_lag_for_persistence(pg_engine):
    migrate(pg_engine)
    today = india_today()
    target = today - timedelta(days=1)
    key = dict(state="Karnataka", district="", location="", forecast_date=target,
               model_version="weather_model_v3")
    with Session(pg_engine) as db:
        db.add(Prediction(**key, predicted_temp_avg=[23.0] * 7, created_at=target_start_utc(target) - timedelta(hours=1)))
        db.add(Prediction(**dict(key, model_version="replayed"), predicted_temp_avg=[22.0] * 7,
                          created_at=target_start_utc(target) + timedelta(hours=1)))
        db.add_all([
            WeatherData(state="Karnataka", district="", location="", date=target - timedelta(days=lag),
                        temp_min=15, temp_max=30, temp_avg=actual, humidity=70, rainfall=1)
            for lag, actual in [(0, 22), (1, 27), (2, 20)]
        ])
        db.commit()

        upsert_prediction(db, **key, predicted_temp_avg=[22.0] * 7)
        issued = db.scalar(select(Prediction).where(Prediction.model_version == key["model_version"]))
        assert issued.predicted_temp_avg == [23.0] * 7
        assert fill_missing_actuals(db, today=today) == 2
        metrics = rolling_live_metrics(db, today=today, prospective_only=True)["models"]
        assert metrics == [{"model_version": "weather_model_v3", "sample_count": 1,
                            "model_mae": 1.0, "persistence_mae": 2.0, "skill_vs_persistence": 0.5}]
