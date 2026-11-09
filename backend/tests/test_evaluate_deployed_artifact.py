import subprocess
import sys
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
    normalize_weather_dataframe,
    get_training_cutoff,
    run_evaluation,
    _metrics_by_horizon,
    FEATURE_ORDER,
    TARGET_COLUMNS,
    NUMERIC_FEATURES,
    CAT_FEATURES,
    HORIZON_DAYS,
    EMBARGO_DAYS,
    EMBARGO_OFFSET_DAYS,
    EMBARGO_RATIONALE,
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


def test_feature_contract_and_order_integrity():
    """Verify that the 20-feature contract matches model metadata and production contract exactly."""
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    source_info = json.loads(info_path.read_text(encoding="utf-8"))
    declared_features = source_info["features"]

    assert len(FEATURE_ORDER) == 20
    assert FEATURE_ORDER == declared_features
    assert len(NUMERIC_FEATURES) == 18
    assert CAT_FEATURES == ["Season", "State"]
    assert len(TARGET_COLUMNS) == 7
    assert TARGET_COLUMNS == [f"target_{i}" for i in range(1, 8)]


def test_independent_evaluation_with_complete_post_cutoff_data(tmp_path):
    """Verify that when complete post-cutoff data is provided, independent evaluation succeeds and produces all metrics."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "valid_post_cutoff_eval.json"

    # Training cutoff is 2026-10-22.
    # 8-day embargo: 2026-10-23 to 2026-10-30.
    # First eligible origin is 2026-10-31.
    # For 30 origins: 2026-10-31 to 2026-11-29.
    # Required targets reach 2026-11-29 + 7 = 2026-12-06.
    start_date = date(2026, 10, 20)
    num_days = 50
    dates = [start_date + timedelta(days=i) for i in range(num_days)]

    np.random.seed(42)
    temp_avg = [24.0 + 3.0 * np.sin(i / 10.0) for i in range(num_days)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [t + 5.0 for t in temp_avg],
        "temp_min": [t - 5.0 for t in temp_avg],
        "temp_avg": temp_avg,
        "humidity": [65.0] * num_days,
        "rainfall": [1.5] * num_days,
    })

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw,
        mode="independent",
    )

    assert result["status"] == "validated"
    assert result["validated_for_artifact"] is True
    assert result["data_integrity"]["independent"] is True
    assert result["sample_counts"]["test_origins"] == 30
    assert result["sample_counts"]["states_evaluated"] == 1
    assert result["sample_counts"]["total_predictions"] == 210
    assert result["test_period"] == ["2026-10-31", "2026-11-29"]
    assert result["target_period"] == ["2026-11-01", "2026-12-06"]

    # Verify metrics structure
    assert "LightGBM" in result["metrics"]
    assert "Persistence" in result["metrics"]
    assert "Climatology" in result["metrics"]

    for model_name in ["LightGBM", "Persistence", "Climatology"]:
        m = result["metrics"][model_name]
        assert "MAE" in m and np.isfinite(m["MAE"])
        assert "RMSE" in m and np.isfinite(m["RMSE"])
        assert "R2" in m and np.isfinite(m["R2"])
        assert "by_horizon" in m
        for h in range(1, 8):
            h_metrics = m["by_horizon"][f"day_{h}"]
            assert np.isfinite(h_metrics["MAE"])
            assert np.isfinite(h_metrics["RMSE"])
            assert np.isfinite(h_metrics["R2"])

    assert "skill_vs_persistence" in result["metrics"]["LightGBM"]
    assert "skill_vs_persistence_by_horizon" in result["metrics"]["LightGBM"]


def test_zero_future_data_leakage_in_panel_construction():
    """Verify that corrupting future observations (> t) does not alter feature values for origin t."""
    start_date = date(2026, 1, 1)
    dates = [start_date + timedelta(days=i) for i in range(40)]
    np.random.seed(123)
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": np.random.uniform(28, 35, 40),
        "temp_min": np.random.uniform(18, 24, 40),
        "temp_avg": np.random.uniform(22, 29, 40),
        "humidity": np.random.uniform(50, 80, 40),
        "rainfall": np.random.uniform(0, 5, 40),
    })

    panel_clean = build_calendar_verified_panel(raw)
    test_origin = start_date + timedelta(days=15)
    row_clean = panel_clean[panel_clean["Date"] == test_origin].iloc[0]

    # Corrupt all observations on and after origin t
    raw_corrupt = raw.copy()
    mask_future = raw_corrupt["date"] >= test_origin
    raw_corrupt.loc[mask_future, ["temp_max", "temp_min", "temp_avg", "humidity", "rainfall"]] = 99999.0

    panel_corrupt = build_calendar_verified_panel(raw_corrupt)
    row_corrupt = panel_corrupt[panel_corrupt["Date"] == test_origin].iloc[0]

    for feat in NUMERIC_FEATURES:
        diff = abs(float(row_clean[feat]) - float(row_corrupt[feat]))
        assert diff == 0.0, f"Leakage detected in feature {feat}: clean={row_clean[feat]} corrupt={row_corrupt[feat]}"

    assert row_clean["Season"] == row_corrupt["Season"]
    assert row_clean["State"] == row_corrupt["State"]


def test_target_construction_temporal_alignment():
    """Verify that forward targets are temporally aligned to t+1 through t+7 without off-by-one shifts."""
    start_date = date(2026, 1, 1)
    dates = [start_date + timedelta(days=i) for i in range(25)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [float(i + 5) for i in range(25)],
        "temp_min": [float(i - 5) for i in range(25)],
        "temp_avg": [float(i) for i in range(25)],
        "humidity": [50.0] * 25,
        "rainfall": [0.0] * 25,
    })

    panel = build_calendar_verified_panel(raw)
    test_origin = start_date + timedelta(days=10)
    row = panel[panel["Date"] == test_origin].iloc[0]

    for h in range(1, 8):
        expected_target = float(10 + h)
        assert row[f"target_{h}"] == expected_target, (
            f"target_{h} was {row[f'target_{h}']}, expected {expected_target}"
        )


def test_duplicate_calendar_observations_deduplication():
    """Verify that duplicate calendar dates for a state are deduplicated cleanly without corrupted panel rows."""
    start_date = date(2026, 1, 1)
    dates = [start_date + timedelta(days=i) for i in range(25)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * 25,
        "temp_min": [20.0] * 25,
        "temp_avg": [25.0] * 25,
        "humidity": [60.0] * 25,
        "rainfall": [0.0] * 25,
    })

    duplicates = pd.DataFrame({
        "date": [start_date + timedelta(days=5), start_date + timedelta(days=6)],
        "state": ["Karnataka", "Karnataka"],
        "temp_max": [99.0, 99.0],
        "temp_min": [99.0, 99.0],
        "temp_avg": [99.0, 99.0],
        "humidity": [99.0, 99.0],
        "rainfall": [99.0, 99.0],
    })
    raw_with_dups = pd.concat([raw, duplicates], ignore_index=True)

    panel = build_calendar_verified_panel(raw_with_dups)
    assert not panel.empty
    assert len(panel["Date"]) == panel["Date"].nunique()


def test_diagnostic_mode_distinguishes_training_overlap(tmp_path):
    """Verify that evaluating an overlapping period in diagnostic mode marks artifact_evaluated_training_overlap."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "diagnostic_eval.json"

    start_date = date(2025, 10, 1)
    num_days = 60
    dates = [start_date + timedelta(days=i) for i in range(num_days)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * num_days,
        "temp_min": [20.0] * num_days,
        "temp_avg": [25.0] * num_days,
        "humidity": [60.0] * num_days,
        "rainfall": [0.0] * num_days,
    })

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw,
        custom_test_start=date(2025, 10, 15),
        mode="diagnostic",
    )

    assert result["status"] == "artifact_evaluated_training_overlap"
    assert result["validated_for_artifact"] is False
    assert result.get("diagnostic") is True
    assert result["data_integrity"]["independent"] is False
    assert "overlaps the test window" in result["note"]
    assert "LightGBM" in result["metrics"]


def test_insufficient_post_cutoff_data_exact_shortfall_calculation(tmp_path):
    """Verify that when post-cutoff data ends before required target coverage, exact shortfall is reported."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "shortfall_eval.json"

    start_date = date(2026, 10, 15)
    end_date = date(2026, 11, 10)
    num_days = (end_date - start_date).days + 1
    dates = [start_date + timedelta(days=i) for i in range(num_days)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * num_days,
        "temp_min": [20.0] * num_days,
        "temp_avg": [25.0] * num_days,
        "humidity": [60.0] * num_days,
        "rainfall": [0.0] * num_days,
    })

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw,
        mode="independent",
    )

    expected_shortfall = (date(2026, 12, 6) - date(2026, 11, 10)).days
    assert expected_shortfall == 26
    assert result["status"] == "insufficient_post_cutoff_data"
    assert result["validated_for_artifact"] is False
    assert result["required_additional_days"] == 26
    assert result["latest_available_date"] == "2026-11-10"


def test_cli_database_free_and_eval_data(tmp_path):
    """Verify that CLI execution works with --database-free and --eval-data."""
    script_path = PROJECT_ROOT / "backend" / "evaluate_deployed_artifact.py"
    output_path = tmp_path / "cli_output.json"

    cmd1 = [
        sys.executable,
        str(script_path),
        "--database-free",
        "--output-path", str(output_path),
        "--test-window", "30",
    ]
    proc1 = subprocess.run(cmd1, capture_output=True, text=True)
    assert proc1.returncode == 0, f"CLI failed: {proc1.stderr}"
    data1 = json.loads(output_path.read_text(encoding="utf-8"))
    assert data1["status"] == "insufficient_post_cutoff_data"

    csv_path = tmp_path / "eval_data.csv"
    start_date = date(2026, 10, 20)
    num_days = 50
    dates = [start_date + timedelta(days=i) for i in range(num_days)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * num_days,
        "temp_min": [20.0] * num_days,
        "temp_avg": [25.0] * num_days,
        "humidity": [60.0] * num_days,
        "rainfall": [1.0] * num_days,
    })
    raw.to_csv(csv_path, index=False)

    cmd2 = [
        sys.executable,
        str(script_path),
        "--database-free",
        "--eval-data", str(csv_path),
        "--output-path", str(output_path),
        "--test-window", "30",
    ]
    proc2 = subprocess.run(cmd2, capture_output=True, text=True)
    assert proc2.returncode == 0, f"CLI with eval-data failed: {proc2.stderr}"
    data2 = json.loads(output_path.read_text(encoding="utf-8"))
    assert data2["status"] == "validated"
    assert data2["validated_for_artifact"] is True


def test_climatology_baseline_zero_future_test_leakage():
    """Verify that corrupting future observations in test panel does not leak into earlier climatology predictions."""
    test_dates = [date(2026, 11, 1) + timedelta(days=i) for i in range(5)]
    clean_panel = pd.DataFrame({
        "Date": test_dates,
        "State": "Karnataka",
        "lag1_temp_avg": [10.0, 10.0, 10.0, 10.0, 10.0],
    })
    train_raw = pd.DataFrame({
        "Date": [date(2026, 10, 1) + timedelta(days=i) for i in range(20)],
        "State": ["Karnataka"] * 20,
        "Temp_Avg": [15.0] * 20,
    })
    _, clim_clean = compute_baselines(clean_panel, training_raw=train_raw)

    corrupt_panel = pd.DataFrame({
        "Date": test_dates,
        "State": "Karnataka",
        "lag1_temp_avg": [10.0, 10.0, 10.0, 10.0, 99999.0],  # Future row corrupted
    })
    _, clim_corrupt = compute_baselines(corrupt_panel, training_raw=train_raw)

    # Day 1 prediction must be completely invariant to Day 5 corruption
    assert clim_clean is not None and clim_corrupt is not None
    assert clim_clean[0, 0] == clim_corrupt[0, 0]
    assert np.array_equal(clim_clean[0, :], clim_corrupt[0, :])


def test_climatology_baseline_pre_test_cutoff_in_diagnostic_mode(tmp_path):
    """Verify that in diagnostic mode, historical data for climatology excludes observations from the test window."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "diag_cutoff_eval.json"

    # Pre-test data: 2025-08-01 to 2025-10-14 (75 days, temp_avg = 15.0)
    # Test period: 2025-10-15 to 2025-12-05 (52 days, temp_avg = 35.0)
    # Cutoff date in metadata is 2026-10-22.
    # If baseline data was filtered using date <= training_cutoff, the 35.0 values from the test period
    # would leak into climatology. Baseline cutoff must strictly be < test_start!
    pre_test_dates = [date(2025, 8, 1) + timedelta(days=i) for i in range(75)]
    test_dates = [date(2025, 10, 15) + timedelta(days=i) for i in range(52)]

    raw_pre = pd.DataFrame({
        "date": pre_test_dates,
        "state": "Karnataka",
        "temp_max": [20.0] * 75,
        "temp_min": [10.0] * 75,
        "temp_avg": [15.0] * 75,
        "humidity": [50.0] * 75,
        "rainfall": [0.0] * 75,
    })
    raw_test = pd.DataFrame({
        "date": test_dates,
        "state": "Karnataka",
        "temp_max": [40.0] * 52,
        "temp_min": [30.0] * 52,
        "temp_avg": [35.0] * 52,
        "humidity": [50.0] * 52,
        "rainfall": [0.0] * 52,
    })
    raw_combined = pd.concat([raw_pre, raw_test], ignore_index=True)

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw_combined,
        custom_test_start=date(2025, 10, 15),
        mode="diagnostic",
    )

    # Climatology should use the pre-test 15.0 mean, not the test window 35.0 mean
    # Actual test values are 35.0. MAE against 15.0 should be exactly 20.0
    clim_mae = result["metrics"]["Climatology"]["MAE"]
    assert abs(clim_mae - 20.0) < 1e-6, f"Climatology MAE was {clim_mae}, expected 20.0 (leakage from test window detected if < 20)"


def test_case_insensitive_column_normalization():
    """Verify that dataframe column variations (uppercase, title-case, spaces) are normalized reliably."""
    raw = pd.DataFrame({
        "DATE": [date(2026, 11, 1) + timedelta(days=i) for i in range(25)],
        "STATE": ["Karnataka"] * 25,
        "TEMP_MAX": [30.0] * 25,
        "TEMP_MIN": [20.0] * 25,
        "TEMP_AVG": [25.0] * 25,
        "HUMIDITY": [60.0] * 25,
        "RAINFALL": [0.5] * 25,
    })
    norm = normalize_weather_dataframe(raw)
    assert set(norm.columns) == {"Date", "State", "Temp_Max", "Temp_Min", "Temp_Avg", "Humidity", "Rainfall"}

    panel = build_calendar_verified_panel(raw)
    assert not panel.empty
    assert len(panel) > 0


def test_embargo_overlap_verdict(tmp_path):
    """Verify that origins following cutoff but violating the 8-day embargo are rejected from validation."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "embargo_overlap_eval.json"

    # Cutoff is 2026-10-22. First eligible origin is 2026-10-31.
    # Start origins on 2026-10-25 (violates 8-day embargo).
    start_date = date(2026, 10, 15)
    num_days = 50
    dates = [start_date + timedelta(days=i) for i in range(num_days)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * num_days,
        "temp_min": [20.0] * num_days,
        "temp_avg": [25.0] * num_days,
        "humidity": [60.0] * num_days,
        "rainfall": [1.0] * num_days,
    })

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw,
        custom_test_start=date(2026, 10, 25),
        mode="diagnostic",
    )

    assert result["status"] == "artifact_evaluated_embargo_overlap"
    assert result["validated_for_artifact"] is False
    assert result.get("diagnostic") is True
    assert "violating the required 8-day embargo" in result["note"]


def test_diagnostic_mode_default_test_start(tmp_path):
    """Verify that diagnostic mode defaults to the historical test period recorded in model_info.json."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "diag_default_eval.json"

    # Historical test period in model_info.json starts 2025-10-19
    start_date = date(2025, 10, 1)
    num_days = 60
    dates = [start_date + timedelta(days=i) for i in range(num_days)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * num_days,
        "temp_min": [20.0] * num_days,
        "temp_avg": [25.0] * num_days,
        "humidity": [60.0] * num_days,
        "rainfall": [0.0] * num_days,
    })

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw,
        mode="diagnostic",  # No custom_test_start provided
    )

    assert result["status"] == "artifact_evaluated_training_overlap"
    assert result["validated_for_artifact"] is False
    assert result["test_period"][0] == "2025-10-19"


def test_string_typed_weather_metrics_normalization():
    """Verify that string-formatted numeric weather metrics in external CSVs are safely parsed into floats."""
    dates = [date(2026, 11, 1) + timedelta(days=i) for i in range(25)]
    raw = pd.DataFrame({
        "Date": dates,
        "State": ["Karnataka"] * 25,
        "Temp_Max": ["30.0"] * 25,
        "Temp_Min": ["20.0"] * 25,
        "Temp_Avg": ["25.0"] * 25,
        "Humidity": ["60.0"] * 25,
        "Rainfall": ["0.0"] * 25,
    })

    panel = build_calendar_verified_panel(raw)
    assert not panel.empty
    assert len(panel) > 0
    assert isinstance(panel["temp_range"].iloc[0], float)
    assert panel["temp_range"].iloc[0] == 10.0


def test_invalid_date_strings_coerced_safely():
    """Verify that rows with malformed or invalid dates are coerced to NaT and excluded cleanly."""
    raw = pd.DataFrame({
        "Date": ["2026-11-01", "invalid-date", "2026-11-03", None],
        "State": ["Karnataka"] * 4,
        "Temp_Max": [30.0, 30.0, 30.0, 30.0],
        "Temp_Min": [20.0, 20.0, 20.0, 20.0],
        "Temp_Avg": [25.0, 25.0, 25.0, 25.0],
        "Humidity": [60.0, 60.0, 60.0, 60.0],
        "Rainfall": [0.0, 0.0, 0.0, 0.0],
    })
    norm = normalize_weather_dataframe(raw)
    assert pd.isna(norm.loc[1, "Date"])
    assert pd.isna(norm.loc[3, "Date"])
    assert norm.loc[0, "Date"] == date(2026, 11, 1)


def test_state_whitespace_and_casing_normalization():
    """Verify that state names with whitespace or non-standard casing are normalized to match allowed states."""
    dates = [date(2026, 11, 1) + timedelta(days=i) for i in range(25)]
    raw = pd.DataFrame({
        "Date": dates,
        "State": [" karnataka "] * 25,
        "Temp_Max": [30.0] * 25,
        "Temp_Min": [20.0] * 25,
        "Temp_Avg": [25.0] * 25,
        "Humidity": [60.0] * 25,
        "Rainfall": [0.0] * 25,
    })
    panel = build_calendar_verified_panel(raw, allowed_states=["Karnataka"])
    assert not panel.empty
    assert len(panel) > 0
    assert (panel["State"] == "Karnataka").all()


def test_diagnostic_mode_post_cutoff_status(tmp_path):
    """Verify that running diagnostic mode over a post-cutoff period does not falsely report an embargo violation."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "diag_post_cutoff_eval.json"

    # Evaluates from 2026-10-31 onwards (after cutoff 2026-10-22 and after 8-day embargo)
    start_date = date(2026, 10, 20)
    num_days = 50
    dates = [start_date + timedelta(days=i) for i in range(num_days)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * num_days,
        "temp_min": [20.0] * num_days,
        "temp_avg": [25.0] * num_days,
        "humidity": [60.0] * num_days,
        "rainfall": [1.0] * num_days,
    })

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw,
        mode="diagnostic",
        custom_test_start=date(2026, 10, 31),
    )

    assert result["status"] == "diagnostic_evaluated_post_cutoff"
    assert result["validated_for_artifact"] is False
    assert result["diagnostic"] is True
    assert "violating" not in result["note"]


def test_missing_historical_lag_data_shortfall(tmp_path):
    """Verify that when data covers the test targets but begins too late for lag construction, shortfall is detected."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "missing_history_eval.json"

    # Test window requires history starting 2026-10-24, but data only starts 2026-10-31
    start_date = date(2026, 10, 31)
    end_date = date(2026, 12, 10)
    num_days = (end_date - start_date).days + 1
    dates = [start_date + timedelta(days=i) for i in range(num_days)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * num_days,
        "temp_min": [20.0] * num_days,
        "temp_avg": [25.0] * num_days,
        "humidity": [60.0] * num_days,
        "rainfall": [1.0] * num_days,
    })

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw,
        mode="independent",
    )

    assert result["status"] == "insufficient_history_data"
    assert result["validated_for_artifact"] is False
    assert result["required_additional_days"] == 7
    assert result["sample_counts"]["states_evaluated"] == 0


def test_nan_safe_metric_calculation():
    """Verify that single-sample inputs produce finite numbers rather than non-standard NaN."""
    actual = np.array([[25.0]])
    predicted = np.array([[25.0]])
    from evaluate_deployed_artifact import _metric_values
    m = _metric_values(actual, predicted)
    assert isinstance(m["MAE"], float) and np.isfinite(m["MAE"])
    assert isinstance(m["RMSE"], float) and np.isfinite(m["RMSE"])
    assert isinstance(m["R2"], float) and np.isfinite(m["R2"])
    assert m["R2"] == 0.0


def test_feature_order_mismatch_rejected(tmp_path):
    """Verify that source metadata declaring wrong feature order or names is rejected."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = tmp_path / "bad_info.json"
    info_content = {
        "features": list(reversed(FEATURE_ORDER)),  # Reversed order
        "artifact_trained_through": "2026-10-22",
    }
    info_path.write_text(json.dumps(info_content), encoding="utf-8")

    with pytest.raises(ValueError, match="do not match the expected 20-feature contract"):
        run_evaluation(
            artifact_path=model_path,
            source_model_info_path=info_path,
            output_path=tmp_path / "out.json",
        )


def test_null_and_missing_state_normalization_no_crash():
    """Verify that None, np.nan, or 'nan' in State does not crash normalize_weather_dataframe."""
    raw = pd.DataFrame({
        "Date": ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"],
        "State": [None, float("nan"), "nan", "Karnataka"],
        "Temp_Max": [30.0, 30.0, 30.0, 30.0],
        "Temp_Min": [20.0, 20.0, 20.0, 20.0],
        "Temp_Avg": [25.0, 25.0, 25.0, 25.0],
        "Humidity": [60.0, 60.0, 60.0, 60.0],
        "Rainfall": [0.0, 0.0, 0.0, 0.0],
    })
    norm = normalize_weather_dataframe(raw, allowed_states=["Karnataka"])
    assert pd.isna(norm.loc[0, "State"])
    assert pd.isna(norm.loc[1, "State"])
    assert pd.isna(norm.loc[2, "State"])
    assert norm.loc[3, "State"] == "Karnataka"


def test_duplicate_column_names_normalization():
    """Verify that DataFrames with duplicate column names are normalized without assembly errors."""
    raw = pd.DataFrame(
        [[date(2026, 11, 1), date(2026, 11, 1), "Karnataka", 30.0, 20.0, 25.0, 60.0, 0.0]],
        columns=["date", "Date", "State", "Temp_Max", "Temp_Min", "Temp_Avg", "Humidity", "Rainfall"],
    )
    norm = normalize_weather_dataframe(raw)
    assert not norm.empty
    assert "Date" in norm.columns
    assert not norm.columns.duplicated().any()
    assert norm["Date"].iloc[0] == date(2026, 11, 1)


def test_compute_baselines_empty_panel_shape():
    """Verify that compute_baselines returns 2D (0, 7) arrays for empty test panel."""
    empty_panel = pd.DataFrame(columns=["Date", "State", "lag1_temp_avg"])
    persistence, climatology = compute_baselines(empty_panel)
    assert persistence.shape == (0, HORIZON_DAYS)
    assert climatology.shape == (0, HORIZON_DAYS)


def test_metric_values_empty_array_handling():
    """Verify that _metric_values on empty arrays returns zero metrics without sklearn ValueError."""
    from evaluate_deployed_artifact import _metric_values
    m = _metric_values(np.array([]), np.array([]))
    assert m == {"MAE": 0.0, "RMSE": 0.0, "R2": 0.0}


def test_unallowed_state_data_availability_isolation(tmp_path):
    """Verify that data availability checks ignore unallowed states and report post-cutoff shortfall."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "unallowed_state_eval.json"

    # Data extends 60 days post-cutoff, but only for an unallowed state ("California")
    dates = [date(2026, 10, 20) + timedelta(days=i) for i in range(60)]
    raw = pd.DataFrame({
        "date": dates,
        "state": "California",
        "temp_max": [30.0] * 60,
        "temp_min": [20.0] * 60,
        "temp_avg": [25.0] * 60,
        "humidity": [60.0] * 60,
        "rainfall": [0.0] * 60,
    })

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw,
        mode="independent",
    )

    # Should report insufficient post-cutoff data for the model's actual states
    assert result["status"] == "insufficient_post_cutoff_data"
    assert result["validated_for_artifact"] is False
    assert result["required_additional_days"] == 45


def test_climatology_unavailable_when_training_raw_missing():
    """Verify that when training_raw is None, climatology is None and does NOT substitute persistence."""
    test_dates = [date(2026, 11, 1) + timedelta(days=i) for i in range(5)]
    clean_panel = pd.DataFrame({
        "Date": test_dates,
        "State": "Karnataka",
        "lag1_temp_avg": [10.0, 10.0, 10.0, 10.0, 10.0],
    })
    pers, clim = compute_baselines(clean_panel, training_raw=None)
    assert clim is None
    assert pers.shape == (5, 7)
    assert np.all(pers == 10.0)


def test_climatology_does_not_substitute_persistence_for_missing_state():
    """Verify that if historical training data lacks a state, climatology is None and does not substitute lag1_temp_avg."""
    train_raw = pd.DataFrame({
        "Date": [date(2026, 10, 1)],
        "State": ["Maharashtra"],
        "Temp_Avg": [20.0],
    })
    test_panel = pd.DataFrame({
        "Date": [date(2026, 11, 1)],
        "State": ["Karnataka"],  # Different state with zero training observations
        "lag1_temp_avg": [10.0],
    })
    pers, clim = compute_baselines(test_panel, training_raw=train_raw)
    assert clim is None
    assert pers[0, 0] == 10.0


def test_climatology_reported_unavailable_in_evaluation_metrics(tmp_path):
    """Verify that when climatology cannot be formed, metrics report Climatology as unavailable while Persistence is present."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "clim_unavail_eval.json"

    # Provide data only during test period, with NO pre-test training history
    start_date = date(2026, 10, 24)
    dates = [start_date + timedelta(days=i) for i in range(46)]
    temp_avg = [25.0] * len(dates)
    raw = pd.DataFrame({
        "date": dates,
        "state": "Karnataka",
        "temp_max": [30.0] * len(dates),
        "temp_min": [20.0] * len(dates),
        "temp_avg": temp_avg,
        "humidity": [60.0] * len(dates),
        "rainfall": [0.0] * len(dates),
    })

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        raw_df=raw,
        mode="independent",
    )

    assert result["status"] == "validated"
    assert "Persistence" in result["metrics"]
    assert result["metrics"]["Persistence"]["status"] == "available"
    assert result["metrics"]["Persistence"]["MAE"] is not None

    assert "Climatology" in result["metrics"]
    assert result["metrics"]["Climatology"]["status"] == "unavailable"
    assert result["metrics"]["Climatology"]["MAE"] is None
    assert result["metrics"]["Climatology"]["RMSE"] is None
    assert result["metrics"]["Climatology"]["R2"] is None
    assert "persistence substitution strictly prohibited" in result["metrics"]["Climatology"]["reason"]


def test_persistence_separately_identified_baseline():
    """Verify that Persistence is always computed and separately identified."""
    test_dates = [date(2026, 11, 1) + timedelta(days=i) for i in range(3)]
    panel = pd.DataFrame({
        "Date": test_dates,
        "State": "Karnataka",
        "lag1_temp_avg": [22.0, 23.0, 24.0],
    })
    pers, clim = compute_baselines(panel, training_raw=None)
    assert pers.shape == (3, 7)
    assert pers[0, 0] == 22.0
    assert pers[1, 0] == 23.0
    assert pers[2, 0] == 24.0
    assert clim is None


def test_embargo_calculation_rationale_documented():
    """Verify that 8-day embargo calculation and rationale for October 31, 2026 are documented."""
    cutoff = date(2026, 10, 22)
    first_orig, last_orig, target_end, hist_start = calculate_eligible_test_period(cutoff, 30)
    assert first_orig == date(2026, 10, 31)
    assert last_orig == date(2026, 11, 29)
    assert target_end == date(2026, 12, 6)
    assert (first_orig - cutoff).days == 9
    assert "October 31, 2026" in EMBARGO_RATIONALE
    assert "2026-10-30" in EMBARGO_RATIONALE


def test_data_availability_distinguishes_historical_and_future(tmp_path):
    """Verify that data availability accurately separates historical elapsed days from future unobservable days,
    without describing the full 45 days as a shortfall, and reports 3 currently available complete origins."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "data_avail_eval.json"

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        database_free=True,
        mode="independent",
    )

    assert result["status"] == "insufficient_post_cutoff_data"
    da = result["data_availability"]
    # Total required post-cutoff data coverage is 45 calendar days (not a monolithic shortfall)
    assert da["total_required_post_cutoff_coverage_days"] == 45
    assert da["historical_elapsed_days"] == 18
    assert da["future_unobservable_days"] == 27
    assert da["historical_elapsed_days"] + da["future_unobservable_days"] == 45
    assert da["historical_elapsed_range"] == ["2026-10-23", "2026-11-09"]
    assert da["future_unobservable_range"] == ["2026-11-10", "2026-12-06"]
    # Exactly 3 eligible complete evaluation origins exist as of 2026-11-09
    assert da["eligible_complete_evaluation_origins_currently_available"] == 3
    assert da["eligible_complete_evaluation_origins_range"] == ["2026-10-31", "2026-11-02"]


def test_preliminary_evaluation_honest_assessment(tmp_path):
    """Verify that preliminary evaluation honesty check reports infeasibility on available data."""
    model_path = PROJECT_ROOT / "model" / "weather_model_v3.joblib"
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    temp_output = tmp_path / "prelim_eval.json"

    result = run_evaluation(
        artifact_path=model_path,
        source_model_info_path=info_path,
        output_path=temp_output,
        test_window_origins=30,
        database_free=True,
        mode="independent",
    )

    pe = result["preliminary_evaluation"]
    assert pe["feasible"] is False
    assert pe["available_post_cutoff_days"] == 0
    assert "An honest preliminary evaluation cannot be performed" in pe["assessment"]
    assert "minimum sample size requirement (30 forecast origins)" in pe["assessment"]


def test_embargo_implementation_origin_and_target_exclusion():
    """Verify that training cutoff is 2026-10-22, origins 2026-10-23 through 2026-10-30 are excluded/rejected,
    2026-10-31 is the first eligible origin, and all evaluation targets are strictly after the training cutoff."""
    info_path = PROJECT_ROOT / "model" / "model_info.json"
    source_info = json.loads(info_path.read_text(encoding="utf-8"))
    training_cutoff = get_training_cutoff(source_info)
    assert training_cutoff == date(2026, 10, 22), f"Expected 2026-10-22, got {training_cutoff}"

    # Confirm origins from 2026-10-23 through 2026-10-30 are rejected/excluded by embargo validation
    for offset in range(1, 9):  # 1 to 8 days post cutoff
        excluded_origin = training_cutoff + timedelta(days=offset)
        assert date(2026, 10, 23) <= excluded_origin <= date(2026, 10, 30)
        with pytest.raises(ValueError, match="violates the 8-day embargo"):
            validate_test_period_independence(excluded_origin, training_cutoff)

    # Confirm 2026-10-31 is the first eligible origin
    first_eligible = training_cutoff + timedelta(days=EMBARGO_OFFSET_DAYS)
    assert first_eligible == date(2026, 10, 31)
    # 2026-10-31 passes independence validation cleanly without exception
    validate_test_period_independence(first_eligible, training_cutoff)

    # Confirm every evaluation target for origins >= 2026-10-31 is strictly after the training cutoff
    for h in range(1, HORIZON_DAYS + 1):
        target_date = first_eligible + timedelta(days=h)
        assert target_date > training_cutoff, f"Target {target_date} must be strictly > cutoff {training_cutoff}"
        assert target_date >= date(2026, 11, 1), f"First target date must be >= 2026-11-01"
