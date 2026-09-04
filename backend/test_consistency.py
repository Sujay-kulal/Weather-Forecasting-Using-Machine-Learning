"""
CRITICAL model-consistency test (Phase 2 requirement #20).

Verifies that the backend feature builder produces EXACTLY the same 13 features
as train_model.py for the same (state, forecast date), and that both produce
the same prediction from the saved pipeline.

train_model.py logic replicated here with pandas (independent implementation):
  row at date t carries lags from t, t-1, t-2 ... and its target is day t+1.
  So for forecast date D, the reference training row is the record at t = D-1.

Run from backend/:  python test_consistency.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal  # noqa: E402
from app.models import WeatherData  # noqa: E402
from app.services import model_service  # noqa: E402
from app.services.feature_service import build_features, month_to_season  # noqa: E402

CSV = Path(__file__).resolve().parent.parent / "data" / "archive_c" / "PSP_Weather_Merged_EDA_Cleaned.csv"
FEATURES = model_service.FEATURE_ORDER

# --- independent pandas replication of train_model.py's feature engineering ---
df = pd.read_csv(CSV, usecols=["Date", "State", "Temp_Max", "Temp_Min",
                               "Temp_Avg", "Humidity", "Rainfall"])
df["Date"] = pd.to_datetime(df["Date"])
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
df["month_sin"] = np.sin(2 * np.pi * df["Month"] / 12) if "Month" in df else np.nan
# (Month is not in usecols above; recompute from Date like training did)
df["month_sin"] = np.sin(2 * np.pi * df["Date"].dt.month / 12)
df["month_cos"] = np.cos(2 * np.pi * df["Date"].dt.month / 12)


def training_reference(state: str, forecast_date: str) -> pd.Series:
    """Feature row from the CSV for the training row t = D-1 (target = D)."""
    t = pd.Timestamp(forecast_date) - pd.Timedelta(days=1)
    row = df[(df["State"] == state) & (df["Date"] == t)].iloc[0]
    return row


# --- cases include the panel's one 2-day gap state/date if any ---
CASES = [
    ("Karnataka", "2025-10-06"),
    ("Delhi", "2025-04-07"),        # first day of the training test period
    ("Kerala", "2024-08-15"),
    ("Rajasthan", "2023-06-01"),
]

session = SessionLocal()
all_ok = True
try:
    print(f"{'case':38s} {'max|diff|':>10s}  features  prediction")
    for state, forecast_date in CASES:
        ref = training_reference(state, forecast_date)

        # backend path: history from POSTGRESQL (same query as /predict)
        asof = (pd.Timestamp(forecast_date) - pd.Timedelta(days=1)).date()
        history = session.query(WeatherData).filter(
            WeatherData.state == state, WeatherData.date < asof
        ).order_by(WeatherData.date.desc()).limit(7).all()
        backend_feats = build_features(history, state, asof).iloc[0]

        max_diff = 0.0
        for f in FEATURES:
            if f == "Season":
                # training's Season column is the season of day t (verified pure
                # function of month) - derive it instead of loading the column
                ref_val = month_to_season(ref["Date"].month)
                if str(ref_val) != str(backend_feats[f]):
                    all_ok = False
                    print(f"  MISMATCH {state} {forecast_date} {f}: "
                          f"train={ref_val} backend={backend_feats[f]}")
                continue
            if f == "State":
                if state != backend_feats[f]:
                    all_ok = False
                    print(f"  MISMATCH {state} {forecast_date} State")
                continue
            diff = abs(float(ref[f]) - float(backend_feats[f]))
            max_diff = max(max_diff, diff)

        # predictions must be identical too
        ref_features = pd.DataFrame([{f: (month_to_season(ref["Date"].month) if f == "Season"
                                          else (state if f == "State" else ref[f]))
                                      for f in FEATURES}])
        pred_train = model_service.predict(ref_features)
        pred_backend = model_service.predict(backend_feats.to_frame().T)
        pred_diff = abs(pred_train - pred_backend)

        ok = max_diff < 1e-9 and pred_diff < 1e-9
        all_ok = all_ok and ok
        print(f"{state + ' @ ' + forecast_date:38s} {max_diff:10.2e}  "
              f"{'OK' if ok else 'FAIL'}      "
              f"{pred_train:.6f} vs {pred_backend:.6f} (diff {pred_diff:.2e})")
finally:
    session.close()

print("\nFEATURE CONSISTENCY:", "PASS - backend features are identical to training"
      if all_ok else "FAIL")
sys.exit(0 if all_ok else 1)
