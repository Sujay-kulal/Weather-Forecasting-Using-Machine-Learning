from datetime import date, timedelta
import hashlib
import json
from pathlib import Path
import pytest
import numpy as np
import pandas as pd

from evaluate_deployed_artifact import (
    calculate_eligible_test_period,
    validate_test_period_independence,
    build_calendar_verified_panel,
    compute_baselines,
    get_training_cutoff,
    run_evaluation,
    _metrics_by_horizon,
    EMBARGO_OFFSET_DAYS,
    PROJECT_ROOT,
)


def test_training_cutoff_and_embargo_enforcement():
    source_info = {"artifact_trained_through": "2026-10-22"}
    cutoff = get_training_cutoff(source_info)
    assert cutoff == date(2026, 10, 22)

    first_origin, last_origin, target_end, hist_start = calculate_eligible_test_period(cutoff, 30)
    # Cutoff + 9 calendar days = 2026-10-31
    assert first_origin == date(2026, 10, 31)
    assert (first_origin - cutoff).days == EMBARGO_OFFSET_DAYS
    assert last_origin == date(2026, 11, 29)
    assert target_end == date(2026, 12, 6)
    assert hist_start == date(2026, 10, 24)

    # Valid origin passes
    validate_test_period_independence(first_origin, cutoff)

    # Overlapping or embargo-violating origins are rejected
    with pytest.raises(ValueError, match="violates the 8-day embargo"):
        validate_test_period_independence(date(2026, 10, 30), cutoff)
    with pytest.raises(ValueError, match="violates the 8-day embargo"):
        validate_test_period_independence(date(2026, 10, 22), cutoff)


def test_evaluation_windows_30_60_90():
    cutoff = date(2026, 10, 22)

    # 30-day window
    orig_30_start, orig_30_end, target_30_end, _ = calculate_eligible_test_period(cutoff, 30)
    assert (orig_30_end - orig_30_start).days + 1 == 30
    assert target_30_end == orig_30_end + timedelta(days=7)

    # 60-day window
    orig_60_start, orig_60_end, target_60_end, _ = calculate_eligible_test_period(cutoff, 60)
    assert (orig_60_end - orig_60_start).days + 1 == 60
    assert target_60_end == orig_60_end + timedelta(days=7)

    # 90-day window
    orig_90_start, orig_90_end, target_90_end, _ = calculate_eligible_test_period(cutoff, 90)
    assert (orig_90_end - orig_90_start).days + 1 == 90
    assert target_90_end == orig_90_end + timedelta(days=7)

    # Invalid window size raises ValueError
    with pytest.raises(ValueError, match="Invalid test window"):
        calculate_eligible_test_period(cutoff, 45)


def test_missing_calendar_dates_are_excluded():
    """Verify that if a calendar date is missing, rows relying on that date in lags or targets are excluded."""
    # Create 40 days of data for Karnataka, but omit day 10
    start = date(2026, 10, 1)
    dates = [start + timedelta(days=i) for i in range(40) if i != 10]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * len(dates),
        "temp_min": [20.0] * len(dates),
        "temp_avg": [25.0] * len(dates),
        "humidity": [60.0] * len(dates),
        "rainfall": [0.0] * len(dates),
    })

    panel = build_calendar_verified_panel(raw)
    assert not panel.empty
    panel_dates = set(panel["Date"].tolist())

    missing_date = start + timedelta(days=10)
    assert missing_date not in dates

    # Any origin requiring missing_date in its past 7 days (day 11 to day 17) must be excluded
    for d in range(1, 8):
        affected_past = missing_date + timedelta(days=d)
        assert affected_past not in panel_dates

    # Any origin requiring missing_date in its future 7 days (day 3 to day 9) must be excluded
    for d in range(1, 8):
        affected_future = missing_date - timedelta(days=d)
        assert affected_future not in panel_dates

    # Day 18 (which only looks back to day 11 and forward to day 25) should be present
    day_18 = start + timedelta(days=18)
    assert day_18 in panel_dates


def test_incomplete_seven_day_targets_are_excluded():
    """Verify that origins lacking complete 7 future calendar targets are excluded."""
    # Data runs from day 0 to day 20.
    start = date(2026, 10, 1)
    dates = [start + timedelta(days=i) for i in range(21)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * len(dates),
        "temp_min": [20.0] * len(dates),
        "temp_avg": [25.0] * len(dates),
        "humidity": [60.0] * len(dates),
        "rainfall": [0.0] * len(dates),
    })

    panel = build_calendar_verified_panel(raw)
    panel_dates = sorted(panel["Date"].tolist())

    # Day 20 is the last date available.
    # An origin needs 7 forward targets: t + 1 ... t + 7 <= day 20, so max origin <= day 13!
    max_valid_origin = start + timedelta(days=20 - 7)
    assert max(panel_dates) == max_valid_origin
    assert (start + timedelta(days=14)) not in panel_dates


def test_baseline_calculations_no_test_leakage():
    test_dates = [date(2026, 11, 1) + timedelta(days=i) for i in range(5)]
    test_panel = pd.DataFrame({
        "Date": test_dates,
        "State": "Karnataka",
        "lag1_temp_avg": [20.0, 21.0, 22.0, 23.0, 24.0],
    })

    # Historical training raw observations
    train_dates = [date(2026, 9, 1) + timedelta(days=i) for i in range(30)]
    train_raw = pd.DataFrame({
        "date": train_dates,
        "state": "Karnataka",
        "temp_avg": [15.0] * len(train_dates),
    })

    persistence, climatology = compute_baselines(test_panel, training_raw=train_raw)

    # Persistence matches lag1_temp_avg across all 7 horizons
    assert persistence.shape == (5, 7)
    assert np.array_equal(persistence[:, 0], np.array([20.0, 21.0, 22.0, 23.0, 24.0]))
    assert np.array_equal(persistence[:, 6], np.array([20.0, 21.0, 22.0, 23.0, 24.0]))

    # Climatology is derived from training data
    assert climatology.shape == (5, 7)
    assert np.all(climatology == 15.0)


def test_artifact_hash_verification():
    artifact_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    assert artifact_path.is_file()
    computed_hash = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    assert computed_hash == "844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf"


def test_no_modification_of_model_or_metadata(tmp_path):
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"

    initial_model_bytes = model_path.read_bytes()
    initial_info_text = info_path.read_text(encoding="utf-8")

    # Attempting to pass output_path as model_info.json must be rejected
    with pytest.raises(ValueError, match="Modifying model_info.json is strictly prohibited"):
        run_evaluation(
            artifact_path=model_path,
            source_model_info_path=info_path,
            output_path=info_path,
        )

    # Execute evaluation writing to a separate temporary file
    temp_output = tmp_path / "evaluation_results_v3.json"
    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=pd.DataFrame(),
    )

    assert result["validated_for_artifact"] is False
    assert result["status"] == "insufficient_post_cutoff_data"
    assert result["required_additional_days"] == 45
    assert temp_output.is_file()

    # Model artifact and model_info.json must be 100% byte-for-byte identical
    assert model_path.read_bytes() == initial_model_bytes
    assert info_path.read_text(encoding="utf-8") == initial_info_text
