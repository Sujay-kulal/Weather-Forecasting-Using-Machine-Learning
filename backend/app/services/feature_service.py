"""
Feature engineering service - reproduces train_model.py EXACTLY.

Stage A contract, refined by the consistency test against the training code:
 - In training, the feature row for date t carries
     lag1 = Temp_Avg at t-1  (groupby(State).shift(1)),
     lag2 = Temp_Avg at t-2, lag3 = Temp_Avg at t-3,
     roll3/roll7 = mean over the 3/7 records ENDING at t-1 (shift(1).rolling),
     month_sin/cos + Season = month of t,
   and its TARGET is Temp_Avg at t+1 (shift(-1)).
 - Therefore, to forecast date D we rebuild the training row t = D-1:
     lag/roll features come from the 7 records STRICTLY BEFORE D-1
     (i.e. measurements at D-2 ... D-8),
     month/Season come from the calendar date D-1 (no measurement needed).
 - No information from date D or later is ever used -> no leakage.
"""
import numpy as np
import pandas as pd

REQUIRED_HISTORY = 7  # roll7 needs 7 records ending at D-2
MAX_STALENESS_DAYS = 2  # allow small gaps (training panel had one 1-day gap)


def month_to_season(month: int) -> str:
    """Indian meteorological seasons - mapping verified against the dataset itself."""
    if month in (12, 1, 2):
        return "Winter"
    if month in (3, 4, 5):
        return "Summer"
    if month in (6, 7, 8, 9):
        return "Monsoon"
    return "Post-Monsoon"  # October / November


class InsufficientHistoryError(Exception):
    """Not enough (or not recent enough) history to build the 13 model features."""


def build_features(history: list, state: str, asof_date) -> pd.DataFrame:
    """
    history : the 7 most recent WeatherData rows STRICTLY BEFORE (D - 1),
              ordered most-recent-first -> history[0] = measurement at D-2.
    asof_date : the training-row date t = D-1 (drives month_sin/cos and Season).
    Returns a one-row DataFrame with the model's 13 feature columns.
    """
    if len(history) < REQUIRED_HISTORY:
        raise InsufficientHistoryError(
            f"Need {REQUIRED_HISTORY} historical records before {asof_date} "
            f"for '{state}', found {len(history)}."
        )

    features = {
        # training row t = asof_date: lag1 = temp at t-1 = history[0], etc.
        "lag1_temp_avg": history[0].temp_avg,
        "lag2_temp_avg": history[1].temp_avg,
        "lag3_temp_avg": history[2].temp_avg,
        "lag1_temp_max": history[0].temp_max,
        "lag1_temp_min": history[0].temp_min,
        "lag1_humidity": history[0].humidity,
        "lag1_rainfall": history[0].rainfall,
        "roll3_temp_avg": float(np.mean([r.temp_avg for r in history[:3]])),
        "roll7_temp_avg": float(np.mean([r.temp_avg for r in history[:7]])),
        "month_sin": float(np.sin(2 * np.pi * asof_date.month / 12)),
        "month_cos": float(np.cos(2 * np.pi * asof_date.month / 12)),
        "Season": month_to_season(asof_date.month),
        "State": state,
    }
    return pd.DataFrame([features])
