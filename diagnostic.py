import pandas as pd
import numpy as np
import os
from sklearn.model_selection import TimeSeriesSplit
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import GradientBoostingRegressor
import lightgbm as lgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import warnings
warnings.filterwarnings("ignore")

DATA_PATH = os.path.join("data", "archive_c", "PSP_Weather_Merged_EDA_Cleaned.csv")
df = pd.read_csv(DATA_PATH)
df["Date"] = pd.to_datetime(df["Date"])
weather_cols = ["Date", "State", "Temp_Max", "Temp_Min", "Temp_Avg", "Humidity", "Rainfall", "Month", "Season"]
df = df[weather_cols].copy().dropna()
df = df.sort_values(["State", "Date"]).reset_index(drop=True)

g = df.groupby("State")
df["lag1_temp_avg"] = g["Temp_Avg"].shift(1)
df["lag2_temp_avg"] = g["Temp_Avg"].shift(2)
df["lag3_temp_avg"] = g["Temp_Avg"].shift(3)
df["lag1_temp_max"] = g["Temp_Max"].shift(1)
df["lag1_temp_min"] = g["Temp_Min"].shift(1)
df["lag1_humidity"] = g["Humidity"].shift(1)
df["lag1_rainfall"] = g["Rainfall"].shift(1)
df["roll3_temp_avg"] = g["Temp_Avg"].shift(1).rolling(3).mean()
df["roll7_temp_avg"] = g["Temp_Avg"].shift(1).rolling(7).mean()
df["month_sin"] = np.sin(2 * np.pi * df["Month"] / 12)
df["month_cos"] = np.cos(2 * np.pi * df["Month"] / 12)

# New features
df["lag2_humidity"] = g["Humidity"].shift(2)
df["lag2_rainfall"] = g["Rainfall"].shift(2)
df["temp_range"] = df["lag1_temp_max"] - df["lag1_temp_min"]
df["rainfall_roll3"] = g["Rainfall"].shift(1).rolling(3).sum()
df["rainfall_roll7"] = g["Rainfall"].shift(1).rolling(7).sum()
day_of_year = df["Date"].dt.dayofyear
df["day_of_year_sin"] = np.sin(2 * np.pi * day_of_year / 365)
df["day_of_year_cos"] = np.cos(2 * np.pi * day_of_year / 365)

df["target"] = g["Temp_Avg"].shift(-1)
df = df.dropna().sort_values("Date").reset_index(drop=True)

FEATURES_OLD_NUM = ["lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg", "lag1_temp_max", "lag1_temp_min", "lag1_humidity", "lag1_rainfall", "roll3_temp_avg", "roll7_temp_avg", "month_sin", "month_cos"]
FEATURES_CAT = ["Season", "State"]
FEATURES_OLD = FEATURES_OLD_NUM + FEATURES_CAT

FEATURES_NEW_NUM = FEATURES_OLD_NUM + ["lag2_humidity", "lag2_rainfall", "temp_range", "rainfall_roll3", "rainfall_roll7", "day_of_year_sin", "day_of_year_cos"]
FEATURES_NEW = FEATURES_NEW_NUM + FEATURES_CAT

tscv = TimeSeriesSplit(n_splits=5)

print("\n--- 1. APPLES-TO-APPLES BASELINE ---")
def eval_model(model, features_num, features, X_data, y_data):
    maes, rmses, r2s = [], [], []
    fold_maes = []
    
    preprocess = ColumnTransformer([
        ("num", StandardScaler(), features_num),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), FEATURES_CAT)
    ])
    pipe = Pipeline([("preprocess", preprocess), ("model", model)])
    
    for train_idx, test_idx in tscv.split(X_data):
        X_train, X_test = X_data.iloc[train_idx], X_data.iloc[test_idx]
        y_train, y_test = y_data.iloc[train_idx], y_data.iloc[test_idx]
        pipe.fit(X_train[features], y_train)
        pred = pipe.predict(X_test[features])
        mae = mean_absolute_error(y_test, pred)
        maes.append(mae)
        fold_maes.append(mae)
        rmses.append(np.sqrt(mean_squared_error(y_test, pred)))
        r2s.append(r2_score(y_test, pred))
    return {"MAE_m": np.mean(maes), "MAE_s": np.std(maes), "RMSE_m": np.mean(rmses), "R2_m": np.mean(r2s), "fold_maes": fold_maes, "pipe": pipe}

X = df
y = df["target"]

old_gb = GradientBoostingRegressor(random_state=42)
lgbm = lgb.LGBMRegressor(random_state=42, n_jobs=-1, verbose=-1)

res_old_gb = eval_model(old_gb, FEATURES_OLD_NUM, FEATURES_OLD, X, y)
res_lgbm = eval_model(lgbm, FEATURES_NEW_NUM, FEATURES_NEW, X, y)

naive_maes = []
fold_info = []
for fold_idx, (train_idx, test_idx) in enumerate(tscv.split(X)):
    y_test = y.iloc[test_idx]
    pred = X.iloc[test_idx]["lag1_temp_avg"]
    mae = mean_absolute_error(y_test, pred)
    naive_maes.append(mae)
    fold_info.append({"train": len(train_idx), "test": len(test_idx)})

res_naive = {"MAE_m": np.mean(naive_maes), "MAE_s": np.std(naive_maes), "fold_maes": naive_maes}

print(f"{'Model':<30} | {'MAE':<15} | {'RMSE':<8} | {'R2':<8}")
print("-" * 65)
print(f"{'Old GB (13 feat, Untuned)':<30} | {res_old_gb['MAE_m']:.3f} ± {res_old_gb['MAE_s']:.3f} | {res_old_gb['RMSE_m']:.3f}    | {res_old_gb['R2_m']:.3f}")
print(f"{'New LightGBM (18 feat)':<30} | {res_lgbm['MAE_m']:.3f} ± {res_lgbm['MAE_s']:.3f} | {res_lgbm['RMSE_m']:.3f}    | {res_lgbm['R2_m']:.3f}")
print(f"{'Naive Baseline':<30} | {res_naive['MAE_m']:.3f} ± {res_naive['MAE_s']:.3f} | N/A      | N/A")

print("\n--- 2. PER-FOLD BREAKDOWN ---")
print(f"{'Fold':<5} | {'Train Rows':<10} | {'Test Rows':<10} | {'Naive MAE':<10} | {'Old GB MAE':<10} | {'LGBM MAE':<10}")
print("-" * 75)
for i in range(5):
    print(f"{i+1:<5} | {fold_info[i]['train']:<10} | {fold_info[i]['test']:<10} | {res_naive['fold_maes'][i]:<10.3f} | {res_old_gb['fold_maes'][i]:<10.3f} | {res_lgbm['fold_maes'][i]:<10.3f}")

print("\n--- 3. FEATURE IMPORTANCE CHECK (LightGBM on full data) ---")
lgbm_pipe = res_lgbm['pipe']
lgbm_pipe.fit(X[FEATURES_NEW], y)
cat_encoder = lgbm_pipe.named_steps['preprocess'].named_transformers_['cat']
cat_features = cat_encoder.get_feature_names_out(FEATURES_CAT)
all_feature_names = FEATURES_NEW_NUM + list(cat_features)
importances = lgbm_pipe.named_steps['model'].feature_importances_

feat_imp = pd.DataFrame({'Feature': all_feature_names, 'Importance': importances})
feat_imp = feat_imp.sort_values(by='Importance', ascending=False).reset_index(drop=True)
print(feat_imp.to_string())

new_features_list = ["lag2_humidity", "lag2_rainfall", "temp_range", "rainfall_roll3", "rainfall_roll7", "day_of_year_sin", "day_of_year_cos"]
bottom_half_idx = len(feat_imp) // 2

print("\n[Flags for New Features]")
for nf in new_features_list:
    rank = feat_imp.index[feat_imp['Feature'] == nf].tolist()[0]
    imp_val = feat_imp.loc[rank, 'Importance']
    if rank >= bottom_half_idx:
        print(f"FLAG: '{nf}' is in the BOTTOM half (Rank {rank+1}/{len(feat_imp)}, Importance: {imp_val})")
    else:
        print(f"OK: '{nf}' is in the TOP half (Rank {rank+1}/{len(feat_imp)}, Importance: {imp_val})")

print("\n--- 4. HYPERPARAMETER SANITY CHECK ---")
rf_params = {'model__n_estimators': 200, 'model__min_samples_leaf': 4, 'model__max_depth': 15}
gb_params = {'model__subsample': 1.0, 'model__n_estimators': 300, 'model__max_depth': 3, 'model__learning_rate': 0.1}

print("Best RF Params: ", rf_params)
print("Search space was: n_estimators=[100, 200, 300], max_depth=[10, 15, 20, None], min_samples_leaf=[1, 2, 4]")
if rf_params['model__min_samples_leaf'] == 4:
    print("-> EDGE HIT: min_samples_leaf hit the MAX value tested (4). Could be underfitting / needing higher leaf size.")

print("\nBest GB Params: ", gb_params)
print("Search space was: n_estimators=[100, 200, 300], max_depth=[3, 5, 7], learning_rate=[0.01, 0.05, 0.1, 0.2], subsample=[0.8, 0.9, 1.0]")
if gb_params['model__n_estimators'] == 300:
    print("-> EDGE HIT: n_estimators hit the MAX value tested (300). Could need more trees.")
if gb_params['model__max_depth'] == 3:
    print("-> EDGE HIT: max_depth hit the MIN value tested (3). Trees might be too deep even at 3.")
if gb_params['model__subsample'] == 1.0:
    print("-> EDGE HIT: subsample hit the MAX value tested (1.0). Disabling subsampling was preferred.")
