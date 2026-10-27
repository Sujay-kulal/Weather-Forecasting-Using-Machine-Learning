"""
Retrain v3 pipeline on all cleaned data through yesterday (IST).
- Excludes 'Other'
- Uses identical pipeline and hyperparameters as v2
- Saves to model/weather_model_v3.joblib (never overwriting v2)
- Updates model/model_info.json keeping v2 held-out metrics and adding trained_through
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
import lightgbm as lgb
from sqlalchemy import create_engine

backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

load_dotenv("backend/.env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("retrain_v3")

MODEL_DIR = Path("model")
V3_MODEL_PATH = MODEL_DIR / "weather_model_v3.joblib"
MODEL_INFO_PATH = MODEL_DIR / "model_info.json"

def month_to_season(month: int) -> str:
    if month in (12, 1, 2):
        return "Winter"
    if month in (3, 4, 5):
        return "Summer"
    if month in (6, 7, 8, 9):
        return "Monsoon"
    return "Post-Monsoon"

def retrain_v3():
    engine = create_engine(os.environ["DATABASE_URL"])
    logger.info("Loading cleaned weather dataset (excluding 'Other')...")
    df = pd.read_sql(
        "SELECT date, state, temp_max, temp_min, temp_avg, humidity, rainfall "
        "FROM weather_data WHERE state != 'Other' ORDER BY state, date",
        engine
    )
    df.columns = ["Date", "State", "Temp_Max", "Temp_Min", "Temp_Avg", "Humidity", "Rainfall"]
    df["Date"] = pd.to_datetime(df["Date"])
    max_date_str = str(df["Date"].max().date())
    logger.info(f"Loaded {len(df)} rows across {df['State'].nunique()} states through {max_date_str}.")

    # Feature Engineering
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

    df = df.dropna(subset=features + targets).reset_index(drop=True)
    logger.info(f"Usable training rows: {len(df)}")

    # Preprocessing & Model identical to v2
    preprocess = ColumnTransformer([
        ("num", StandardScaler(), features_num),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), features_cat),
    ])

    v3_pipeline = Pipeline([
        ("preprocess", preprocess),
        ("model", MultiOutputRegressor(lgb.LGBMRegressor(random_state=42, n_jobs=-1, verbose=-1)))
    ])

    logger.info("Fitting v3 pipeline on all data through %s...", max_date_str)
    v3_pipeline.fit(df[features], df[targets])

    # Save to weather_model_v3.joblib
    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump(v3_pipeline, V3_MODEL_PATH)
    logger.info(f"Saved weather_model_v3.joblib at: {V3_MODEL_PATH}")

    # Preserve previous scores as historical context, never as v3 scores.
    with open(MODEL_INFO_PATH) as f:
        info = json.load(f)

    if info.get("metrics"):
        info["historical_metrics"] = info["metrics"]
    info["metrics"] = {}
    info.pop("q", None)
    info.pop("coverage_90", None)
    info["metrics_status"] = "not_evaluated_for_current_artifact"
    info["interval_status"] = "not_calibrated_for_current_artifact"
    info["train_period"] = [
        str(df["Date"].min().date()),
        str(df["Date"].max().date()),
    ]
    info["test_period"] = []
    info["evaluation_note"] = (
        "This artifact has not been evaluated on a separate temporal holdout. "
        "Run train_honest_eval.py and review results before publishing performance claims."
    )
    info["trained_through"] = max_date_str
    info["states"] = sorted(df["State"].unique().tolist())
    info["model_v3_path"] = str(V3_MODEL_PATH)
    info["model_path"] = str(V3_MODEL_PATH)

    with open(MODEL_INFO_PATH, "w") as f:
        json.dump(info, f, indent=2)
    logger.info(f"Updated {MODEL_INFO_PATH} with trained_through: {max_date_str}")
    return max_date_str

if __name__ == "__main__":
    retrain_v3()
