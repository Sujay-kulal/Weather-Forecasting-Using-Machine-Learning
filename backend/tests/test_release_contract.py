from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import Mock

import numpy as np
import pandas as pd
import pytest
from sqlalchemy.engine import URL
from sqlalchemy.exc import OperationalError
from sqlalchemy.pool import NullPool

from app.services import ingestion_service, model_service
from app.services.feature_service import InsufficientHistoryError, build_features
from evaluate_deployed_artifact import FEATURE_ORDER, build_calendar_verified_panel, chronological_splits
from update_weather import parse_completed_days


def test_calendar_alignment_and_embargo_use_dates_across_states():
    start = date(2025, 12, 1)
    states = {"Delhi": 0, "Karnataka": 50}
    daily = pd.DataFrame([
        dict(Date=start + timedelta(days=i), State=state, Temp_Avg=base + i,
             Temp_Max=base + i + 3, Temp_Min=base + i - 3, Humidity=60, Rainfall=i / 10)
        for state, base in states.items() for i in range(85)
    ])
    panel = build_calendar_verified_panel(daily)
    origin = start + timedelta(days=36)
    selected = panel[(panel.State == "Karnataka") & (panel.Date == origin)].iloc[0]
    history = [SimpleNamespace(date=origin - timedelta(days=i), temp_avg=86-i, temp_max=89-i,
                               temp_min=83-i, humidity=60, rainfall=(36-i)/10) for i in range(1, 8)]
    served = build_features(history, "Karnataka", origin).iloc[0]
    assert list(served.index) == FEATURE_ORDER
    np.testing.assert_allclose(selected[FEATURE_ORDER[:-2]].astype(float), served[FEATURE_ORDER[:-2]].astype(float))
    assert selected[FEATURE_ORDER[-2:]].equals(served[FEATURE_ORDER[-2:]])
    assert selected[[f"target_{i}" for i in range(1, 8)]].tolist() == list(range(87, 94))

    changed = daily.copy()
    changed.loc[changed.Date >= origin, "Temp_Avg"] += 100
    recomputed = build_calendar_verified_panel(changed)
    row = recomputed[(recomputed.State == "Karnataka") & (recomputed.Date == origin)].iloc[0]
    pd.testing.assert_series_equal(selected[FEATURE_ORDER], row[FEATURE_ORDER])
    for train, test in chronological_splits(panel.Date):
        assert panel.iloc[train].Date.max() + timedelta(days=8) < panel.iloc[test].Date.min()
        assert panel.iloc[test].groupby("Date").State.nunique().eq(2).all()


def test_forecast_cache_revalidates_corrected_weather(monkeypatch):
    origin = date(2025, 5, 20)
    history = [SimpleNamespace(date=origin - timedelta(days=i), temp_avg=25.0, temp_max=30.0,
                               temp_min=20.0, humidity=60.0, rainfall=1.0) for i in range(1, 8)]
    model_service.prediction_cache.clear()
    prediction = Mock(side_effect=lambda features, pipeline=None: [features.iloc[0].lag1_temp_avg] * 7)
    monkeypatch.setattr(model_service, "predict", prediction)
    kwargs = {"today": origin}
    assert model_service.predict_for_history(history, "Delhi", origin, **kwargs) == [25] * 7
    assert model_service.predict_for_history(history, "Delhi", origin, **kwargs) == [25] * 7
    assert prediction.call_count == 1
    history[0].temp_avg = 26.0
    assert model_service.predict_for_history(history, "Delhi", origin, **kwargs) == [26] * 7
    history[0].temp_avg = np.nan
    with pytest.raises(InsufficientHistoryError):
        model_service.predict_for_history(history, "Delhi", origin, **kwargs)
    model_service.prediction_cache.clear()


def test_pooled_neon_ingestion_uses_the_matching_direct_endpoint(monkeypatch):
    pooled_url = URL.create(
        "postgresql+psycopg", username="app", host="ep-test-pooler.example.neon.tech",
        database="weather", query={"sslmode": "require", "channel_binding": "require"},
    )
    serving_engine = Mock(url=pooled_url)
    direct_engine = Mock()
    create_engine = Mock(return_value=direct_engine)
    session = Mock()
    session.execute.return_value.scalar.return_value = False
    session_factory = Mock(return_value=session)
    monkeypatch.setattr(ingestion_service, "engine", serving_engine)
    monkeypatch.setattr(ingestion_service, "create_engine", create_engine)
    monkeypatch.setattr(ingestion_service, "SessionLocal", session_factory)

    assert ingestion_service.run_ingestion_with_lock()["status"] == "skipped"
    create_engine.assert_called_once_with(
        pooled_url.set(host="ep-test.example.neon.tech"),
        poolclass=NullPool, connect_args={"connect_timeout": 5}, hide_parameters=True,
    )
    serving_engine.connect.assert_not_called()
    assert serving_engine.url == pooled_url
    session_factory.assert_called_once_with(bind=direct_engine.connect.return_value)
    direct_engine.connect.return_value.close.assert_called_once()


@pytest.mark.parametrize(
    ("hostname", "query"),
    [
        ("ep-test-pooler.example.invalid", {}),
        ("ep-test-pooler.example.neon.tech", {"hostaddr": "127.0.0.1"}),
    ],
)
def test_unsupported_ingestion_endpoint_fails_before_connecting(monkeypatch, hostname, query):
    serving_engine = Mock(url=URL.create("postgresql+psycopg", host=hostname, query=query))
    create_engine = Mock()
    monkeypatch.setattr(ingestion_service, "engine", serving_engine)
    monkeypatch.setattr(ingestion_service, "create_engine", create_engine)

    with pytest.raises(ingestion_service.IngestionConfigurationError, match="direct PostgreSQL"):
        ingestion_service.run_ingestion_with_lock()
    serving_engine.connect.assert_not_called()
    create_engine.assert_not_called()


def test_direct_neon_connection_failure_does_not_fall_back_or_leak_details(monkeypatch, caplog):
    url = URL.create("postgresql+psycopg", host="ep-test-pooler.example.neon.tech")
    serving_engine = Mock(url=url)
    direct_engine = Mock()
    private_detail = "private connection detail"
    direct_engine.connect.side_effect = OperationalError(None, None, Exception(private_detail))
    session_factory = Mock()
    monkeypatch.setattr(ingestion_service, "engine", serving_engine)
    monkeypatch.setattr(ingestion_service, "create_engine", Mock(return_value=direct_engine))
    monkeypatch.setattr(ingestion_service, "SessionLocal", session_factory)

    with pytest.raises(RuntimeError, match="direct ingestion database session") as exc:
        ingestion_service.run_ingestion_with_lock()

    assert private_detail not in str(exc.value)
    assert private_detail not in caplog.text
    session_factory.assert_not_called()
    serving_engine.connect.assert_not_called()


def test_provider_parser_excludes_current_and_invalid_rows_and_deduplicates():
    payload = {"daily": {
        "time": ["2026-10-20", "2026-10-20", "2026-10-21", "2026-10-22"],
        "temperature_2m_max": [31, 31, 32, 29], "temperature_2m_min": [20] * 4,
        "temperature_2m_mean": [25, 25, float("nan"), 26], "precipitation_sum": [0] * 4,
        "relative_humidity_2m_mean": [60] * 4,
    }}
    rows = parse_completed_days(payload, "Karnataka", date(2026, 10, 22))
    assert [row["date"] for row in rows] == [date(2026, 10, 20)]
    assert rows[0]["temp_avg"] == 25
    payload["daily"]["temperature_2m_mean"][1] = 26
    with pytest.raises(ValueError, match="Conflicting provider observations"):
        parse_completed_days(payload, "Karnataka", date(2026, 10, 22))
