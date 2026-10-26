"""
Honest Evaluation & Retraining Pipeline
=======================================
- Loads full historical weather dataset (from 2015-01-01 to latest available).
- Date-based temporal split:
    - Test period = most recent 12 months
    - an eight-day forecast-origin gap before calibration and test windows
    - a separate three-month calibration window; preprocessing is fitted on train only
- Computes MAE, RMSE, R² on test period for:
    (a) ML model (LightGBM)
    (b) Persistence (tomorrow = today's Temp_Avg)
    (c) Climatology (per state + day-of-year mean, computed on train only)
- Fits an evaluation-only model and never replaces the served model artifact.
- Saves held-out metrics and per-target predictions under results/.
"""
import os
import sys
import json
import logging
from pathlib import Path
import numpy as np
import pandas as pd
from dotenv import load_dotenv

from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.multioutput import MultiOutputRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import lightgbm as lgb
from sqlalchemy import create_engine, text

# Make app importable
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

load_dotenv("backend/.env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("train_honest_eval")

RESULTS_DIR = Path(os.environ.get("WEATHER_EVAL_OUTPUT_DIR", "results"))
MODEL_COMPARISON_PATH = RESULTS_DIR / "model_comparison.csv"

def month_to_season(month: int) -> str:
    if month in (12, 1, 2):
        return "Winter"
    if month in (3, 4, 5):
        return "Summer"
    if month in (6, 7, 8, 9):
        return "Monsoon"
    return "Post-Monsoon"

def run_honest_evaluation_and_training():
    engine = create_engine(os.environ["DATABASE_URL"])
    logger.info("Loading full weather dataset from PostgreSQL...")
    with engine.connect() as conn:
        conn.exec_driver_sql("SET TRANSACTION READ ONLY")
        df = pd.read_sql_query(text(
            "SELECT date, state, temp_max, temp_min, temp_avg, humidity, rainfall "
            "FROM weather_data WHERE state <> 'Other' ORDER BY state, date"
        ), conn)
    df.columns = ["Date", "State", "Temp_Max", "Temp_Min", "Temp_Avg", "Humidity", "Rainfall"]
    df["Date"] = pd.to_datetime(df["Date"])
    logger.info(f"Loaded {len(df)} rows across {df['State'].nunique()} states from {df['Date'].min().date()} to {df['Date'].max().date()}.")

    # Feature Engineering
    logger.info("Building lag, rolling, and cyclical features...")
    df["Month"] = df["Date"].dt.month
    df["Season"] = df["Month"].apply(month_to_season)
    df["day_of_year"] = df["Date"].dt.dayofyear

    g = df.groupby("State")
    df["lag1_temp_avg"] = g["Temp_Avg"].shift(1)
    df["lag2_temp_avg"] = g["Temp_Avg"].shift(2)
    df["lag3_temp_avg"] = g["Temp_Avg"].shift(3)
    df["lag1_temp_max"] = g["Temp_Max"].shift(1)
    df["lag1_temp_min"] = g["Temp_Min"].shift(1)
    df["lag1_humidity"] = g["Humidity"].shift(1)
    df["lag1_rainfall"] = g["Rainfall"].shift(1)
    df["lag2_humidity"] = g["Humidity"].shift(2)
    df["lag2_rainfall"] = g["Rainfall"].shift(2)
    df["temp_range"] = df["lag1_temp_max"] - df["lag1_temp_min"]
    df["roll3_temp_avg"] = g["Temp_Avg"].transform(lambda s: s.shift(1).rolling(3, min_periods=3).mean())
    df["roll7_temp_avg"] = g["Temp_Avg"].transform(lambda s: s.shift(1).rolling(7, min_periods=7).mean())
    df["rainfall_roll3"] = g["Rainfall"].transform(lambda s: s.shift(1).rolling(3, min_periods=3).sum())
    df["rainfall_roll7"] = g["Rainfall"].transform(lambda s: s.shift(1).rolling(7, min_periods=7).sum())
    df["month_sin"] = np.sin(2 * np.pi * df["Month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["Month"] / 12)
    df["day_of_year_sin"] = np.sin(2 * np.pi * df["day_of_year"] / 365)
    df["day_of_year_cos"] = np.cos(2 * np.pi * df["day_of_year"] / 365)

    for i in range(1, 8):
        df[f"target_{i}"] = g["Temp_Avg"].shift(-i)

    features_num = [
        "lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg",
        "lag1_temp_max", "lag1_temp_min", "lag1_humidity", "lag1_rainfall",
        "lag2_humidity", "lag2_rainfall", "temp_range",
        "roll3_temp_avg", "roll7_temp_avg", "rainfall_roll3", "rainfall_roll7",
        "month_sin", "month_cos", "day_of_year_sin", "day_of_year_cos"
    ]
    features_cat = ["Season", "State"]
    features = features_num + features_cat
    targets = [f"target_{i}" for i in range(1, 8)]

    # Drop incomplete rows
    df = df.dropna(subset=features + targets).reset_index(drop=True)
    logger.info(f"Usable rows after lag/target generation: {len(df)}")

    # A target is feature_date + 1..7. Therefore the previous partition's
    # last feature origin must be at least 8 calendar days before the next
    # partition's first origin, keeping every label strictly in the past.
    max_date = df["Date"].max()
    test_start = max_date - pd.DateOffset(years=1)
    calibration_start = test_start - pd.DateOffset(months=3)
    horizon = 7
    train_end = calibration_start - pd.Timedelta(days=horizon + 1)
    calibration_end = test_start - pd.Timedelta(days=horizon + 1)

    train_df = df[df["Date"] <= train_end].copy()
    calibration_df = df[
        (df["Date"] >= calibration_start) & (df["Date"] <= calibration_end)
    ].copy()
    test_df = df[df["Date"] >= test_start].copy()
    if train_df.empty or calibration_df.empty or test_df.empty:
        raise ValueError("Temporal train/calibration/test split produced an empty partition.")

    if train_df["Date"].max() + pd.Timedelta(days=horizon) >= calibration_df["Date"].min():
        raise AssertionError("Training labels reach the calibration forecast-origin window.")
    if calibration_df["Date"].max() + pd.Timedelta(days=horizon) >= test_df["Date"].min():
        raise AssertionError("Calibration labels reach the test forecast-origin window.")

    logger.info(
        "Temporal split: train through %s; calibration %s through %s; test from %s; "
        "target horizon=%d days, with labels strictly before the next origin.",
        train_end.date(), calibration_start.date(), calibration_end.date(),
        test_start.date(), horizon,
    )
    logger.info(f"Train set: {len(train_df)} rows ({train_df['Date'].min().date()} to {train_df['Date'].max().date()})")
    logger.info(f"Calibration set: {len(calibration_df)} rows ({calibration_df['Date'].min().date()} to {calibration_df['Date'].max().date()})")
    logger.info(f"Test set: {len(test_df)} rows ({test_df['Date'].min().date()} to {test_df['Date'].max().date()})")

    X_train, y_train = train_df[features], train_df[targets]
    X_cal, y_cal = calibration_df[features], calibration_df[targets]
    X_test, y_test = test_df[features], test_df[targets]

    # Preprocessing: fitted on train only!
    preprocess = ColumnTransformer([
        ("num", StandardScaler(), features_num),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), features_cat),
    ])

    pipe = Pipeline([
        ("preprocess", preprocess),
        ("model", MultiOutputRegressor(lgb.LGBMRegressor(random_state=42, n_jobs=-1, verbose=-1)))
    ])

    logger.info("Fitting LightGBM on train only...")
    pipe.fit(X_train, y_train)

    logger.info("Calibrating an empirical interval on the separate calibration window...")
    cal_pred = pipe.predict(X_cal)
    absolute_calibration_errors = np.abs(y_cal.to_numpy(dtype=float) - cal_pred).reshape(-1)
    rank = min(
        len(absolute_calibration_errors),
        int(np.ceil((len(absolute_calibration_errors) + 1) * 0.90)),
    )
    q = float(np.partition(absolute_calibration_errors, rank - 1)[rank - 1])

    logger.info("Evaluating on the untouched 12-month test set...")
    ml_pred = pipe.predict(X_test)
    test_coverage = float(np.mean(np.abs(y_test.to_numpy(dtype=float) - ml_pred) <= q))
    ml_metrics = {
        "MAE": round(float(mean_absolute_error(y_test, ml_pred)), 4),
        "RMSE": round(float(np.sqrt(mean_squared_error(y_test, ml_pred))), 4),
        "R2": round(float(r2_score(y_test, ml_pred)), 4),
    }

    # (b) Persistence baseline: tomorrow = today's Temp_Avg (lag1_temp_avg)
    persist_pred = np.column_stack([X_test["lag1_temp_avg"].values] * 7)
    persist_metrics = {
        "MAE": round(float(mean_absolute_error(y_test, persist_pred)), 4),
        "RMSE": round(float(np.sqrt(mean_squared_error(y_test, persist_pred))), 4),
        "R2": round(float(r2_score(y_test, persist_pred)), 4),
    }

    # (c) Climatology baseline: per state + day-of-year mean, computed on train only
    clim_lookup = train_df.groupby(["State", "day_of_year"])["Temp_Avg"].mean().to_dict()
    state_fallback = train_df.groupby("State")["Temp_Avg"].mean().to_dict()

    clim_preds = []
    for idx, row in test_df.iterrows():
        st = row["State"]
        row_preds = []
        for step in range(1, 8):
            target_date = row["Date"] + pd.Timedelta(days=step)
            target_doy = target_date.dayofyear
            val = clim_lookup.get((st, target_doy), state_fallback.get(st, 25.0))
            row_preds.append(val)
        clim_preds.append(row_preds)

    clim_preds = np.array(clim_preds)
    clim_metrics = {
        "MAE": round(float(mean_absolute_error(y_test, clim_preds)), 4),
        "RMSE": round(float(np.sqrt(mean_squared_error(y_test, clim_preds))), 4),
        "R2": round(float(r2_score(y_test, clim_preds)), 4),
    }

    logger.info("--- Temporal Test Set Metrics (Most Recent 12 Months) ---")
    logger.info(f"ML Model (LightGBM): MAE={ml_metrics['MAE']:.4f}, RMSE={ml_metrics['RMSE']:.4f}, R2={ml_metrics['R2']:.4f}")
    logger.info(f"Persistence:         MAE={persist_metrics['MAE']:.4f}, RMSE={persist_metrics['RMSE']:.4f}, R2={persist_metrics['R2']:.4f}")
    logger.info(f"Climatology:         MAE={clim_metrics['MAE']:.4f}, RMSE={clim_metrics['RMSE']:.4f}, R2={clim_metrics['R2']:.4f}")

    RESULTS_DIR.mkdir(exist_ok=True)
    comparison_df = pd.DataFrame([
        {"Model": "LightGBM", "MAE": ml_metrics["MAE"], "RMSE": ml_metrics["RMSE"], "R2": ml_metrics["R2"]},
        {"Model": "Persistence", "MAE": persist_metrics["MAE"], "RMSE": persist_metrics["RMSE"], "R2": persist_metrics["R2"]},
        {"Model": "Climatology", "MAE": clim_metrics["MAE"], "RMSE": clim_metrics["RMSE"], "R2": clim_metrics["R2"]},
    ]).sort_values("RMSE")
    comparison_df.to_csv(MODEL_COMPARISON_PATH, index=False)
    logger.info(f"Saved comparison table to {MODEL_COMPARISON_PATH}")

    prediction_rows = []
    for row_idx, (_, row) in enumerate(test_df.iterrows()):
        for horizon_idx in range(len(targets)):
            prediction_rows.append({
                "state": row["State"],
                "feature_date": row["Date"].date().isoformat(),
                "target_date": (row["Date"] + pd.Timedelta(days=horizon_idx + 1)).date().isoformat(),
                "horizon_days": horizon_idx + 1,
                "actual_temp_avg": float(y_test.iloc[row_idx, horizon_idx]),
                "predicted_temp_avg": float(ml_pred[row_idx, horizon_idx]),
                "temp_lo": float(ml_pred[row_idx, horizon_idx] - q),
                "temp_hi": float(ml_pred[row_idx, horizon_idx] + q),
            })

    pd.DataFrame(prediction_rows).to_csv(
        RESULTS_DIR / "heldout_predictions.csv", index=False
    )
    evaluation = {
        "evaluation_status": "temporal_holdout",
        "evaluation_scope": (
            "Evaluation-only refit of the corrected feature pipeline; does not validate "
            "the saved production model artifact."
        ),
        "model": "LightGBM MultiOutputRegressor",
        "target": "next 7 days Temp_Avg (deg C)",
        "features": features,
        "horizon_days": horizon,
        "target_units": "degrees Celsius",
        "methodology": (
            "Each row is a forecast origin with seven next-day-through-day-seven targets. "
            "Grouped state lags/rolling features use observations strictly before the origin. "
            "Train/calibration/test origins have an eight-day gap; this keeps each prior "
            "seven-day target window strictly before the next partition's first origin. "
            "Preprocessing and LightGBM are fit on train only; interval q uses calibration only. "
            "The saved serving artifact is not evaluated by this candidate refit."
        ),
        "train_sample_rows": int(len(train_df)),
        "calibration_sample_rows": int(len(calibration_df)),
        "test_sample_rows": int(len(test_df)),
        "train_target_values": int(y_train.size),
        "calibration_target_values": int(y_cal.size),
        "test_target_values": int(y_test.size),
        "train_period": [str(train_df["Date"].min().date()), str(train_end.date())],
        "calibration_period": [
            str(calibration_start.date()), str(calibration_end.date())
        ],
        "test_period": [str(test_start.date()), str(test_df["Date"].max().date())],
        "metrics": {
            "LightGBM": ml_metrics,
            "Persistence": persist_metrics,
            "Climatology": clim_metrics,
        },
        "point_prediction_metrics": "pooled over the seven forecast horizons; units are degrees Celsius",
        "interval": {
            "method": "pooled absolute calibration residual empirical radius",
            "q": q,
            "test_empirical_coverage": test_coverage,
            "nominal_coverage": 0.90,
            "distribution_free_guarantee": False,
        },
        "states": sorted(df["State"].unique().tolist()),
    }
    with open(RESULTS_DIR / "model_evaluation.json", "w", encoding="utf-8") as f:
        json.dump(evaluation, f, indent=2)
    logger.info(
        "Saved evaluation metrics and held-out predictions under %s. "
        "The production model artifact and model_info.json were not modified.",
        RESULTS_DIR.resolve(),
    )

    return {
        "ml_metrics": ml_metrics,
        "persist_metrics": persist_metrics,
        "clim_metrics": clim_metrics,
        "train_period": evaluation["train_period"],
        "calibration_period": evaluation["calibration_period"],
        "test_period": evaluation["test_period"],
        "test_sample_rows": evaluation["test_sample_rows"],
        "test_target_values": evaluation["test_target_values"],
        "interval_q": q,
        "test_empirical_coverage": test_coverage,
    }

if __name__ == "__main__":
    run_honest_evaluation_and_training()
