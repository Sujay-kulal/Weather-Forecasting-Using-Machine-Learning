"""Past-only rainfall inputs and inference with a checked native LightGBM bundle."""
from __future__ import annotations

import gzip
import hashlib
import json
import math
from datetime import timedelta
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

import lightgbm as lgb
import numpy as np
import pandas as pd

MODEL_DIR = Path(__file__).resolve().parents[3] / "model"
ARTIFACT = "rainfall_v1.json.gz"
METADATA = "rainfall_v1_info.json"
RAIN_THRESHOLD = 0.1
MEASUREMENTS = ["rainfall", "humidity", "temp_avg", "temp_max", "temp_min"]
FEATURES = [
    "rain_lag1", "rain_lag2", "rain_lag3", "rain_lag7", "rain_sum3", "rain_sum7",
    "wet_count7", "dry_streak7", "humidity_lag1", "humidity_lag2", "temp_avg_lag1",
    "temp_range_lag1", "day_sin", "day_cos", "state_code",
]
TARGETS = [f"rainfall_day_{i}" for i in range(1, 8)]


class RainfallBundle(NamedTuple):
    models: list[dict]
    states: list[str]
    publish_probability: list[bool]
    amount_released: bool


def valid_observation(row):
    values = [getattr(row, name, None) for name in MEASUREMENTS]
    return (all(v is not None and math.isfinite(v) for v in values)
            and row.rainfall >= 0 and 0 <= row.humidity <= 100
            and -90 <= row.temp_min <= row.temp_avg <= row.temp_max <= 65)


def feature_values(history, state, origin, states):
    """Origin = D-1. Require one genuine statewide observation on each prior day."""
    if len(history) != 7 or state not in states:
        raise ValueError("Seven prior statewide observations and a supported state are required.")
    rows = sorted(history, key=lambda row: row.date, reverse=True)
    for lag, row in enumerate(rows, 1):
        if (row.date != origin - timedelta(days=lag) or row.state != state
                or getattr(row, "district", "") or getattr(row, "location", "")
                or not valid_observation(row)):
            raise ValueError("Invalid or incomplete statewide rainfall history.")
    rain = [row.rainfall for row in rows]
    dry_streak = next((i for i, value in enumerate(rain) if value > RAIN_THRESHOLD), 7)
    phase = 2 * math.pi * (origin.timetuple().tm_yday - 1) / 365.25
    return [rain[0], rain[1], rain[2], rain[6], sum(rain[:3]), sum(rain),
            sum(r > RAIN_THRESHOLD for r in rain), dry_streak, rows[0].humidity,
            rows[1].humidity, rows[0].temp_avg, rows[0].temp_max - rows[0].temp_min,
            math.sin(phase), math.cos(phase), states.index(state)]


def calibrated_probability(raw, calibration):
    return np.interp(raw, calibration["x"], calibration["y"])


def infer(models, features):
    """Run the same frozen predictors for independent evaluation and API serving."""
    amounts, probabilities = [], []
    for horizon in models:
        raw = horizon["occurrence"].predict(features, num_threads=1)
        probability = calibrated_probability(raw, horizon["calibration"])
        amount = horizon["amount"].predict(features, num_threads=1)
        if horizon["architecture"] == "two_stage":
            amount = probability * amount + (1 - probability) * horizon["trace_mean"]
        amounts.append(amount)
        probabilities.append(probability)
    amounts, probabilities = np.column_stack(amounts), np.column_stack(probabilities)
    if (amounts.shape != (len(features), 7) or probabilities.shape != amounts.shape or not np.isfinite(amounts).all()
            or (amounts < 0).any() or not np.isfinite(probabilities).all()
            or ((probabilities < 0) | (probabilities > 1)).any()):
        raise ValueError("Invalid rainfall predictions.")
    return amounts, probabilities


def read_bundle(directory):
    metadata = json.loads((directory / METADATA).read_text(encoding="utf-8"))
    payload = (directory / ARTIFACT).read_bytes()
    if hashlib.sha256(payload).hexdigest() != metadata["sha256"]:
        raise ValueError("Rainfall artifact checksum mismatch.")
    bundle = json.loads(gzip.decompress(payload))
    if (metadata["features"] != FEATURES or bundle["features"] != FEATURES
            or metadata["targets"] != TARGETS or bundle["targets"] != TARGETS
            or metadata["states"] != bundle["states"] or metadata["unit"] != "mm"
            or bundle["rain_threshold_mm"] != RAIN_THRESHOLD
            or metadata["rain_threshold_mm"] != RAIN_THRESHOLD
            or metadata["independently_evaluated"] is not True
            or type(metadata["independent_evaluation_passed"]) is not bool
            or len(bundle["models"]) != 7 or len(metadata["publish_probability"]) != 7
            or any(type(value) is not bool for value in metadata["publish_probability"])):
        raise ValueError("Rainfall model contract or evaluation mismatch.")
    for day, horizon in enumerate(bundle["models"], 1):
        if (horizon["target"] != TARGETS[day - 1]
                or horizon["architecture"] not in {"direct", "two_stage"}
                or horizon["architecture"] != metadata["architecture"]):
            raise ValueError("Rainfall horizon contract mismatch.")
        for name in ("occurrence", "amount"):
            booster = lgb.Booster(model_str=horizon[name])
            if booster.feature_name() != FEATURES:
                raise ValueError("Rainfall estimator feature order mismatch.")
            horizon[name] = booster
    return RainfallBundle(bundle["models"], bundle["states"], metadata["publish_probability"],
                          metadata["independent_evaluation_passed"])


@lru_cache(maxsize=1)
def loaded_bundle():
    return read_bundle(MODEL_DIR)


def predict_history(history, state, origin, bundle, *, preview=False):
    models, states, publish, released = bundle
    values = feature_values(history, state, origin, states)
    amounts, probabilities = infer(models, pd.DataFrame([values], columns=FEATURES))
    return [(float(amount) if released or preview else None, float(prob) if validated else None)
            for amount, prob, validated in zip(amounts[0], probabilities[0], publish)]
