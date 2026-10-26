"""Evaluate an existing multi-output artifact without fitting or replacing it.

The script reads only the statewide rows from PostgreSQL, preserves the
training feature contract, applies train/calibration/test date boundaries with
an eight-day forecast-origin separation (seven full target days plus one), and
predicts with the supplied artifact.  It never fits or writes a model file.

Example:
    python evaluate_deployed_artifact.py --artifact-path <path-to-v3-joblib> \
        --source-model-info <path-to-v3-model-info.json>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
from pathlib import Path
import sys
from typing import Any

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sqlalchemy import create_engine, text


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "backend"))
load_dotenv(PROJECT_ROOT / "backend" / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("evaluate_deployed_artifact")

HORIZON_DAYS = 7
EMBARGO_ORIGIN_DAYS = HORIZON_DAYS + 1
TEST_MONTHS = 12
CALIBRATION_MONTHS = 3

NUMERIC_FEATURES = [
    "lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg",
    "lag1_temp_max", "lag1_temp_min", "lag1_humidity", "lag1_rainfall",
    "lag2_humidity", "lag2_rainfall", "temp_range",
    "roll3_temp_avg", "roll7_temp_avg", "rainfall_roll3", "rainfall_roll7",
    "month_sin", "month_cos", "day_of_year_sin", "day_of_year_cos",
]
CAT_FEATURES = ["Season", "State"]
TARGET_COLUMNS = [f"target_{horizon}" for horizon in range(1, HORIZON_DAYS + 1)]


def _season(month: int) -> str:
    if month in (12, 1, 2):
        return "Winter"
    if month in (3, 4, 5):
        return "Summer"
    if month in (6, 7, 8, 9):
        return "Monsoon"
    return "Post-Monsoon"


def _build_panel(raw: pd.DataFrame, allowed_states: list[str] | None) -> pd.DataFrame:
    """Build the same 20 leakage-safe features and seven targets as training."""
    df = raw.rename(columns={
        "date": "Date", "state": "State", "temp_max": "Temp_Max",
        "temp_min": "Temp_Min", "temp_avg": "Temp_Avg",
        "humidity": "Humidity", "rainfall": "Rainfall",
    }).copy()
    df["Date"] = pd.to_datetime(df["Date"])
    if allowed_states:
        df = df[df["State"].isin(allowed_states)].copy()
    df = df.sort_values(["State", "Date"]).reset_index(drop=True)
    grouped = df.groupby("State", sort=False)

    df["Month"] = df["Date"].dt.month
    df["Season"] = df["Month"].map(_season)
    day_of_year = df["Date"].dt.dayofyear
    df["day_of_year"] = day_of_year
    for lag in (1, 2, 3):
        df[f"lag{lag}_temp_avg"] = grouped["Temp_Avg"].shift(lag)
    for source, target in (
        ("Temp_Max", "lag1_temp_max"), ("Temp_Min", "lag1_temp_min"),
        ("Humidity", "lag1_humidity"), ("Rainfall", "lag1_rainfall"),
    ):
        df[target] = grouped[source].shift(1)
    df["lag2_humidity"] = grouped["Humidity"].shift(2)
    df["lag2_rainfall"] = grouped["Rainfall"].shift(2)
    df["temp_range"] = df["lag1_temp_max"] - df["lag1_temp_min"]

    for column, window, aggregation in (
        ("roll3_temp_avg", 3, "mean"), ("roll7_temp_avg", 7, "mean"),
        ("rainfall_roll3", 3, "sum"), ("rainfall_roll7", 7, "sum"),
    ):
        source = "Temp_Avg" if column.startswith("roll") else "Rainfall"
        df[column] = grouped[source].transform(
            lambda values, window=window, aggregation=aggregation:
                getattr(values.shift(1).rolling(window, min_periods=window), aggregation)()
        )

    df["month_sin"] = np.sin(2 * np.pi * df["Month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["Month"] / 12)
    df["day_of_year_sin"] = np.sin(2 * np.pi * day_of_year / 365)
    df["day_of_year_cos"] = np.cos(2 * np.pi * day_of_year / 365)
    grouped = df.groupby("State", sort=False)
    for horizon, target in enumerate(TARGET_COLUMNS, start=1):
        df[target] = grouped["Temp_Avg"].shift(-horizon)

    return df.dropna(subset=NUMERIC_FEATURES + CAT_FEATURES + TARGET_COLUMNS).reset_index(drop=True)


def _metric_values(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    return {
        "MAE": float(mean_absolute_error(actual, predicted)),
        "RMSE": float(np.sqrt(mean_squared_error(actual, predicted))),
        "R2": float(r2_score(actual, predicted)),
    }


def _metrics_by_horizon(actual: np.ndarray, predicted: np.ndarray) -> dict[str, dict[str, float]]:
    return {
        f"day_{day}": _metric_values(actual[:, day - 1], predicted[:, day - 1])
        for day in range(1, HORIZON_DAYS + 1)
    }


def run_evaluation(
    *,
    artifact_path: Path,
    source_model_info_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    if not artifact_path.is_file():
        raise FileNotFoundError(f"Artifact not found: {artifact_path}")
    if not source_model_info_path.is_file():
        raise FileNotFoundError(f"Source model metadata not found: {source_model_info_path}")
    if not os.environ.get("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL must be configured for read-only evaluation.")

    source_info = json.loads(source_model_info_path.read_text(encoding="utf-8"))
    artifact_features = source_info.get("features")
    if not isinstance(artifact_features, list) or len(artifact_features) != 20:
        raise ValueError("The supplied artifact metadata does not declare the 20-feature contract.")
    if "v3" not in str(source_info.get("model_path", artifact_path.name)).casefold():
        raise ValueError("Refusing to mark a non-v3 artifact as the deployed v3 evaluation.")

    engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            with connection.begin():
                connection.exec_driver_sql("SET TRANSACTION READ ONLY")
                raw = pd.read_sql_query(text("""
                    SELECT date, state, temp_max, temp_min, temp_avg, humidity, rainfall
                    FROM weather_data
                    WHERE state <> 'Other'
                      AND COALESCE(district, '') = ''
                      AND COALESCE(location, '') = ''
                    ORDER BY state, date
                """), connection)
    finally:
        engine.dispose()
    if raw.empty:
        raise ValueError("No statewide weather rows are available for evaluation.")

    panel = _build_panel(raw, source_info.get("states"))
    if panel.empty:
        raise ValueError("No complete rows remain after feature and target construction.")

    max_origin = panel["Date"].max()
    test_start = max_origin - pd.DateOffset(months=TEST_MONTHS) + pd.Timedelta(days=1)
    calibration_start = test_start - pd.DateOffset(months=CALIBRATION_MONTHS)
    train_end = calibration_start - pd.Timedelta(days=EMBARGO_ORIGIN_DAYS)
    calibration_end = test_start - pd.Timedelta(days=EMBARGO_ORIGIN_DAYS)
    train = panel[panel["Date"] <= train_end].copy()
    calibration = panel[(panel["Date"] >= calibration_start) & (panel["Date"] <= calibration_end)].copy()
    test = panel[panel["Date"] >= test_start].copy()
    if train.empty or calibration.empty or test.empty:
        raise ValueError("Train/calibration/test split produced an empty partition.")
    if train["Date"].max() + pd.Timedelta(days=HORIZON_DAYS) >= calibration["Date"].min():
        raise AssertionError("Train labels overlap the calibration forecast origins.")
    if calibration["Date"].max() + pd.Timedelta(days=HORIZON_DAYS) >= test["Date"].min():
        raise AssertionError("Calibration labels overlap the test forecast origins.")

    model = joblib.load(artifact_path)
    X_test = test[artifact_features]
    actual = test[TARGET_COLUMNS].to_numpy(dtype=float)
    prediction = np.asarray(model.predict(X_test), dtype=float)
    if prediction.shape != actual.shape or not np.isfinite(prediction).all():
        raise ValueError(f"Artifact returned invalid predictions with shape {prediction.shape}; expected {actual.shape}.")

    persistence = np.repeat(test["lag1_temp_avg"].to_numpy(dtype=float)[:, None], HORIZON_DAYS, axis=1)
    climatology_lookup = train.groupby(["State", "day_of_year"])["Temp_Avg"].mean().to_dict()
    state_fallback = train.groupby("State")["Temp_Avg"].mean().to_dict()
    climatology = np.array([
        [climatology_lookup.get(
            (row.State, (row.Date + pd.Timedelta(days=day)).dayofyear),
            state_fallback.get(row.State),
        ) for day in range(1, HORIZON_DAYS + 1)]
        for row in test.itertuples()
    ], dtype=float)

    targets = {
        "LightGBM": prediction,
        "Persistence": persistence,
        "Climatology": climatology,
    }
    metrics: dict[str, Any] = {}
    for name, estimates in targets.items():
        overall = _metric_values(actual.reshape(-1), estimates.reshape(-1))
        per_horizon = _metrics_by_horizon(actual, estimates)
        metrics[name] = {
            **overall,
            "overall": overall,
            "by_horizon": per_horizon,
        }
    metrics["LightGBM"]["skill_vs_persistence"] = float(
        1 - metrics["LightGBM"]["MAE"] / metrics["Persistence"]["MAE"]
    )
    metrics["LightGBM"]["skill_vs_persistence_by_horizon"] = {
        f"day_{day}": float(
            1 - metrics["LightGBM"]["by_horizon"][f"day_{day}"]["MAE"] /
            metrics["Persistence"]["by_horizon"][f"day_{day}"]["MAE"]
        )
        for day in range(1, HORIZON_DAYS + 1)
    }

    trained_through = source_info.get("trained_through")
    if trained_through is None:
        trained_through = (source_info.get("train_period") or [None, None])[-1]
    # The v3 metadata says it was trained through 2026-10-22, later than this
    # holdout's start. Metrics are computed with v3 but cannot be called an
    # independent validation until an untouched test period is available.
    independent = bool(trained_through and pd.Timestamp(trained_through) < test_start)
    artifact_hash = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    evaluation = {
        "status": "validated" if independent else "artifact_evaluated_training_overlap",
        "validated_for_artifact": independent,
        "artifact_run_completed": True,
        "artifact_name": artifact_path.name,
        "artifact_sha256": artifact_hash,
        "artifact_trained_through": str(trained_through) if trained_through else None,
        "horizon_days": HORIZON_DAYS,
        "embargo_origin_days": EMBARGO_ORIGIN_DAYS,
        "train_period": [str(train["Date"].min().date()), str(train["Date"].max().date())],
        "calibration_period": [str(calibration["Date"].min().date()), str(calibration["Date"].max().date())],
        "test_period": [str(test["Date"].min().date()), str(test["Date"].max().date())],
        "row_counts": {
            "train": int(len(train)), "calibration": int(len(calibration)), "test": int(len(test)),
        },
        "metrics": metrics,
        "note": (
            None if independent else
            "The exact v3 artifact completed evaluation, but its recorded training cutoff overlaps "
            "the test window. These are diagnostic artifact scores, not independent validation."
        ),
    }

    output = json.loads(output_path.read_text(encoding="utf-8")) if output_path.exists() else {}
    output.update({
        "train_period": evaluation["train_period"],
        "calibration_period": evaluation["calibration_period"],
        "test_period": evaluation["test_period"],
        "metrics": metrics,
        "evaluation": evaluation,
        "validated_for_artifact": independent,
        "metrics_status": evaluation["status"],
        "interval_status": "not_calibrated_for_current_artifact",
        "evaluation_artifact": artifact_path.name,
        "evaluation_artifact_sha256": artifact_hash,
        "evaluation_note": evaluation["note"],
    })
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temp_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(output_path)
    logger.info("Evaluated %s (%s); metadata written to %s", artifact_path.name, artifact_hash, output_path)
    return evaluation


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-path", type=Path, required=True)
    parser.add_argument("--source-model-info", type=Path, required=True)
    parser.add_argument("--output-path", type=Path, default=PROJECT_ROOT / "model" / "model_info.json")
    args = parser.parse_args()
    result = run_evaluation(
        artifact_path=args.artifact_path,
        source_model_info_path=args.source_model_info,
        output_path=args.output_path,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
