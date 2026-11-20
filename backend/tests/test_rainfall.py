"""Calendar and artifact regressions using an extract of genuine PostgreSQL observations."""
from datetime import date, timedelta
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.services import rainfall as rain
from train_rainfall import clean_snapshot, panel_for_period

FIXTURE = Path(__file__).parent / "fixtures/rainfall_karnataka.csv"
STATE = "Karnataka"
ORIGIN = date(2026, 8, 25)


@pytest.fixture
def observations():
    frame = pd.read_csv(FIXTURE, parse_dates=["date"])
    frame["date"] = frame.date.dt.date
    return frame


def history(frame):
    return list(frame[frame.date.between(ORIGIN - timedelta(days=7), ORIGIN - timedelta(days=1))].itertuples())


def panel(frame):
    return panel_for_period(frame, [STATE], ("2026-08-13", "2026-09-06")).set_index("origin")


def test_shared_features_and_exact_seven_targets(observations):
    row = panel(observations).loc[ORIGIN]
    expected = rain.feature_values(history(observations), STATE, ORIGIN, [STATE])
    np.testing.assert_array_equal(row[rain.FEATURES].to_numpy(), expected)
    actual = observations.set_index("date").rainfall
    assert row.rain_lag1 == actual[ORIGIN - timedelta(days=1)]
    assert row.rain_sum7 == pytest.approx(sum(actual[ORIGIN - timedelta(days=i)] for i in range(1, 8)))
    assert list(row[rain.TARGETS]) == [actual[ORIGIN + timedelta(days=i)] for i in range(1, 8)]
    # Permute whole observed records from origin onward, leaving the dates in place.
    changed = observations.copy()
    future = changed.date >= ORIGIN
    changed.loc[future, rain.MEASUREMENTS] = observations.loc[future, rain.MEASUREMENTS].iloc[::-1].to_numpy()
    other = panel(changed).loc[ORIGIN]
    assert other[rain.FEATURES].equals(row[rain.FEATURES])
    assert not other[rain.TARGETS].equals(row[rain.TARGETS])


def test_quality_audit_excludes_duplicates_missing_and_abnormal(observations):
    dirty = pd.concat([observations, observations.iloc[[0]]], ignore_index=True)
    dirty.loc[1, "rainfall"] = -1
    dirty.loc[2, "humidity"] = 101
    dirty.loc[3, "temp_avg"] = np.nan
    clean, audit = clean_snapshot(dirty, [STATE])
    assert audit["duplicate_rows"] == 2 and audit["invalid_rows"] == 3
    assert audit["negative_rain_rows"] == 1 and audit["missing_values"]["temp_avg"] == 1
    assert len(clean) == len(observations) - 4


@pytest.mark.parametrize("offset", [-6, 1, 7])
def test_gap_excludes_affected_origins(observations, offset):
    incomplete = observations[observations.date != ORIGIN + timedelta(days=offset)]
    assert ORIGIN not in panel(incomplete).index
    if offset < 0:
        with pytest.raises(ValueError):
            rain.feature_values(history(incomplete), STATE, ORIGIN, [STATE])


def test_bad_history_and_state_rejected(observations):
    rows = history(observations)
    for wrong in [rows[1:] + rows[-1:], rows[1:] + [rows[0]._replace(state="Goa")],
                  rows[1:] + [rows[0]._replace(date=ORIGIN)]]:
        with pytest.raises(ValueError):
            rain.feature_values(wrong, STATE, ORIGIN, [STATE])


def test_serialized_forecast_and_calibrated_probabilities(observations):
    bundle = rain.loaded_bundle()
    models, states, publish, released = bundle
    forecasts = rain.predict_history(history(observations), STATE, ORIGIN, bundle, preview=True)
    default = rain.predict_history(history(observations), STATE, ORIGIN, bundle)
    assert len(forecasts) == 7
    x = pd.DataFrame([rain.feature_values(history(observations), STATE, ORIGIN, states)], columns=rain.FEATURES)
    for i, (model, (amount, p)) in enumerate(zip(models, forecasts)):
        assert np.isfinite(amount) and amount >= 0
        assert (default[i][0] is not None) == released
        assert (p is not None) == publish[i]
        assert model["occurrence"].dump_model()["objective"].startswith("binary")
        raw = model["occurrence"].predict(x, num_threads=1)[0]
        assert 0 <= raw <= 1
        if publish[i]:
            assert p == pytest.approx(rain.calibrated_probability(raw, model["calibration"]))
            assert 0 <= p <= 1


def test_frozen_release_results_and_embargoes():
    meta = json.loads((rain.MODEL_DIR / rain.METADATA).read_text())
    periods = list(meta["samples"].values())
    for earlier, later in zip(periods, periods[1:]):
        assert earlier["target_dates"][1] < later["history_start"]
    assert meta["architecture"] == min(("direct", "two_stage"), key=lambda k: meta["validation"][k]["overall"]["rmse"])
    selected = meta["test"][meta["architecture"]]
    baseline = min(meta["test"][k]["overall"]["rmse"] for k in ("zero", "persistence", "seasonal"))
    assert meta["independent_evaluation_passed"] == (selected["overall"]["rmse"] <= baseline * .99)
    for h, item in enumerate(selected["by_horizon"]):
        assert item["n"] == periods[-1]["state_origins"] == item["wet"]["n"] + item["dry"]["n"]
        assert sum(b["n"] for b in item["calibration_bins"]) == item["n"]
        assert meta["publish_probability"][h] == all(
            scores[meta["architecture"]]["by_horizon"][h]["brier"] < scores["seasonal"]["by_horizon"][h]["brier"]
            and scores[meta["architecture"]]["by_horizon"][h]["ece"] <= .08
            for scores in (meta["validation"], meta["test"])
        )


@pytest.mark.parametrize("corruption", ["checksum", "features", "horizon"])
def test_artifact_fails_closed(tmp_path, corruption):
    payload = (rain.MODEL_DIR / rain.ARTIFACT).read_bytes()
    meta = json.loads((rain.MODEL_DIR / rain.METADATA).read_text())
    if corruption == "checksum":
        payload = payload[:-1]
    elif corruption == "features":
        meta["features"].reverse()
    else:
        doc = json.loads(gzip.decompress(payload))
        doc["models"].reverse()
        payload = gzip.compress(json.dumps(doc).encode())
        meta["sha256"] = hashlib.sha256(payload).hexdigest()
    (tmp_path / rain.ARTIFACT).write_bytes(payload)
    (tmp_path / rain.METADATA).write_text(json.dumps(meta))
    with pytest.raises(ValueError):
        rain.read_bundle(tmp_path)


@pytest.mark.parametrize("value", [-1., 1.01, np.inf, -np.inf, np.nan])
def test_calibration_rejects_invalid_raw_output(value):
    for curve in ({"x": [.1, .9], "y": [.2, .8]}, {"method": "platt", "slope": 1., "intercept": .1}):
        with pytest.raises(ValueError, match="raw rain occurrence"):
            rain.calibrated_probability(np.array([value]), curve)


@pytest.mark.parametrize("fault", ["amount_flag", "probability_flag", "calibration", "estimator"])
def test_bundle_verifies_release_evidence_and_roles(tmp_path, fault):
    payload = (rain.MODEL_DIR / rain.ARTIFACT).read_bytes()
    meta = json.loads((rain.MODEL_DIR / rain.METADATA).read_text())
    if fault == "amount_flag":
        meta["independent_evaluation_passed"] = True
    elif fault == "probability_flag":
        meta["publish_probability"][-1] = True
    else:
        doc = json.loads(gzip.decompress(payload))
        model = doc["models"][0]
        if fault == "calibration":
            model["calibration"]["x"].reverse()
        else:
            model["occurrence"] = model["amount"]
        payload = gzip.compress(json.dumps(doc).encode())
        meta["sha256"] = hashlib.sha256(payload).hexdigest()
    (tmp_path / rain.ARTIFACT).write_bytes(payload)
    (tmp_path / rain.METADATA).write_text(json.dumps(meta))
    with pytest.raises(ValueError):
        rain.read_bundle(tmp_path)


def test_extended_inputs_use_only_actual_issue_history(observations):
    from experiment_rainfall import EXTENDED, FOLDS
    bounds = ("2026-08-13", "2026-09-06")
    def row(frame):
        return panel_for_period(frame, [STATE], bounds, extended=True).set_index("origin").loc[ORIGIN]
    reference = row(observations)
    history_rows = history(observations)
    np.testing.assert_array_equal(reference[EXTENDED], rain.feature_values(
        history_rows, STATE, ORIGIN, [STATE], extended=True))
    assert reference.rain_lag5 == history_rows[-5].rainfall
    assert reference.rain_std7 == pytest.approx(np.std([r.rainfall for r in history_rows]))
    assert reference.wet_streak7 == 7 and reference.heavy_count7 == 0
    assert reference.humidity_change3 == history_rows[-1].humidity - history_rows[-3].humidity
    changed = observations.copy()
    future = changed.date >= ORIGIN
    changed.loc[future, rain.MEASUREMENTS] = changed.loc[future, rain.MEASUREMENTS].iloc[::-1].to_numpy()
    assert row(changed)[EXTENDED].equals(reference[EXTENDED])
    for fold in FOLDS:
        assert fold["train"][1] < fold["calibration"][0] <= fold["calibration"][1] < fold["validation"][0]
        assert fold["validation"][1] < "2025-11-01"


def test_selection_rejects_tradeoff_and_preserves_v1():
    from experiment_rainfall import choose
    reference = dict(rmse=5., mae=2., heavy={"mae": 30.}, brier=.2)
    ref = "v1_recipe_direct_isotonic"
    first = {ref: reference, "weighted": dict(reference, rmse=4., mae=2.2)}
    second = {ref: reference, "weighted": dict(reference, rmse=4.)}
    assert choose([first, second]) == ref
    first["weighted"]["mae"] = 2.
    assert choose([first, second]) == "weighted"
