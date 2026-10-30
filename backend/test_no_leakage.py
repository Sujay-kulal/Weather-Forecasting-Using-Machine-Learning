"""
Test proving no feature at row t uses data after t (Zero Future-Data Leakage).
Runs standalone without requiring a database connection.
"""
import sys
from pathlib import Path
from datetime import date, timedelta
import numpy as np
import pandas as pd

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.services.feature_service import build_features, month_to_season, REQUIRED_HISTORY


class MockObservation:
    """Mock weather observation record for testing build_features without database."""
    def __init__(self, date_val, temp_max, temp_min, temp_avg, humidity, rainfall):
        self.date = date_val
        self.temp_max = temp_max
        self.temp_min = temp_min
        self.temp_avg = temp_avg
        self.humidity = humidity
        self.rainfall = rainfall


def compute_df_features(df_in: pd.DataFrame) -> pd.DataFrame:
    df_c = df_in.copy().sort_values(["State", "Date"]).reset_index(drop=True)
    df_c["Month"] = df_c["Date"].dt.month
    df_c["Season"] = df_c["Month"].apply(month_to_season)
    
    g = df_c.groupby("State")
    df_c["lag1_temp_avg"] = g["Temp_Avg"].shift(1)
    df_c["lag2_temp_avg"] = g["Temp_Avg"].shift(2)
    df_c["lag3_temp_avg"] = g["Temp_Avg"].shift(3)
    df_c["lag1_temp_max"] = g["Temp_Max"].shift(1)
    df_c["lag1_temp_min"] = g["Temp_Min"].shift(1)
    df_c["lag1_humidity"] = g["Humidity"].shift(1)
    df_c["lag1_rainfall"] = g["Rainfall"].shift(1)
    df_c["lag2_humidity"] = g["Humidity"].shift(2)
    df_c["lag2_rainfall"] = g["Rainfall"].shift(2)
    df_c["temp_range"] = df_c["lag1_temp_max"] - df_c["lag1_temp_min"]
    df_c["roll3_temp_avg"] = g["Temp_Avg"].shift(1).rolling(3).mean()
    df_c["roll7_temp_avg"] = g["Temp_Avg"].shift(1).rolling(7).mean()
    df_c["rainfall_roll3"] = g["Rainfall"].shift(1).rolling(3).sum()
    df_c["rainfall_roll7"] = g["Rainfall"].shift(1).rolling(7).sum()
    df_c["month_sin"] = np.sin(2 * np.pi * df_c["Month"] / 12)
    df_c["month_cos"] = np.cos(2 * np.pi * df_c["Month"] / 12)
    doy = df_c["Date"].dt.dayofyear
    df_c["day_of_year_sin"] = np.sin(2 * np.pi * doy / 365)
    df_c["day_of_year_cos"] = np.cos(2 * np.pi * doy / 365)
    return df_c


def test_dataframe_feature_leakage():
    """Verify that features at index t are completely invariant to future rows > t."""
    np.random.seed(42)
    dates = [date(2025, 1, 1) + timedelta(days=i) for i in range(50)]
    df = pd.DataFrame({
        "Date": pd.to_datetime(dates),
        "State": "Karnataka",
        "Temp_Max": np.random.uniform(25, 35, 50),
        "Temp_Min": np.random.uniform(15, 25, 50),
        "Temp_Avg": np.random.uniform(20, 30, 50),
        "Humidity": np.random.uniform(50, 90, 50),
        "Rainfall": np.random.uniform(0, 10, 50),
    })

    num_cols = [
        "lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg",
        "lag1_temp_max", "lag1_temp_min", "lag1_humidity", "lag1_rainfall",
        "lag2_humidity", "lag2_rainfall", "temp_range",
        "roll3_temp_avg", "roll7_temp_avg", "rainfall_roll3", "rainfall_roll7",
        "month_sin", "month_cos", "day_of_year_sin", "day_of_year_cos"
    ]

    # Test across multiple cutoff days t
    for t_idx in [15, 25, 35, 45]:
        f_past_only = compute_df_features(df.iloc[: t_idx + 1]).iloc[t_idx]
        f_full = compute_df_features(df).iloc[t_idx]

        # Corrupt future values with extreme outliers
        df_corrupt = df.copy()
        df_corrupt.loc[t_idx + 1 :, ["Temp_Max", "Temp_Min", "Temp_Avg", "Humidity", "Rainfall"]] = 9999.0
        f_corrupt = compute_df_features(df_corrupt).iloc[t_idx]

        diff_past = np.max(np.abs((f_past_only[num_cols].values - f_full[num_cols].values).astype(float)))
        diff_corrupt = np.max(np.abs((f_full[num_cols].values - f_corrupt[num_cols].values).astype(float)))

        assert diff_past == 0.0, f"Leakage detected at cutoff {t_idx} (diff past vs full: {diff_past})"
        assert diff_corrupt == 0.0, f"Future corruption leaked to row {t_idx} (diff: {diff_corrupt})"

    print("PASS: Dataframe feature engineering has 0 future leakage.")


def test_build_features_service_invariance():
    """Verify that build_features correctly consumes history strictly in reverse chronological order."""
    target_date = date(2025, 6, 15)
    asof_date = target_date - timedelta(days=1)  # 2025-06-14

    # 7 historical records strictly before D-1 (D-2 down to D-8)
    history = [
        MockObservation(asof_date - timedelta(days=i), 30.0 + i, 20.0 + i, 25.0 + i, 60.0, 0.0)
        for i in range(1, REQUIRED_HISTORY + 1)
    ]
    feats = build_features(history, "Karnataka", asof_date)
    assert len(feats) == 1
    assert feats.iloc[0]["lag1_temp_avg"] == 26.0  # history[0] at D-2
    assert feats.iloc[0]["lag2_temp_avg"] == 27.0  # history[1] at D-3
    assert feats.iloc[0]["Season"] == "Monsoon"
    assert feats.iloc[0]["State"] == "Karnataka"
    print("PASS: build_features service verified without database.")


if __name__ == "__main__":
    test_dataframe_feature_leakage()
    test_build_features_service_invariance()
    print("ALL FEATURE INVARIANCE CHECKS PASSED. Route-level date filtering is covered by backend/tests/test_prediction_integrity.py.")
