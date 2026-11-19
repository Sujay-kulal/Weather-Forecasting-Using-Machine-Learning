"""PostgreSQL checks. Run with a disposable localhost database ending in _test."""

import os
import sys
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session
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
