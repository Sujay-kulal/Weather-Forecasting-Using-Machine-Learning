"""
Weather Forecasting Using Machine Learning - Training Pipeline
==============================================================
Forecasts NEXT-DAY AVERAGE TEMPERATURE (Temp_Avg) for Indian states
using the real daily weather columns of PSP_Weather_Merged_EDA_Cleaned.csv.

Steps (kept simple for project viva):
 1. Load data, keep only weather-relevant columns
 2. Build lag features (yesterday's weather, temp_range, day_of_year) per state - no future info used
 3. Use TimeSeriesSplit cross-validation to evaluate models correctly on temporal data
 4. Train baselines + Tune Random Forest/Gradient Boosting + LightGBM
 5. Evaluate models with cross-validation (MAE, RMSE, R2) and by State/Season
 6. Plot residuals to check model assumptions
 7. Save the best model + preprocessing pipeline + metadata for the backend API

Run:  python train_model.py
"""

import json
import os
import warnings

import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit, RandomizedSearchCV
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeRegressor
import lightgbm as lgb

# Suppress warnings for cleaner output
warnings.filterwarnings("ignore")

RANDOM_STATE = 42
DATA_PATH = os.path.join("data", "archive_c", "PSP_Weather_Merged_EDA_Cleaned.csv")
MODEL_DIR = "model"
RESULTS_DIR = "results"

# ------------------------------------------------------------------
# 0. Fetch dataset from Kaggle if not already present
#    (kept simple for project viva - downloads once, then cached locally)
# ------------------------------------------------------------------
print("0. Checking for dataset ...")
if not os.path.exists(DATA_PATH):
    print("   Dataset not found locally. Fetching from Kaggle ...")
    from fetch_data import download_dataset
    download_dataset()
else:
    print(f"   Dataset found at {DATA_PATH}")

# ------------------------------------------------------------------
# 1. Load data - only the real weather columns (power columns excluded)
# ------------------------------------------------------------------
print("\n1. Loading data ...")
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

# NEW FEATURES 
# Why lag2_humidity, lag2_rainfall? Provides short-term trend/momentum (is it getting wetter/drier?).
df["lag2_humidity"] = g["Humidity"].shift(2)
df["lag2_rainfall"] = g["Rainfall"].shift(2)

# Why temp_range? Captures daily temperature variation (diurnal range), which is a strong indicator of cloud cover/humidity.
df["temp_range"] = df["lag1_temp_max"] - df["lag1_temp_min"]

# Rolling means of PAST days (shift(1) first, so today's value is never included)
df["roll3_temp_avg"] = g["Temp_Avg"].shift(1).rolling(3).mean()
df["roll7_temp_avg"] = g["Temp_Avg"].shift(1).rolling(7).mean()

# Why rainfall_roll3, rainfall_roll7? Captures recent cumulative rainfall, indicating soil moisture and potential cooling effects.
df["rainfall_roll3"] = g["Rainfall"].shift(1).rolling(3).sum()
df["rainfall_roll7"] = g["Rainfall"].shift(1).rolling(7).sum()

# Where in the year we are (month as a cycle, so Dec(12) is close to Jan(1))
df["month_sin"] = np.sin(2 * np.pi * df["Month"] / 12)
df["month_cos"] = np.cos(2 * np.pi * df["Month"] / 12)

# Why day_of_year_sin/cos? Finer seasonal cycle than month. Days capture smoother transitions (e.g., end of month vs beginning).
day_of_year = df["Date"].dt.dayofyear
df["day_of_year_sin"] = np.sin(2 * np.pi * day_of_year / 365)
df["day_of_year_cos"] = np.cos(2 * np.pi * day_of_year / 365)

# TARGET: next 7 days average temperature
for i in range(1, 8):
    df[f"target_{i}"] = g["Temp_Avg"].shift(-i)

# First ~7 days per state lack lag history, last day lacks tomorrow -> drop them
df = df.dropna(subset=["lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg",
                       "roll3_temp_avg", "roll7_temp_avg",
                       "lag2_humidity", "lag2_rainfall", "rainfall_roll3", "rainfall_roll7", "temp_range"] + [f"target_{i}" for i in range(1, 8)])
print(f"   Rows after building lags/target: {len(df)}")

FEATURES_NUM = ["lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg",
                "lag1_temp_max", "lag1_temp_min", "lag1_humidity", "lag1_rainfall",
                "lag2_humidity", "lag2_rainfall", "temp_range",
                "roll3_temp_avg", "roll7_temp_avg", "rainfall_roll3", "rainfall_roll7",
                "month_sin", "month_cos", "day_of_year_sin", "day_of_year_cos"]
FEATURES_CAT = ["Season", "State"]
FEATURES = FEATURES_NUM + FEATURES_CAT
TARGETS = [f"target_{i}" for i in range(1, 8)]

# To ensure Temporal CV doesn't mix future info, we must sort the final dataset chronologically
df = df.sort_values("Date").reset_index(drop=True)
X = df[FEATURES]
y = df[TARGETS]

# ------------------------------------------------------------------
# 3. Cross-validation setup (TimeSeriesSplit)
# ------------------------------------------------------------------
print("3. Setting up TimeSeriesSplit (5 folds) ...")
tscv = TimeSeriesSplit(n_splits=5)

# ------------------------------------------------------------------
# 4. Preprocessing pipeline + Model Training & Tuning
# ------------------------------------------------------------------
print("4. Training and Tuning models ...")
preprocess = ColumnTransformer([
    ("num", StandardScaler(), FEATURES_NUM),                       # scale numbers
    ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), FEATURES_CAT), # one-hot Season/State
])

def make_pipeline(model):
    """Every model gets identical preprocessing - fair comparison."""
    return Pipeline([("preprocess", preprocess), ("model", model)])

models = {
    "Linear Regression": LinearRegression(),
    "Decision Tree": DecisionTreeRegressor(max_depth=8, random_state=RANDOM_STATE),
    "Random Forest (Default)": RandomForestRegressor(n_estimators=100, max_depth=12,
                                                     random_state=RANDOM_STATE, n_jobs=-1),
    "Gradient Boosting (Default)": MultiOutputRegressor(GradientBoostingRegressor(random_state=RANDOM_STATE)),
    "LightGBM": MultiOutputRegressor(lgb.LGBMRegressor(random_state=RANDOM_STATE, n_jobs=-1, verbose=-1))
}

# --- Hyperparameter Tuning ---
print("   -> Tuning Random Forest (this might take a few minutes) ...")
rf_param_grid = {
    "model__n_estimators": [50, 100],
    "model__max_depth": [10, 20],
    "model__min_samples_leaf": [2, 4]
}
rf_search = RandomizedSearchCV(
    make_pipeline(RandomForestRegressor(random_state=RANDOM_STATE, n_jobs=-1)),
    param_distributions=rf_param_grid,
    n_iter=2, cv=tscv, scoring="neg_mean_absolute_error",
    random_state=RANDOM_STATE, n_jobs=-1
)
rf_search.fit(X, y)
models["Random Forest (Tuned)"] = rf_search.best_estimator_
print(f"      Best RF Params: {rf_search.best_params_}")

print("   -> Tuning Gradient Boosting (this might take a few minutes) ...")
gb_param_grid = {
    "model__estimator__n_estimators": [10, 50],
    "model__estimator__max_depth": [3, 5],
    "model__estimator__learning_rate": [0.1],
    "model__estimator__subsample": [0.9]
}
gb_search = RandomizedSearchCV(
    make_pipeline(MultiOutputRegressor(GradientBoostingRegressor(random_state=RANDOM_STATE))),
    param_distributions=gb_param_grid,
    n_iter=2, cv=tscv, scoring="neg_mean_absolute_error",
    random_state=RANDOM_STATE, n_jobs=-1
)
gb_search.fit(X, y)
models["Gradient Boosting (Tuned)"] = gb_search.best_estimator_
print(f"      Best GB Params: {gb_search.best_params_}")


def evaluate_model_cv(model_pipe, X, y, tscv):
    maes, rmses, r2s = [], [], []
    for train_idx, test_idx in tscv.split(X):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
        
        model_pipe.fit(X_train, y_train)
        pred = model_pipe.predict(X_test)
        
        maes.append(mean_absolute_error(y_test, pred))
        rmses.append(np.sqrt(mean_squared_error(y_test, pred)))
        r2s.append(r2_score(y_test, pred))
        
    return {
        "MAE_mean": np.mean(maes), "MAE_std": np.std(maes),
        "RMSE_mean": np.mean(rmses), "RMSE_std": np.std(rmses),
        "R2_mean": np.mean(r2s), "R2_std": np.std(r2s),
        "pipeline": model_pipe # Trained on the last fold. Will refit best model on full data later
    }

print("\n   --- Cross-Validation Results ---")
results = {}
for name, model in models.items():
    if "Tuned" in name:
        pipe = model # It's already a pipeline from best_estimator_
    else:
        pipe = make_pipeline(model)
        
    results[name] = evaluate_model_cv(pipe, X, y, tscv)
    print(f"   {name:30s} MAE={results[name]['MAE_mean']:.3f}±{results[name]['MAE_std']:.3f}  "
          f"RMSE={results[name]['RMSE_mean']:.3f}±{results[name]['RMSE_std']:.3f}  "
          f"R2={results[name]['R2_mean']:.3f}±{results[name]['R2_std']:.3f}")

# Naive persistence reference: "tomorrow = today" (extended to 7 days)
naive_maes, naive_rmses, naive_r2s = [], [], []
for train_idx, test_idx in tscv.split(X):
    y_test = y.iloc[test_idx]
    naive_pred = np.column_stack([X.iloc[test_idx]["lag1_temp_avg"]] * 7)
    
    naive_maes.append(mean_absolute_error(y_test, naive_pred))
    naive_rmses.append(np.sqrt(mean_squared_error(y_test, naive_pred)))
    naive_r2s.append(r2_score(y_test, naive_pred))

results["Naive (tomorrow=today)"] = {
    "MAE_mean": np.mean(naive_maes), "MAE_std": np.std(naive_maes),
    "RMSE_mean": np.mean(naive_rmses), "RMSE_std": np.std(naive_rmses),
    "R2_mean": np.mean(naive_r2s), "R2_std": np.std(naive_r2s),
    "pipeline": None,
}

name = "Naive (tomorrow=today)"
print(f"   {name:30s} MAE={results[name]['MAE_mean']:.3f}±{results[name]['MAE_std']:.3f}  "
      f"RMSE={results[name]['RMSE_mean']:.3f}±{results[name]['RMSE_std']:.3f}  "
      f"R2={results[name]['R2_mean']:.3f}±{results[name]['R2_std']:.3f}")

# ------------------------------------------------------------------
# 5. Select best model by lowest CV Mean MAE
# ------------------------------------------------------------------
trained = {k: v for k, v in results.items() if v["pipeline"] is not None}
best_name = min(trained, key=lambda k: trained[k]["MAE_mean"])
best = trained[best_name]
print(f"\n5. Best model: {best_name}  (MAE={best['MAE_mean']:.3f}±{best['MAE_std']:.3f}, "
      f"RMSE={best['RMSE_mean']:.3f}±{best['RMSE_std']:.3f}, R2={best['R2_mean']:.3f}±{best['R2_std']:.3f})")

# Retrain best model on ALL data so it's ready for future deployment
best_pipeline = best["pipeline"]
print(f"   Retraining {best_name} on the entire dataset ...")
best_pipeline.fit(X, y)
final_preds = best_pipeline.predict(X)

# --- Breakdown by State and Season (using full data predictions for simplicity of breakdown) ---
df_eval = df.copy()
abs_errors = []
for i in range(1, 8):
    df_eval[f"Predicted_{i}"] = final_preds[:, i-1]
    df_eval[f"Residual_{i}"] = df_eval[f"target_{i}"] - df_eval[f"Predicted_{i}"]
    abs_errors.append(df_eval[f"Residual_{i}"].abs())

df_eval["AbsError"] = pd.concat(abs_errors, axis=1).mean(axis=1)

state_mae = df_eval.groupby("State")["AbsError"].mean().sort_values(ascending=False)
season_mae = df_eval.groupby("Season")["AbsError"].mean().sort_values(ascending=False)

print("\n   --- MAE Breakdown by State (Top 5 Worst) ---")
for state, mae in state_mae.head(5).items():
    print(f"      {state}: {mae:.3f}")

print("\n   --- MAE Breakdown by Season ---")
for season, mae in season_mae.items():
    print(f"      {season}: {mae:.3f}")

# --- Plot Residuals (for Day 1) ---
print("\n   Plotting Residuals (Day 1) ...")
os.makedirs(RESULTS_DIR, exist_ok=True)

fig, axes = plt.subplots(1, 2, figsize=(15, 6))

# Predicted vs Actual (Day 1)
axes[0].scatter(df_eval["Predicted_1"], df_eval["target_1"], alpha=0.3, color="blue")
axes[0].plot([df_eval["target_1"].min(), df_eval["target_1"].max()], 
             [df_eval["target_1"].min(), df_eval["target_1"].max()], 'r--', lw=2)
axes[0].set_xlabel("Predicted Next-Day Temp_Avg (Day 1)")
axes[0].set_ylabel("Actual Next-Day Temp_Avg (Day 1)")
axes[0].set_title(f"Predicted vs Actual (Day 1 - {best_name})")

# Residuals vs Season (Day 1)
seasons = df_eval["Season"].unique()
season_data = [df_eval[df_eval["Season"] == s]["Residual_1"].dropna() for s in seasons]
axes[1].boxplot(season_data)
axes[1].set_xticks(range(1, len(seasons) + 1))
axes[1].set_xticklabels(seasons)
axes[1].set_xlabel("Season")
axes[1].set_ylabel("Residual (Actual - Predicted) (Day 1)")
axes[1].set_title(f"Residuals by Season (Day 1 - {best_name})")
axes[1].axhline(0, color='r', linestyle='--', lw=2)

plt.tight_layout()
plt.savefig(os.path.join(RESULTS_DIR, "residual_plots.png"))
plt.close()
print(f"   Residual plots saved to {RESULTS_DIR}/residual_plots.png")

# ------------------------------------------------------------------
# 6. Save model + metadata for the future backend API
# ------------------------------------------------------------------
print("\n6. Saving artifacts ...")
os.makedirs(MODEL_DIR, exist_ok=True)

joblib.dump(best_pipeline, os.path.join(MODEL_DIR, "weather_model.joblib"))

metadata = {
    "best_model": best_name,
    "target": "next 7 days Temp_Avg (deg C)",
    "features": FEATURES,
    "train_period": [str(df["Date"].min().date()), str(df["Date"].max().date())],
    "test_period": ["N/A (TimeSeriesSplit CV used)"],
    "metrics": {
        k: {
            "MAE_mean": round(v["MAE_mean"], 4), "MAE_std": round(v["MAE_std"], 4),
            "RMSE_mean": round(v["RMSE_mean"], 4), "RMSE_std": round(v["RMSE_std"], 4),
            "R2_mean": round(v["R2_mean"], 4), "R2_std": round(v["R2_std"], 4)
        } for k, v in results.items()
    },
    "states": sorted(df["State"].unique().tolist()),
    "random_state": RANDOM_STATE,
}

with open(os.path.join(MODEL_DIR, "model_info.json"), "w") as f:
    json.dump(metadata, f, indent=2)

comparison = pd.DataFrame(
    [{ "Model": k, 
       "CV_Mean_MAE": round(v["MAE_mean"], 3), "CV_Std_MAE": round(v["MAE_std"], 3),
       "CV_Mean_RMSE": round(v["RMSE_mean"], 3), "CV_Std_RMSE": round(v["RMSE_std"], 3),
       "CV_Mean_R2": round(v["R2_mean"], 3) }
     for k, v in results.items()]
).sort_values("CV_Mean_MAE")
comparison.to_csv(os.path.join(RESULTS_DIR, "model_comparison.csv"), index=False)

print(f"   Saved: {MODEL_DIR}/weather_model.joblib, {MODEL_DIR}/model_info.json, "
      f"{RESULTS_DIR}/model_comparison.csv")
print("\nDone.")
