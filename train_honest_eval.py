"""
Honest Evaluation & Retraining Pipeline
=======================================
- Loads full historical weather dataset (from 2015-01-01 to latest available).
- Date-based temporal split:
    - Test period = most recent 12 months
    - 1-day purge gap at boundary (train_end = test_start - 2 days)
    - Encoders & scalers fitted on train only.
- Computes MAE, RMSE, R² on test period for:
    (a) ML model (LightGBM)
    (b) Persistence (tomorrow = today's Temp_Avg)
    (c) Climatology (per state + day-of-year mean, computed on train only)
- Retrains model on full dataset.
- Saves versioned model to model/weather_model_v2.joblib (never overwriting old model).
- Updates model/model_info.json with all three metric rows.
"""
import os
import sys
import json
import logging
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv

from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.multioutput import MultiOutputRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import lightgbm as lgb
from sqlalchemy import create_engine

# Make app importable
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

load_dotenv("backend/.env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("train_honest_eval")

MODEL_DIR = Path("model")
RESULTS_DIR = Path("results")
NEW_MODEL_PATH = MODEL_DIR / "weather_model_v2.joblib"
MODEL_INFO_PATH = MODEL_DIR / "model_info.json"
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
    df = pd.read_sql(
        "SELECT date, state, temp_max, temp_min, temp_avg, humidity, rainfall FROM weather_data ORDER BY state, date",
        engine
    )
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
    df["roll3_temp_avg"] = g["Temp_Avg"].shift(1).rolling(3).mean()
    df["roll7_temp_avg"] = g["Temp_Avg"].shift(1).rolling(7).mean()
    df["rainfall_roll3"] = g["Rainfall"].shift(1).rolling(3).sum()
    df["rainfall_roll7"] = g["Rainfall"].shift(1).rolling(7).sum()
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

    # Date-based temporal split
    max_date = df["Date"].max()
    test_start = max_date - pd.DateOffset(years=1)
    train_end = test_start - pd.Timedelta(days=2)  # 1-day purge gap on test_start - 1 day

    logger.info(f"Temporal Split: Train <= {train_end.date()} | Purge Gap = {(test_start - pd.Timedelta(days=1)).date()} | Test >= {test_start.date()}")

    train_df = df[df["Date"] <= train_end].copy()
    test_df = df[df["Date"] >= test_start].copy()
    logger.info(f"Train set: {len(train_df)} rows ({train_df['Date'].min().date()} to {train_df['Date'].max().date()})")
    logger.info(f"Test set:  {len(test_df)} rows ({test_df['Date'].min().date()} to {test_df['Date'].max().date()})")

    X_train, y_train = train_df[features], train_df[targets]
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

    logger.info("Evaluating on held-out 12-month test set...")
    # (a) ML Model
    ml_pred = pipe.predict(X_test)
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

    logger.info("--- Honest Test Set Metrics (Most Recent 12 Months) ---")
    logger.info(f"ML Model (LightGBM): MAE={ml_metrics['MAE']:.4f}, RMSE={ml_metrics['RMSE']:.4f}, R2={ml_metrics['R2']:.4f}")
    logger.info(f"Persistence:         MAE={persist_metrics['MAE']:.4f}, RMSE={persist_metrics['RMSE']:.4f}, R2={persist_metrics['R2']:.4f}")
    logger.info(f"Climatology:         MAE={clim_metrics['MAE']:.4f}, RMSE={clim_metrics['RMSE']:.4f}, R2={clim_metrics['R2']:.4f}")

    # Retrain model on full dataset
    logger.info("Retraining final LightGBM model pipeline on full dataset (100% of data)...")
    final_preprocess = ColumnTransformer([
        ("num", StandardScaler(), features_num),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), features_cat),
    ])
    final_pipeline = Pipeline([
        ("preprocess", final_preprocess),
        ("model", MultiOutputRegressor(lgb.LGBMRegressor(random_state=42, n_jobs=-1, verbose=-1)))
    ])
    final_pipeline.fit(df[features], df[targets])

    # Save to NEW versioned file (never overwrite or delete old model)
    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump(final_pipeline, NEW_MODEL_PATH)
    logger.info(f"Saved retrained model under new versioned file: {NEW_MODEL_PATH}")

    # Update model_info.json with all three metric rows
    metadata = {
        "best_model": "LightGBM",
        "target": "next 7 days Temp_Avg (deg C)",
        "features": features,
        "train_period": [str(train_df["Date"].min().date()), str(train_df["Date"].max().date())],
        "test_period": [str(test_df["Date"].min().date()), str(test_df["Date"].max().date())],
        "metrics": {
            "LightGBM": ml_metrics,
            "Persistence": persist_metrics,
            "Climatology": clim_metrics,
        },
        "states": sorted(df["State"].unique().tolist()),
    }

    with open(MODEL_INFO_PATH, "w") as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"Updated metadata with all 3 metric rows at: {MODEL_INFO_PATH}")

    RESULTS_DIR.mkdir(exist_ok=True)
    comparison_df = pd.DataFrame([
        {"Model": "LightGBM", "MAE": ml_metrics["MAE"], "RMSE": ml_metrics["RMSE"], "R2": ml_metrics["R2"]},
        {"Model": "Persistence", "MAE": persist_metrics["MAE"], "RMSE": persist_metrics["RMSE"], "R2": persist_metrics["R2"]},
        {"Model": "Climatology", "MAE": clim_metrics["MAE"], "RMSE": clim_metrics["RMSE"], "R2": clim_metrics["R2"]},
    ]).sort_values("RMSE")
    comparison_df.to_csv(MODEL_COMPARISON_PATH, index=False)
    logger.info(f"Saved comparison table to {MODEL_COMPARISON_PATH}")

    return {
        "ml_metrics": ml_metrics,
        "persist_metrics": persist_metrics,
        "clim_metrics": clim_metrics,
        "train_period": metadata["train_period"],
        "test_period": metadata["test_period"],
    }

if __name__ == "__main__":
    run_honest_evaluation_and_training()
