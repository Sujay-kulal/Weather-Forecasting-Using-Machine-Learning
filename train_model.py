"""
Weather Forecasting Using Machine Learning - Training Pipeline
==============================================================
Forecasts NEXT-DAY AVERAGE TEMPERATURE (Temp_Avg) for Indian states
using the real daily weather columns of PSP_Weather_Merged_EDA_Cleaned.csv.

Steps (kept simple for project viva):
 1. Load data, keep only weather-relevant columns
 2. Build lag features (yesterday's weather) per state - no future info used
 3. Chronological train/test split (first 80% of dates train, last 20% test)
 4. Train 4 baseline regression models + a naive persistence reference
 5. Compare with MAE, RMSE, R2  (real values, nothing fabricated)
 6. Save the best model + preprocessing pipeline + metadata for the backend API

Run:  python train_model.py
"""

import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeRegressor

RANDOM_STATE = 42
DATA_PATH = os.path.join("data", "archive_c", "PSP_Weather_Merged_EDA_Cleaned.csv")
MODEL_DIR = "model"
RESULTS_DIR = "results"

# ------------------------------------------------------------------
# 1. Load data - only the real weather columns (power columns excluded)
# ------------------------------------------------------------------
print("1. Loading data ...")
df = pd.read_csv(DATA_PATH)
df["Date"] = pd.to_datetime(df["Date"])

weather_cols = ["Date", "State", "Temp_Max", "Temp_Min", "Temp_Avg",
                "Humidity", "Rainfall", "Month", "Season"]
df = df[weather_cols].copy()

# Drop rows with missing values (only 1 incomplete date-state combination exists)
before = len(df)
df = df.dropna()
print(f"   Rows: {len(df)} (dropped {before - len(df)}), States: {df['State'].nunique()}, "
      f"Dates: {df['Date'].min().date()} -> {df['Date'].max().date()}")

# Sort chronologically so lag features are built correctly within each state
df = df.sort_values(["State", "Date"]).reset_index(drop=True)

# ------------------------------------------------------------------
# 2. Feature engineering - everything uses ONLY past days (no leakage)
# ------------------------------------------------------------------
print("2. Building features ...")
g = df.groupby("State")

# Temperature lags: what temperature was on the previous 1/2/3 days
df["lag1_temp_avg"] = g["Temp_Avg"].shift(1)
df["lag2_temp_avg"] = g["Temp_Avg"].shift(2)
df["lag3_temp_avg"] = g["Temp_Avg"].shift(3)

# Yesterday's other weather readings
df["lag1_temp_max"] = g["Temp_Max"].shift(1)
df["lag1_temp_min"] = g["Temp_Min"].shift(1)
df["lag1_humidity"] = g["Humidity"].shift(1)
df["lag1_rainfall"] = g["Rainfall"].shift(1)

# Rolling means of PAST days (shift(1) first, so today's value is never included)
df["roll3_temp_avg"] = g["Temp_Avg"].shift(1).rolling(3).mean()
df["roll7_temp_avg"] = g["Temp_Avg"].shift(1).rolling(7).mean()

# Where in the year we are (month as a cycle, so Dec(12) is close to Jan(1))
df["month_sin"] = np.sin(2 * np.pi * df["Month"] / 12)
df["month_cos"] = np.cos(2 * np.pi * df["Month"] / 12)

# TARGET: next day's average temperature (shift -1 = tomorrow)
df["target"] = g["Temp_Avg"].shift(-1)

# First ~7 days per state lack lag history, last day lacks tomorrow -> drop them
df = df.dropna(subset=["lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg",
                       "roll3_temp_avg", "roll7_temp_avg", "target"])
print(f"   Rows after building lags/target: {len(df)}")

FEATURES_NUM = ["lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg",
                "lag1_temp_max", "lag1_temp_min", "lag1_humidity", "lag1_rainfall",
                "roll3_temp_avg", "roll7_temp_avg", "month_sin", "month_cos"]
FEATURES_CAT = ["Season", "State"]
FEATURES = FEATURES_NUM + FEATURES_CAT
TARGET = "target"

# ------------------------------------------------------------------
# 3. Chronological train/test split (NO random shuffle -> no future leakage)
# ------------------------------------------------------------------
print("3. Splitting chronologically ...")
unique_dates = np.sort(df["Date"].unique())
cutoff = unique_dates[int(len(unique_dates) * 0.8)]  # first date of the test period

train = df[df["Date"] < cutoff]
test = df[df["Date"] >= cutoff]
X_train, y_train = train[FEATURES], train[TARGET]
X_test, y_test = test[FEATURES], test[TARGET]
print(f"   Train: {len(train)} rows  ({train['Date'].min().date()} -> {train['Date'].max().date()})")
print(f"   Test : {len(test)} rows  ({test['Date'].min().date()} -> {test['Date'].max().date()})")

# ------------------------------------------------------------------
# 4. Preprocessing pipeline + baseline models
# ------------------------------------------------------------------
print("4. Training models ...")
preprocess = ColumnTransformer([
    ("num", StandardScaler(), FEATURES_NUM),                       # scale numbers
    ("cat", OneHotEncoder(handle_unknown="ignore"), FEATURES_CAT), # one-hot Season/State
])

def make_pipeline(model):
    """Every model gets identical preprocessing - fair comparison."""
    return Pipeline([("preprocess", preprocess), ("model", model)])

models = {
    "Linear Regression": LinearRegression(),
    "Decision Tree": DecisionTreeRegressor(max_depth=8, random_state=RANDOM_STATE),
    "Random Forest": RandomForestRegressor(n_estimators=100, max_depth=12,
                                           random_state=RANDOM_STATE, n_jobs=-1),
    "Gradient Boosting": GradientBoostingRegressor(random_state=RANDOM_STATE),
}

results = {}
for name, model in models.items():
    pipe = make_pipeline(model)
    pipe.fit(X_train, y_train)
    pred = pipe.predict(X_test)
    results[name] = {
        "MAE": mean_absolute_error(y_test, pred),
        "RMSE": float(np.sqrt(mean_squared_error(y_test, pred))),
        "R2": r2_score(y_test, pred),
        "pipeline": pipe,
    }
    print(f"   {name:20s} MAE={results[name]['MAE']:.3f}  "
          f"RMSE={results[name]['RMSE']:.3f}  R2={results[name]['R2']:.3f}")

# Naive persistence reference: "tomorrow = today" (what ML must beat)
naive_pred = test["lag1_temp_avg"]
results["Naive (tomorrow=today)"] = {
    "MAE": mean_absolute_error(y_test, naive_pred),
    "RMSE": float(np.sqrt(mean_squared_error(y_test, naive_pred))),
    "R2": r2_score(y_test, naive_pred),
    "pipeline": None,
}
print(f"   {'Naive (tomorrow=today)':20s} MAE={results['Naive (tomorrow=today)']['MAE']:.3f}  "
      f"RMSE={results['Naive (tomorrow=today)']['RMSE']:.3f}  "
      f"R2={results['Naive (tomorrow=today)']['R2']:.3f}")

# ------------------------------------------------------------------
# 5. Select best model by lowest RMSE (main error metric)
# ------------------------------------------------------------------
trained = {k: v for k, v in results.items() if v["pipeline"] is not None}
best_name = min(trained, key=lambda k: trained[k]["RMSE"])
best = trained[best_name]
print(f"\n5. Best model: {best_name}  (RMSE={best['RMSE']:.3f}, "
      f"MAE={best['MAE']:.3f}, R2={best['R2']:.3f})")

# ------------------------------------------------------------------
# 6. Save model + metadata for the future backend API
# ------------------------------------------------------------------
print("6. Saving artifacts ...")
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

joblib.dump(best["pipeline"], os.path.join(MODEL_DIR, "weather_model.joblib"))

metadata = {
    "best_model": best_name,
    "target": "next-day Temp_Avg (deg C)",
    "features": FEATURES,
    "train_period": [str(train["Date"].min().date()), str(train["Date"].max().date())],
    "test_period": [str(test["Date"].min().date()), str(test["Date"].max().date())],
    "metrics": {k: {m: round(v[m], 4) for m in ("MAE", "RMSE", "R2")} for k, v in results.items()},
    "states": sorted(df["State"].unique().tolist()),
    "random_state": RANDOM_STATE,
}
with open(os.path.join(MODEL_DIR, "model_info.json"), "w") as f:
    json.dump(metadata, f, indent=2)

comparison = pd.DataFrame(
    [{ "Model": k, "MAE": round(v["MAE"], 3), "RMSE": round(v["RMSE"], 3), "R2": round(v["R2"], 3) }
     for k, v in results.items()]
).sort_values("RMSE")
comparison.to_csv(os.path.join(RESULTS_DIR, "model_comparison.csv"), index=False)

print(f"   Saved: {MODEL_DIR}/weather_model.joblib, {MODEL_DIR}/model_info.json, "
      f"{RESULTS_DIR}/model_comparison.csv")
print("\nDone.")
