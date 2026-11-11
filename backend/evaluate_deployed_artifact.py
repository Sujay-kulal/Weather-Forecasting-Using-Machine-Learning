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

EMBARGO_RATIONALE = (
    "The production model was trained through cutoff T_cutoff = 2026-10-22. "
    "Because the forecasting horizon is 7 days (H = 7), forecasts generated at the training cutoff (2026-10-22) "
    "predict targets across 2026-10-23 through 2026-10-29. To prevent target-window overlap between training and "
    "evaluation, an 8-day embargo separation (T_cutoff + 8 days = 2026-10-30) is enforced. Therefore, October 30 is "
    "the 8th embargo day and final buffer date. The very first calendar date eligible to serve as an out-of-sample "
    "forecast origin is T_cutoff + 9 calendar days = October 31, 2026 (first_eligible_origin). Forecasts made at origin "
    "2026-10-31 predict targets across 2026-11-01 through 2026-11-07, guaranteeing zero overlap with training targets."
)

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

    Strict 8-Day Embargo Rationale:
    1. Training cutoff T_cutoff = 2026-10-22.
    2. Forecast horizon H = 7 days: forecasts made at T_cutoff cover targets through 2026-10-29.
    3. An 8-day embargo separation (T_cutoff + 8 days = 2026-10-30) ensures zero target-window overlap.
    4. First eligible forecast origin is T_cutoff + 9 days = October 31, 2026.
    5. Forecasts generated on 2026-10-31 predict targets across 2026-11-01 through 2026-11-07.

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


def normalize_weather_dataframe(
    raw: pd.DataFrame,
    allowed_states: list[str] | None = None,
) -> pd.DataFrame:
    """Normalize column names case-insensitively, parse Date safely, coerce numerics, and clean State names."""
    if raw is None or raw.empty:
        return pd.DataFrame()

    canonical_map = {
        "date": "Date",
        "state": "State",
        "temp_max": "Temp_Max",
        "temp_min": "Temp_Min",
        "temp_avg": "Temp_Avg",
        "humidity": "Humidity",
        "rainfall": "Rainfall",
    }
    rename_dict: dict[str, str] = {}
    for col in raw.columns:
        norm_key = str(col).strip().lower().replace(" ", "_").replace("-", "_")
        if norm_key in canonical_map:
            rename_dict[col] = canonical_map[norm_key]
        elif col in canonical_map.values():
            rename_dict[col] = str(col)

    df = raw.rename(columns=rename_dict).copy()
    if df.columns.duplicated().any():
        df = df.loc[:, ~df.columns.duplicated(keep="first")].copy()

    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce").dt.date

    numeric_cols = ["Temp_Max", "Temp_Min", "Temp_Avg", "Humidity", "Rainfall"]
    for ncol in numeric_cols:
        if ncol in df.columns:
            df[ncol] = pd.to_numeric(df[ncol], errors="coerce")

    if "State" in df.columns:
        if allowed_states:
            state_lookup = {s.strip().lower(): s.strip() for s in allowed_states}
            def _clean_state_with_lookup(s: Any) -> Any:
                if pd.isna(s):
                    return np.nan
                s_str = str(s).strip()
                if not s_str or s_str.lower() in ("nan", "none", "null"):
                    return np.nan
                return state_lookup.get(s_str.lower(), s_str.title())
            df["State"] = df["State"].apply(_clean_state_with_lookup)
        else:
            def _clean_state_plain(s: Any) -> Any:
                if pd.isna(s):
                    return np.nan
                s_str = str(s).strip()
                if not s_str or s_str.lower() in ("nan", "none", "null"):
                    return np.nan
                return s_str.title()
            df["State"] = df["State"].apply(_clean_state_plain)

    return df


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
    df = normalize_weather_dataframe(raw, allowed_states=allowed_states)
    if df.empty:
        return pd.DataFrame()

    required_cols = ["Date", "State", "Temp_Max", "Temp_Min", "Temp_Avg", "Humidity", "Rainfall"]
    if not all(col in df.columns for col in required_cols):
        missing = [c for c in required_cols if c not in df.columns]
        logger.warning("Dataframe missing required weather columns: %s", missing)
        return pd.DataFrame()

    if allowed_states:
        df = df[df["State"].isin(allowed_states)].copy()

    df = df.dropna(subset=required_cols)
    if df.empty:
        return pd.DataFrame()

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
    if len(actual) == 0:
        return {"MAE": 0.0, "RMSE": 0.0, "R2": 0.0}
    mae = float(mean_absolute_error(actual, predicted))
    rmse = float(np.sqrt(mean_squared_error(actual, predicted)))
    if len(actual) < 2:
        r2 = 0.0
    else:
        r2_val = r2_score(actual, predicted)
        r2 = float(r2_val) if np.isfinite(r2_val) else 0.0
    return {
        "MAE": mae,
        "RMSE": rmse,
        "R2": r2,
    }


def _metrics_by_horizon(actual: np.ndarray, predicted: np.ndarray) -> dict[str, dict[str, float]]:
    return {
        f"day_{day}": _metric_values(actual[:, day - 1], predicted[:, day - 1])
        for day in range(1, HORIZON_DAYS + 1)
    }


def compute_baselines(
    test_panel: pd.DataFrame,
    training_raw: pd.DataFrame | None = None,
) -> tuple[np.ndarray, np.ndarray | None]:
    """Compute Persistence and Climatology baseline predictions for test panel.

    Persistence uses strictly point-in-time lag1_temp_avg (t-1) for all 7 horizons.
    Climatology uses historical training observations strictly prior to the test period.
    If historical training observations are unavailable or incomplete, climatology is
    returned as None (unavailable); substituting previous-day persistence for climatology
    is strictly prohibited to prevent baseline mislabeling.
    """
    if test_panel.empty:
        return np.empty((0, HORIZON_DAYS), dtype=float), np.empty((0, HORIZON_DAYS), dtype=float)

    persistence = np.repeat(test_panel["lag1_temp_avg"].to_numpy(dtype=float)[:, None], HORIZON_DAYS, axis=1)

    if training_raw is None or training_raw.empty:
        return persistence, None

    raw_tr = normalize_weather_dataframe(training_raw)
    if raw_tr.empty or not all(c in raw_tr.columns for c in ("Date", "State", "Temp_Avg")):
        return persistence, None

    raw_tr = raw_tr.dropna(subset=["Date", "State", "Temp_Avg"])
    if raw_tr.empty:
        return persistence, None

    raw_tr["day_of_year"] = pd.to_datetime(raw_tr["Date"]).dt.dayofyear
    climatology_lookup = raw_tr.groupby(["State", "day_of_year"])["Temp_Avg"].mean().to_dict()
    state_fallback = raw_tr.groupby("State")["Temp_Avg"].mean().to_dict()

    climatology_rows = []
    has_missing = False
    for row in test_panel.itertuples():
        row_preds = []
        for day in range(1, HORIZON_DAYS + 1):
            target_doy = (pd.Timestamp(row.Date) + pd.Timedelta(days=day)).dayofyear
            # 1. Lookup historical training mean for this (State, day_of_year)
            pred = climatology_lookup.get((row.State, target_doy))
            # 2. If not found, fallback to historical training mean for State
            if pred is None or not np.isfinite(pred):
                pred = state_fallback.get(row.State)
            # 3. If no historical training data exists for state, DO NOT substitute persistence.
            # Mark as missing so climatology is reported as unavailable.
            if pred is None or not np.isfinite(pred):
                has_missing = True
                row_preds.append(np.nan)
            else:
                row_preds.append(float(pred))
        climatology_rows.append(row_preds)

    if has_missing:
        return persistence, None

    return persistence, np.array(climatology_rows, dtype=float)


def run_evaluation(
    *,
    artifact_path: Path,
    source_model_info_path: Path,
    output_path: Path | None = None,
    test_window_origins: int = 30,
    raw_df: pd.DataFrame | None = None,
    eval_data_path: Path | None = None,
    custom_test_start: date | None = None,
    database_free: bool = False,
    mode: str = "independent",
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
    if artifact_features != FEATURE_ORDER:
        raise ValueError(
            f"The supplied artifact metadata features do not match the expected 20-feature contract: "
            f"{artifact_features} != {FEATURE_ORDER}"
        )

    artifact_hash = hashlib.sha256(artifact_path.read_bytes()).hexdigest()

    training_cutoff = get_training_cutoff(source_info)
    first_eligible_origin, last_eligible_origin, target_end_date, history_start_date = calculate_eligible_test_period(
        training_cutoff, test_window_origins
    )

    if custom_test_start:
        test_start = custom_test_start
    elif mode == "diagnostic":
        hist_test_start = (source_info.get("test_period") or [None])[0]
        if hist_test_start:
            test_start = date.fromisoformat(str(hist_test_start)[:10])
        else:
            test_start = training_cutoff - timedelta(days=test_window_origins + HORIZON_DAYS)
    else:
        test_start = first_eligible_origin

    if mode == "independent":
        validate_test_period_independence(test_start, training_cutoff)
    test_end = test_start + timedelta(days=test_window_origins - 1)
    required_target_end = test_end + timedelta(days=HORIZON_DAYS)

    # Acquire dataset: from passed DataFrame, evaluation file, or read-only PostgreSQL
    raw = raw_df
    if raw is None and eval_data_path is not None:
        eval_path = Path(eval_data_path)
        if not eval_path.is_file():
            raise FileNotFoundError(f"Evaluation data file not found: {eval_path}")
        if eval_path.suffix.lower() == ".csv":
            raw = pd.read_csv(eval_path)
        elif eval_path.suffix.lower() in (".parquet", ".pq"):
            raw = pd.read_parquet(eval_path)
        else:
            raise ValueError(f"Unsupported evaluation data file format: {eval_path.suffix}")

    if raw is None and not database_free:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            raw = pd.DataFrame()
        else:
            engine = create_engine(db_url, pool_pre_ping=True, connect_args={"connect_timeout": 3})
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
    elif raw is None:
        raw = pd.DataFrame()

    # Determine data availability and required additional days using case-normalized date series for model states
    allowed_states = source_info.get("states")
    norm_raw = normalize_weather_dataframe(raw, allowed_states=allowed_states) if (raw is not None and not raw.empty) else pd.DataFrame()
    if allowed_states and not norm_raw.empty and "State" in norm_raw.columns:
        norm_raw_model = norm_raw[norm_raw["State"].isin(allowed_states)]
    else:
        norm_raw_model = norm_raw

    if not norm_raw_model.empty and "Date" in norm_raw_model.columns:
        date_series = norm_raw_model["Date"].dropna()
        if not date_series.empty:
            max_available_date = date_series.max()
            min_available_date = date_series.min()
        else:
            date_series = pd.Series(dtype=object)
            max_available_date = training_cutoff
            min_available_date = training_cutoff
    else:
        date_series = pd.Series(dtype=object)
        max_available_date = training_cutoff
        min_available_date = training_cutoff

    required_history_start = test_start - timedelta(days=REQUIRED_LAG_DAYS)

    if max_available_date < required_target_end:
        additional_days = (required_target_end - max_available_date).days
        total_required_coverage_days = (required_target_end - training_cutoff).days
        today_date = date.today()

        # Distinguish historical elapsed dates (which can be collected now)
        # from future dates (which are not yet observable)
        hist_elapsed_end = min(required_target_end, today_date)
        if hist_elapsed_end > training_cutoff:
            hist_elapsed_start = training_cutoff + timedelta(days=1)
            hist_elapsed_days = (hist_elapsed_end - training_cutoff).days
            hist_elapsed_range = [str(hist_elapsed_start), str(hist_elapsed_end)]
        else:
            hist_elapsed_days = 0
            hist_elapsed_range = None

        if required_target_end > today_date:
            future_unobservable_start = max(today_date + timedelta(days=1), training_cutoff + timedelta(days=1))
            future_unobservable_days = (required_target_end - max(today_date, training_cutoff)).days
            future_unobservable_range = [str(future_unobservable_start), str(required_target_end)]
        else:
            future_unobservable_days = 0
            future_unobservable_range = None

        # Eligible complete evaluation origins currently available in calendar
        # An origin t requires complete 7-day targets (t+1 through t+7 <= today_date)
        latest_complete_origin = today_date - timedelta(days=HORIZON_DAYS)
        if latest_complete_origin >= first_eligible_origin:
            eligible_origins_count = (latest_complete_origin - first_eligible_origin).days + 1
            eligible_origins_range = [str(first_eligible_origin), str(latest_complete_origin)]
        else:
            eligible_origins_count = 0
            eligible_origins_range = None

        # Assessment of preliminary evaluation feasibility:
        # Determine whether an honest preliminary evaluation can be performed using available
        # post-cutoff observations without weakening chronological separation or minimum sample requirements.
        available_post_cutoff_days = max(0, (max_available_date - training_cutoff).days)
        preliminary_feasible = False
        if available_post_cutoff_days == 0:
            origins_span = f"({eligible_origins_range[0]} to {eligible_origins_range[1]})" if eligible_origins_range else "(none)"
            preliminary_assessment = (
                f"An honest preliminary evaluation cannot be performed: zero post-cutoff observations "
                f"exist in the available dataset (dataset ends {max_available_date}, training cutoff is {training_cutoff}). "
                f"Under strict chronological separation, the first eligible origin is {first_eligible_origin}, "
                f"which requires target observations through {first_eligible_origin + timedelta(days=HORIZON_DAYS)}. "
                f"Even if all {hist_elapsed_days} elapsed calendar days through today ({today_date}) were collected, at most "
                f"{eligible_origins_count} forecast origins {origins_span} would have "
                f"complete 7-day targets. Evaluating on only {eligible_origins_count} origins violates the mandatory minimum "
                f"sample size requirement (30 forecast origins) and provides insufficient statistical power for valid inference."
            )
        else:
            preliminary_assessment = (
                f"Available post-cutoff observations ({available_post_cutoff_days} days) are insufficient to support "
                f"the mandatory 30-origin sample window without violating the 8-day embargo or chronological separation."
            )

        hist_range_str = f"({hist_elapsed_range[0]} to {hist_elapsed_range[1]})" if hist_elapsed_range else "(none)"
        future_range_str = f"({future_unobservable_range[0]} to {future_unobservable_range[1]})" if future_unobservable_range else "(none)"
        eligible_range_str = f"({eligible_origins_range[0]} to {eligible_origins_range[1]})" if eligible_origins_range else "(none)"

        result = {
            "status": "insufficient_post_cutoff_data",
            "validated_for_artifact": False,
            "artifact_name": artifact_path.name,
            "artifact_sha256": artifact_hash,
            "artifact_trained_through": str(training_cutoff),
            "embargo_days": EMBARGO_DAYS,
            "embargo_offset_days": EMBARGO_OFFSET_DAYS,
            "first_eligible_origin": str(first_eligible_origin),
            "embargo_rationale": EMBARGO_RATIONALE,
            "test_window_origins": test_window_origins,
            "test_period": [str(test_start), str(test_end)],
            "required_target_end": str(required_target_end),
            "latest_available_date": str(max_available_date),
            "required_post_cutoff_coverage_days": total_required_coverage_days,
            "required_additional_days": additional_days,
            "data_availability": {
                "current_audit_date": str(today_date),
                "latest_available_date": str(max_available_date),
                "total_required_post_cutoff_coverage_days": total_required_coverage_days,
                "historical_elapsed_days": hist_elapsed_days,
                "historical_elapsed_range": hist_elapsed_range,
                "future_unobservable_days": future_unobservable_days,
                "future_unobservable_range": future_unobservable_range,
                "eligible_complete_evaluation_origins_currently_available": eligible_origins_count,
                "eligible_complete_evaluation_origins_range": eligible_origins_range,
                "historical_elapsed_explanation": (
                    f"{hist_elapsed_days} calendar days ({hist_elapsed_range[0]} through {hist_elapsed_range[1]}) "
                    "have elapsed in the physical calendar and can be collected now via meteorological data ingestion."
                    if hist_elapsed_range else "No elapsed uncollected dates exist."
                ),
                "future_unobservable_explanation": (
                    f"{future_unobservable_days} calendar days ({future_unobservable_range[0]} through {future_unobservable_range[1]}) "
                    "lie in the physical future relative to the current audit date and cannot yet be observed or collected."
                    if future_unobservable_range else "None"
                ),
            },
            "preliminary_evaluation": {
                "feasible": preliminary_feasible,
                "available_post_cutoff_days": available_post_cutoff_days,
                "assessment": preliminary_assessment,
            },
            "sample_counts": {
                "test_origins": 0,
                "states_evaluated": 0,
                "total_eval_samples": 0,
                "total_predictions": 0,
            },
            "metrics": {},
            "data_integrity": {
                "consecutive_calendar_dates_verified": True,
                "missing_dates_excluded": True,
                "training_overlap_checked": True,
                "independent": False,
            },
            "note": (
                f"Evaluation of a {test_window_origins}-day window requires {total_required_coverage_days} calendar days "
                f"of post-cutoff data coverage (through {required_target_end}), comprising {hist_elapsed_days} historical "
                f"elapsed days {hist_range_str} and {future_unobservable_days} future "
                f"unobservable days {future_range_str}. "
                f"Currently, exactly {eligible_origins_count} eligible complete evaluation origins exist "
                f"{eligible_range_str}, which cannot satisfy the mandatory 30-origin minimum sample size."
            ),
        }
        target_output.parent.mkdir(parents=True, exist_ok=True)
        target_output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        logger.info("Evaluation logged to %s: post-cutoff coverage required (%d days: %d historical elapsed + %d future unobservable)",
                    target_output, total_required_coverage_days, hist_elapsed_days, future_unobservable_days)
        return result
    elif min_available_date > required_history_start:
        missing_history_days = (min_available_date - required_history_start).days
        result = {
            "status": "insufficient_history_data",
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
            "required_history_start": str(required_history_start),
            "earliest_available_date": str(min_available_date),
            "latest_available_date": str(max_available_date),
            "required_additional_days": missing_history_days,
            "sample_counts": {
                "test_origins": 0,
                "states_evaluated": 0,
                "total_eval_samples": 0,
                "total_predictions": 0,
            },
            "metrics": {},
            "data_integrity": {
                "consecutive_calendar_dates_verified": True,
                "missing_dates_excluded": True,
                "training_overlap_checked": True,
                "independent": False,
            },
            "note": (
                f"Sufficient historical observations preceding the test period do not exist. Evaluation of origins "
                f"starting at {test_start} requires lag history beginning at {required_history_start}, but dataset "
                f"only begins at {min_available_date}. Exactly {missing_history_days} additional preceding days are required."
            ),
        }
        target_output.parent.mkdir(parents=True, exist_ok=True)
        target_output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        logger.info("Evaluation logged to %s: insufficient history data (%d days needed)", target_output, missing_history_days)
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
            "sample_counts": {
                "test_origins": 0,
                "states_evaluated": 0,
                "total_eval_samples": 0,
                "total_predictions": 0,
            },
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

    # Baseline calculations strictly using pre-test data (before test period and before training cutoff)
    test_start_date = test_panel["Date"].min()
    baseline_cutoff = min(training_cutoff, test_start_date - timedelta(days=1))
    training_raw = norm_raw_model[norm_raw_model["Date"] <= baseline_cutoff] if (not norm_raw_model.empty and "Date" in norm_raw_model.columns) else None
    persistence, climatology = compute_baselines(test_panel, training_raw=training_raw)

    targets = {
        "LightGBM": prediction,
        "Persistence": persistence,
    }
    metrics: dict[str, Any] = {}
    for name, estimates in targets.items():
        overall = _metric_values(actual.reshape(-1), estimates.reshape(-1))
        per_horizon = _metrics_by_horizon(actual, estimates)
        metrics[name] = {
            "status": "available",
            **overall,
            "overall": overall,
            "by_horizon": per_horizon,
        }

    # Evaluate Climatology separately if available; never substitute persistence
    if climatology is not None and np.isfinite(climatology).all() and climatology.shape == actual.shape:
        clim_overall = _metric_values(actual.reshape(-1), climatology.reshape(-1))
        clim_per_horizon = _metrics_by_horizon(actual, climatology)
        metrics["Climatology"] = {
            "status": "available",
            **clim_overall,
            "overall": clim_overall,
            "by_horizon": clim_per_horizon,
        }
    else:
        metrics["Climatology"] = {
            "status": "unavailable",
            "reason": "Historical pre-cutoff climatology observations are unavailable or incomplete; persistence substitution strictly prohibited.",
            "MAE": None,
            "RMSE": None,
            "R2": None,
        }

    pers_mae = metrics["Persistence"]["MAE"]
    metrics["LightGBM"]["skill_vs_persistence"] = (
        float(1 - metrics["LightGBM"]["MAE"] / pers_mae)
        if pers_mae > 0 else 0.0
    )
    metrics["LightGBM"]["skill_vs_persistence_by_horizon"] = {
        f"day_{day}": (
            float(
                1 - metrics["LightGBM"]["by_horizon"][f"day_{day}"]["MAE"] /
                metrics["Persistence"]["by_horizon"][f"day_{day}"]["MAE"]
            )
            if metrics["Persistence"]["by_horizon"][f"day_{day}"]["MAE"] > 0 else 0.0
        )
        for day in range(1, HORIZON_DAYS + 1)
    }

    if metrics["Climatology"]["status"] == "available" and metrics["Climatology"]["MAE"] is not None and metrics["Climatology"]["MAE"] > 0:
        clim_mae = metrics["Climatology"]["MAE"]
        metrics["LightGBM"]["skill_vs_climatology"] = float(1 - metrics["LightGBM"]["MAE"] / clim_mae)
    else:
        metrics["LightGBM"]["skill_vs_climatology"] = None

    min_eval_date = test_panel["Date"].min()
    embargo_violated = (min_eval_date < first_eligible_origin)
    training_overlap = (min_eval_date <= training_cutoff)
    is_validated = (not embargo_violated) and (not training_overlap) and (mode == "independent")

    if is_validated:
        status_str = "validated"
        note_str = "Independent post-cutoff chronological evaluation completed successfully."
    elif training_overlap:
        status_str = "artifact_evaluated_training_overlap"
        note_str = (
            "The exact v3 artifact completed evaluation, but its recorded training cutoff overlaps the test window. "
            "These are diagnostic artifact scores, not independent validation."
        )
    elif embargo_violated:
        status_str = "artifact_evaluated_embargo_overlap"
        note_str = (
            f"The evaluation origins start at {min_eval_date}, violating the required 8-day embargo "
            f"following training cutoff {training_cutoff} (first eligible origin: {first_eligible_origin}). "
            f"These are diagnostic scores, not independent validation."
        )
    else:
        status_str = "diagnostic_evaluated_post_cutoff"
        note_str = (
            "The evaluation was executed in diagnostic mode over a post-cutoff embargo-compliant window. "
            "These are diagnostic scores, not independent validation."
        )

    result = {
        "status": status_str,
        "validated_for_artifact": is_validated,
        "artifact_run_completed": True,
        "artifact_name": artifact_path.name,
        "artifact_sha256": artifact_hash,
        "artifact_trained_through": str(training_cutoff),
        "embargo_days": EMBARGO_DAYS,
        "embargo_offset_days": EMBARGO_OFFSET_DAYS,
        "first_eligible_origin": str(first_eligible_origin),
        "embargo_rationale": EMBARGO_RATIONALE,
        "test_window_origins": test_window_origins,
        "test_period": [str(test_panel["Date"].min()), str(test_panel["Date"].max())],
        "target_period": [str(test_panel["Date"].min() + timedelta(days=1)), str(test_panel["Date"].max() + timedelta(days=HORIZON_DAYS))],
        "sample_counts": {
            "test_origins": int(test_panel["Date"].nunique()),
            "states_evaluated": int(test_panel["State"].nunique()),
            "total_eval_samples": int(len(test_panel)),
            "total_predictions": int(len(test_panel) * HORIZON_DAYS),
        },
        "metrics": metrics,
        "interval_status": "not_calibrated_for_current_artifact",
        "data_integrity": {
            "consecutive_calendar_dates_verified": True,
            "missing_dates_excluded": True,
            "training_overlap_checked": True,
            "independent": is_validated,
        },
        "note": note_str,
    }
    if not is_validated:
        result["diagnostic"] = True

    target_output.parent.mkdir(parents=True, exist_ok=True)
    target_output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    logger.info("Evaluation completed (status=%s, validated=%s) and saved to %s", status_str, is_validated, target_output)
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
    parser.add_argument(
        "--eval-data",
        type=Path,
        default=None,
        help="Path to external evaluation dataset CSV/Parquet file.",
    )
    parser.add_argument(
        "--database-free",
        action="store_true",
        default=False,
        help="Run without attempting any database connection.",
    )
    parser.add_argument(
        "--mode",
        choices=["independent", "diagnostic"],
        default="independent",
        help="Evaluation mode: independent (strict cutoff embargo enforcement) or diagnostic.",
    )
    parser.add_argument(
        "--custom-test-start",
        type=str,
        default=None,
        help="Custom test start date (YYYY-MM-DD).",
    )
    args = parser.parse_args()

    custom_start = date.fromisoformat(args.custom_test_start) if args.custom_test_start else None
    result = run_evaluation(
        artifact_path=args.artifact_path,
        source_model_info_path=args.source_model_info,
        output_path=args.output_path,
        test_window_origins=args.test_window,
        eval_data_path=args.eval_data,
        database_free=args.database_free,
        mode=args.mode,
        custom_test_start=custom_start,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
