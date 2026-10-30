"""Evaluate an existing multi-output artifact without fitting or replacing it.

Reads statewide observations, verifies consecutive calendar dates independently
for each state, enforces an eight-day post-training embargo, and evaluates
on genuine post-training test windows (30, 60, or 90 forecast origins).

Never fits or modifies a model artifact, and never alters model/model_info.json.
Results are saved separately to model/evaluation_results_v3.json.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
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

logger = logging.getLogger("evaluate_deployed_artifact")

HORIZON_DAYS = 7
EMBARGO_DAYS = 8
EMBARGO_OFFSET_DAYS = 9  # First eligible forecast origin is training cutoff + 9 calendar days
REQUIRED_LAG_DAYS = 7
VALID_TEST_WINDOWS = (30, 60, 90)

NUMERIC_FEATURES = [
    "lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg",
    "lag1_temp_max", "lag1_temp_min", "lag1_humidity", "lag1_rainfall",
    "lag2_humidity", "lag2_rainfall", "temp_range",
    "roll3_temp_avg", "roll7_temp_avg", "rainfall_roll3", "rainfall_roll7",
    "month_sin", "month_cos", "day_of_year_sin", "day_of_year_cos",
]
CAT_FEATURES = ["Season", "State"]
FEATURE_ORDER = NUMERIC_FEATURES + CAT_FEATURES
TARGET_COLUMNS = [f"target_{horizon}" for horizon in range(1, HORIZON_DAYS + 1)]


def _season(month: int) -> str:
    """Return the meteorological season for an Indian calendar month."""
    if month in (12, 1, 2):
        return "Winter"
    if month in (3, 4, 5):
        return "Summer"
    if month in (6, 7, 8, 9):
        return "Monsoon"
    return "Post-Monsoon"


def get_training_cutoff(source_info: dict[str, Any]) -> date:
    """Extract the model training cutoff date from metadata."""
    evaluation_block = source_info.get("evaluation") if isinstance(source_info.get("evaluation"), dict) else {}
    raw = (
        source_info.get("trained_through")
        or source_info.get("artifact_trained_through")
        or evaluation_block.get("artifact_trained_through")
        or evaluation_block.get("trained_through")
        or (source_info.get("train_period") or [None, None])[-1]
    )
    if not raw:
        raise ValueError("Could not determine model training cutoff from metadata.")
    if isinstance(raw, str):
        return date.fromisoformat(raw[:10])
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    raise ValueError(f"Unrecognized training cutoff date format: {raw}")


def calculate_eligible_test_period(
    training_cutoff: date,
    window_days: int = 30,
) -> tuple[date, date, date, date]:
    """Calculate the eligible test window and target coverage.

    Returns:
        (first_origin, last_origin, target_end_date, history_start_date)
    """
    if window_days not in VALID_TEST_WINDOWS:
        raise ValueError(
            f"Invalid test window: {window_days}. Must be one of {VALID_TEST_WINDOWS} forecast origins."
        )
    first_origin = training_cutoff + timedelta(days=EMBARGO_OFFSET_DAYS)
    last_origin = first_origin + timedelta(days=window_days - 1)
    target_end_date = last_origin + timedelta(days=HORIZON_DAYS)
    history_start_date = first_origin - timedelta(days=REQUIRED_LAG_DAYS)
    return first_origin, last_origin, target_end_date, history_start_date


def validate_test_period_independence(test_start: date, training_cutoff: date) -> None:
    """Validate that the test period does not overlap training and respects the 8-day embargo."""
    first_eligible = training_cutoff + timedelta(days=EMBARGO_OFFSET_DAYS)
    if test_start < first_eligible:
        raise ValueError(
            f"Test start date {test_start} violates the 8-day embargo after training cutoff {training_cutoff}. "
            f"The first eligible forecast origin is {first_eligible}."
        )


def build_calendar_verified_panel(
    raw: pd.DataFrame,
    allowed_states: list[str] | None = None,
    min_origin: date | None = None,
    max_origin: date | None = None,
) -> pd.DataFrame:
    """Build the 20 model features and 7 targets verifying actual calendar dates.

    Verifies consecutive calendar dates independently per state.
    Missing calendar dates or incomplete 7-day target windows are excluded.
    """
    if raw.empty:
        return pd.DataFrame()

    df = raw.rename(columns={
        "date": "Date", "state": "State", "temp_max": "Temp_Max",
        "temp_min": "Temp_Min", "temp_avg": "Temp_Avg",
        "humidity": "Humidity", "rainfall": "Rainfall",
    }).copy()

    df["Date"] = pd.to_datetime(df["Date"]).dt.date
    if allowed_states:
        df = df[df["State"].isin(allowed_states)].copy()

    required_cols = ["Date", "State", "Temp_Max", "Temp_Min", "Temp_Avg", "Humidity", "Rainfall"]
    df = df.dropna(subset=required_cols)

    rows: list[dict[str, Any]] = []

    for state, state_group in df.groupby("State"):
        # Sort and deduplicate by date for this state
        sorted_state = state_group.sort_values("Date").drop_duplicates(subset=["Date"])
        date_map = {row.Date: row for row in sorted_state.itertuples(index=False)}
        all_dates = set(date_map.keys())

        # Candidate forecast origins within the requested bounds
        candidate_origins = sorted([
            d for d in all_dates
            if (min_origin is None or d >= min_origin) and (max_origin is None or d <= max_origin)
        ])

        for t in candidate_origins:
            # Check past 7 consecutive calendar dates (t-1, ..., t-7)
            past_dates = [t - timedelta(days=d) for d in range(1, REQUIRED_LAG_DAYS + 1)]
            if not all(d in all_dates for d in past_dates):
                continue

            # Check future 7 consecutive calendar dates (t+1, ..., t+7)
            future_dates = [t + timedelta(days=h) for h in range(1, HORIZON_DAYS + 1)]
            if not all(d in all_dates for d in future_dates):
                continue

            r1 = date_map[past_dates[0]]  # t - 1
            r2 = date_map[past_dates[1]]  # t - 2
            r3 = date_map[past_dates[2]]  # t - 3
            past_records = [date_map[d] for d in past_dates]

            day_of_year = t.timetuple().tm_yday

            row_data = {
                "Date": t,
                "State": state,
                "lag1_temp_avg": float(r1.Temp_Avg),
                "lag2_temp_avg": float(r2.Temp_Avg),
                "lag3_temp_avg": float(r3.Temp_Avg),
                "lag1_temp_max": float(r1.Temp_Max),
                "lag1_temp_min": float(r1.Temp_Min),
                "lag1_humidity": float(r1.Humidity),
                "lag1_rainfall": float(r1.Rainfall),
                "lag2_humidity": float(r2.Humidity),
                "lag2_rainfall": float(r2.Rainfall),
                "temp_range": float(r1.Temp_Max - r1.Temp_Min),
                "roll3_temp_avg": float((r1.Temp_Avg + r2.Temp_Avg + r3.Temp_Avg) / 3.0),
                "roll7_temp_avg": float(sum(r.Temp_Avg for r in past_records) / 7.0),
                "rainfall_roll3": float(r1.Rainfall + r2.Rainfall + r3.Rainfall),
                "rainfall_roll7": float(sum(r.Rainfall for r in past_records)),
                "month_sin": float(np.sin(2 * np.pi * t.month / 12)),
                "month_cos": float(np.cos(2 * np.pi * t.month / 12)),
                "day_of_year_sin": float(np.sin(2 * np.pi * day_of_year / 365)),
                "day_of_year_cos": float(np.cos(2 * np.pi * day_of_year / 365)),
                "Season": _season(t.month),
            }

            for h in range(1, HORIZON_DAYS + 1):
                row_data[f"target_{h}"] = float(date_map[future_dates[h - 1]].Temp_Avg)

            rows.append(row_data)

    if not rows:
        return pd.DataFrame()

    panel = pd.DataFrame(rows).sort_values(["State", "Date"]).reset_index(drop=True)
    return panel


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


def compute_baselines(
    test_panel: pd.DataFrame,
    training_raw: pd.DataFrame | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute Persistence and Climatology baseline predictions for test panel.

    Persistence uses strictly lag1_temp_avg (t-1) for all 7 horizons.
    Climatology uses historical training observations strictly prior to the test period.
    """
    persistence = np.repeat(test_panel["lag1_temp_avg"].to_numpy(dtype=float)[:, None], HORIZON_DAYS, axis=1)

    if training_raw is not None and not training_raw.empty:
        raw_tr = training_raw.copy()
        raw_tr["Date"] = pd.to_datetime(raw_tr["Date"] if "Date" in raw_tr.columns else raw_tr["date"])
        state_col = "State" if "State" in raw_tr.columns else "state"
        temp_col = "Temp_Avg" if "Temp_Avg" in raw_tr.columns else "temp_avg"
        raw_tr["day_of_year"] = raw_tr["Date"].dt.dayofyear
        climatology_lookup = raw_tr.groupby([state_col, "day_of_year"])[temp_col].mean().to_dict()
        state_fallback = raw_tr.groupby(state_col)[temp_col].mean().to_dict()
    else:
        climatology_lookup = {}
        state_fallback = test_panel.groupby("State")["lag1_temp_avg"].mean().to_dict()

    climatology = np.array([
        [
            climatology_lookup.get(
                (row.State, (pd.Timestamp(row.Date) + pd.Timedelta(days=day)).dayofyear),
                state_fallback.get(row.State, row.lag1_temp_avg),
            )
            for day in range(1, HORIZON_DAYS + 1)
        ]
        for row in test_panel.itertuples()
    ], dtype=float)

    return persistence, climatology


def run_evaluation(
    *,
    artifact_path: Path,
    source_model_info_path: Path,
    output_path: Path | None = None,
    test_window_origins: int = 30,
    raw_df: pd.DataFrame | None = None,
    custom_test_start: date | None = None,
) -> dict[str, Any]:
    """Execute independent evaluation without modifying model artifacts or model_info.json."""
    if not artifact_path.is_file():
        raise FileNotFoundError(f"Artifact not found: {artifact_path}")
    if not source_model_info_path.is_file():
        raise FileNotFoundError(f"Source model metadata not found: {source_model_info_path}")

    target_output = output_path or (PROJECT_ROOT / "model" / "evaluation_results_v3.json")
    if target_output.resolve() == (PROJECT_ROOT / "model" / "model_info.json").resolve():
        raise ValueError(
            "Modifying model_info.json is strictly prohibited. Output must be saved separately as model/evaluation_results_v3.json."
        )

    source_info = json.loads(source_model_info_path.read_text(encoding="utf-8"))
    artifact_features = source_info.get("features", [])
    if len(artifact_features) != 20:
        raise ValueError("The supplied artifact metadata does not declare the 20-feature contract.")

    artifact_hash = hashlib.sha256(artifact_path.read_bytes()).hexdigest()

    training_cutoff = get_training_cutoff(source_info)
    first_eligible_origin, last_eligible_origin, target_end_date, history_start_date = calculate_eligible_test_period(
        training_cutoff, test_window_origins
    )

    test_start = custom_test_start or first_eligible_origin
    validate_test_period_independence(test_start, training_cutoff)
    test_end = test_start + timedelta(days=test_window_origins - 1)
    required_target_end = test_end + timedelta(days=HORIZON_DAYS)

    # Acquire dataset: from passed DataFrame or read-only PostgreSQL
    raw = raw_df
    if raw is None:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            raw = pd.DataFrame()
        else:
            engine = create_engine(db_url, pool_pre_ping=True)
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
            except Exception as e:
                logger.warning("Could not connect to database for evaluation: %s", e)
                raw = pd.DataFrame()
            finally:
                engine.dispose()

    # Determine data availability and required additional days
    if raw is not None and not raw.empty:
        date_series = pd.to_datetime(raw["Date"] if "Date" in raw.columns else raw["date"]).dt.date
        max_available_date = date_series.max()
    else:
        max_available_date = training_cutoff

    if max_available_date < required_target_end:
        additional_days = (required_target_end - max_available_date).days
        result = {
            "status": "insufficient_post_cutoff_data",
            "validated_for_artifact": False,
            "artifact_name": artifact_path.name,
            "artifact_sha256": artifact_hash,
            "artifact_trained_through": str(training_cutoff),
            "embargo_days": EMBARGO_DAYS,
            "embargo_offset_days": EMBARGO_OFFSET_DAYS,
            "first_eligible_origin": str(first_eligible_origin),
            "test_window_origins": test_window_origins,
            "test_period": [str(test_start), str(test_end)],
            "required_target_end": str(required_target_end),
            "latest_available_date": str(max_available_date),
            "required_additional_days": additional_days,
            "sample_counts": {"test_origins": 0, "total_predictions": 0},
            "metrics": {},
            "data_integrity": {
                "consecutive_calendar_dates_verified": True,
                "missing_dates_excluded": True,
                "training_overlap_checked": True,
                "independent": False,
            },
            "note": (
                f"Sufficient post-cutoff observations do not exist. Evaluation of a {test_window_origins}-day "
                f"window requires verified observations through {required_target_end}, but dataset only reaches "
                f"{max_available_date}. Exactly {additional_days} additional days of observations are required."
            ),
        }
        target_output.parent.mkdir(parents=True, exist_ok=True)
        target_output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        logger.info("Evaluation logged to %s: insufficient post-cutoff data (%d days needed)", target_output, additional_days)
        return result

    # Build calendar-verified test panel
    test_panel = build_calendar_verified_panel(
        raw,
        allowed_states=source_info.get("states"),
        min_origin=test_start,
        max_origin=test_end,
    )

    if test_panel.empty:
        result = {
            "status": "empty_calendar_verified_panel",
            "validated_for_artifact": False,
            "artifact_name": artifact_path.name,
            "artifact_sha256": artifact_hash,
            "artifact_trained_through": str(training_cutoff),
            "test_window_origins": test_window_origins,
            "sample_counts": {"test_origins": 0, "total_predictions": 0},
            "metrics": {},
            "note": "No complete calendar-verified rows could be constructed for the test window.",
        }
        target_output.parent.mkdir(parents=True, exist_ok=True)
        target_output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        return result

    # Execute predictions with the loaded model
    model = joblib.load(artifact_path)
    X_test = test_panel[FEATURE_ORDER]
    actual = test_panel[TARGET_COLUMNS].to_numpy(dtype=float)
    prediction = np.asarray(model.predict(X_test), dtype=float)

    if prediction.shape != actual.shape or not np.isfinite(prediction).all():
        raise ValueError(
            f"Artifact returned invalid predictions with shape {prediction.shape}; expected {actual.shape}."
        )

    # Baseline calculations strictly using pre-test data
    training_raw = raw[date_series <= training_cutoff] if raw is not None else None
    persistence, climatology = compute_baselines(test_panel, training_raw=training_raw)

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

    result = {
        "status": "validated",
        "validated_for_artifact": True,
        "artifact_run_completed": True,
        "artifact_name": artifact_path.name,
        "artifact_sha256": artifact_hash,
        "artifact_trained_through": str(training_cutoff),
        "embargo_days": EMBARGO_DAYS,
        "embargo_offset_days": EMBARGO_OFFSET_DAYS,
        "first_eligible_origin": str(first_eligible_origin),
        "test_window_origins": test_window_origins,
        "test_period": [str(test_panel["Date"].min()), str(test_panel["Date"].max())],
        "target_period": [str(test_panel["Date"].min() + timedelta(days=1)), str(test_panel["Date"].max() + timedelta(days=HORIZON_DAYS))],
        "sample_counts": {
            "test_origins": int(test_panel["Date"].nunique()),
            "states_evaluated": int(test_panel["State"].nunique()),
            "total_predictions": int(len(test_panel) * HORIZON_DAYS),
        },
        "metrics": metrics,
        "interval_status": "not_calibrated_for_current_artifact",
        "data_integrity": {
            "consecutive_calendar_dates_verified": True,
            "missing_dates_excluded": True,
            "training_overlap_checked": True,
            "independent": True,
        },
        "note": "Independent post-cutoff chronological evaluation completed successfully.",
    }

    target_output.parent.mkdir(parents=True, exist_ok=True)
    target_output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    logger.info("Independent evaluation completed and saved to %s", target_output)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--artifact-path",
        type=Path,
        default=PROJECT_ROOT / "model" / "weather_model_v3.joblib",
        help="Path to the trained model artifact joblib file.",
    )
    parser.add_argument(
        "--source-model-info",
        type=Path,
        default=PROJECT_ROOT / "model" / "model_info.json",
        help="Path to model metadata JSON.",
    )
    parser.add_argument(
        "--output-path",
        type=Path,
        default=PROJECT_ROOT / "model" / "evaluation_results_v3.json",
        help="Path where evaluation results JSON will be saved.",
    )
    parser.add_argument(
        "--test-window",
        type=int,
        choices=[30, 60, 90],
        default=30,
        help="Test window size in forecast origins (30, 60, or 90).",
    )
    args = parser.parse_args()

    result = run_evaluation(
        artifact_path=args.artifact_path,
        source_model_info_path=args.source_model_info,
        output_path=args.output_path,
        test_window_origins=args.test_window,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
