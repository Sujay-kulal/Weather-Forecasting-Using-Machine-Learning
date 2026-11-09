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
from datetime import date, timedelta
from typing import Optional
import math
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


def build_features(history: list, state: str, asof_date, *, today: Optional[date] = None) -> pd.DataFrame:
    """
    history : the 7 most recent WeatherData rows STRICTLY BEFORE (D - 1),
              ordered most-recent-first -> history[0] = measurement at D-2.
    asof_date : the training-row date t = D-1 (drives month_sin/cos and Season).
    Returns a one-row DataFrame with the model's 18 feature columns.
    """
    if len(history) < REQUIRED_HISTORY:
        raise InsufficientHistoryError(
            f"Need {REQUIRED_HISTORY} historical records before {asof_date} "
            f"for '{state}', found {len(history)}."
        )

    # Normalize asof_date to datetime.date if a datetime/Timestamp was passed
    asof = asof_date.date() if hasattr(asof_date, "date") and callable(asof_date.date) else asof_date

    # Validate that records are strictly before asof_date and strictly before today
    for r in history[:REQUIRED_HISTORY]:
        r_date = getattr(r, "date", None)
        if hasattr(r_date, "date") and callable(r_date.date):
            r_date = r_date.date()
        if r_date is not None and r_date >= asof:
            raise InsufficientHistoryError(
                f"Observation date {r_date} for '{state}' is not strictly before asof {asof}."
            )
        if today is not None and r_date is not None and r_date >= today:
            raise InsufficientHistoryError(
                f"Observation date {r_date} for '{state}' cannot be on or after current date {today} (incomplete observation)."
            )

    # Check for duplicate dates
    extracted_dates = []
    for r in history[:REQUIRED_HISTORY]:
        r_date = getattr(r, "date", None)
        if hasattr(r_date, "date") and callable(r_date.date):
            r_date = r_date.date()
        extracted_dates.append(r_date)
    if len(set(extracted_dates)) != len(extracted_dates):
        raise InsufficientHistoryError(
            f"Historical observations for '{state}' contain duplicate dates."
        )

    # Sort history strictly most-recent-first
    def _extract_date(r):
        d = getattr(r, "date", asof)
        return d.date() if hasattr(d, "date") and callable(d.date) else d

    ordered_history = sorted(
        history[:REQUIRED_HISTORY],
        key=_extract_date,
        reverse=True,
    )

    # Enforce exactly 7 consecutive calendar days: D-2 down to D-8
    expected_dates = [asof - timedelta(days=i) for i in range(1, REQUIRED_HISTORY + 1)]
    for i, r in enumerate(ordered_history):
        r_date = getattr(r, "date", None)
        if hasattr(r_date, "date") and callable(r_date.date):
            r_date = r_date.date()
        if r_date != expected_dates[i]:
            raise InsufficientHistoryError(
                f"Historical observations for '{state}' must represent {REQUIRED_HISTORY} consecutive calendar days "
                f"ending at {expected_dates[0]} (D-2). Record at index {i} has date {r_date}, expected {expected_dates[i]}."
            )

    # Check for missing, NaN, or non-finite numerical measurements
    required_attrs = ("temp_avg", "temp_max", "temp_min", "humidity", "rainfall")
    for r in ordered_history:
        for attr in required_attrs:
            val = getattr(r, attr, None)
            if val is None or not math.isfinite(val):
                raise InsufficientHistoryError(
                    f"Historical observation for '{state}' on {getattr(r, 'date', 'unknown')} "
                    f"contains invalid or missing value for '{attr}'."
                )

    day_of_year = asof.timetuple().tm_yday

    features = {
        # training row t = asof_date: lag1 = temp at t-1 = ordered_history[0], etc.
        "lag1_temp_avg": ordered_history[0].temp_avg,
        "lag2_temp_avg": ordered_history[1].temp_avg,
        "lag3_temp_avg": ordered_history[2].temp_avg,
        "lag1_temp_max": ordered_history[0].temp_max,
        "lag1_temp_min": ordered_history[0].temp_min,
        "lag1_humidity": ordered_history[0].humidity,
        "lag1_rainfall": ordered_history[0].rainfall,
        "lag2_humidity": ordered_history[1].humidity,
        "lag2_rainfall": ordered_history[1].rainfall,
        "temp_range": ordered_history[0].temp_max - ordered_history[0].temp_min,
        "roll3_temp_avg": float(np.mean([r.temp_avg for r in ordered_history[:3]])),
        "roll7_temp_avg": float(np.mean([r.temp_avg for r in ordered_history[:7]])),
        "rainfall_roll3": float(np.sum([r.rainfall for r in ordered_history[:3]])),
        "rainfall_roll7": float(np.sum([r.rainfall for r in ordered_history[:7]])),
        "month_sin": float(np.sin(2 * np.pi * asof.month / 12)),
        "month_cos": float(np.cos(2 * np.pi * asof.month / 12)),
        "day_of_year_sin": float(np.sin(2 * np.pi * day_of_year / 365)),
        "day_of_year_cos": float(np.cos(2 * np.pi * day_of_year / 365)),
        "Season": month_to_season(asof.month),
        "State": state,
    }
    return pd.DataFrame([features])
