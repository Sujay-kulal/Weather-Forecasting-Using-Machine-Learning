"""Train and evaluate rainfall candidates from a read-only, bounded PostgreSQL snapshot.

Run from the repository root: python backend/train_rainfall.py --output <new directory>
The snapshot end and all partition dates are fixed for reproducibility.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from datetime import date, timedelta
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory

import lightgbm as lgb
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import precision_recall_fscore_support
from sqlalchemy import create_engine, text

from app.database_url import postgres_url
from app.services import rainfall as rain

ROOT = Path(__file__).resolve().parents[1]
# Partitions refer to target calendar dates. Drop origins whose history or any
# target crosses a partition boundary, including calibration and selection.
PERIODS = {
    "train": ("2023-04-01", "2024-12-31"),
    "calibration": ("2025-01-01", "2025-04-30"),
    "validation": ("2025-05-01", "2025-10-31"),
    "test": ("2025-11-01", "2026-11-10"),
}
CONFIG = dict(n_estimators=140, learning_rate=0.04, num_leaves=23, min_child_samples=60,
              random_state=42, n_jobs=4, deterministic=True, force_col_wise=True, verbosity=-1)
HEAVY_MM = 25.0  # study threshold for a daily total
MIN_SKILL = 0.01
MAX_CALIBRATION_ERROR = 0.08


def snapshot(states):
    load_dotenv(ROOT / "backend" / ".env")
    engine = create_engine(postgres_url(os.environ["DATABASE_URL"]), connect_args={"connect_timeout": 8})
    try:
        with engine.begin() as conn:
            conn.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
            if conn.scalar(text("SHOW transaction_read_only")) != "on":
                raise RuntimeError("Read-only transaction required.")
            return pd.read_sql(text("""
                SELECT date, state, rainfall, humidity, temp_avg, temp_max, temp_min
                FROM weather_data WHERE district='' AND location='' AND state=ANY(:states)
                    AND date BETWEEN :start AND :end
                ORDER BY state, date
            """), conn, params={"states": states, "start": PERIODS["train"][0], "end": PERIODS["test"][1]})
    finally:
        engine.dispose()


def clean_snapshot(raw, states):
    duplicate = raw.duplicated(["state", "date"], keep=False)
    invalid = ~raw.apply(rain.valid_observation, axis=1).astype(bool)
    clean = raw.loc[~duplicate & ~invalid].copy()
    dates = pd.date_range(PERIODS["train"][0], PERIODS["test"][1]).date
    coverage = {}
    for state in states:
        records = raw[raw.state == state]
        coverage[state] = dict(rows=len(records), missing_dates=len(set(dates) - set(records.date)),
                               start=str(records.date.min()), end=str(records.date.max()))
    positive = clean.loc[clean.rainfall > 0, "rainfall"]
    audit = dict(source="PostgreSQL weather_data, statewide rows, repeatable-read read-only transaction",
                 snapshot_sha256=hashlib.sha256(raw.to_csv(index=False, lineterminator="\n").encode()).hexdigest(),
                 rows=len(raw), usable_rows=len(clean), coverage=coverage, duplicate_rows=int(duplicate.sum()),
                 invalid_rows=int(invalid.sum()), missing_values=raw.isna().sum().to_dict(),
                 negative_rain_rows=int((raw.rainfall < 0).sum()),
                 observed_ranges={k: [float(clean[k].min()), float(clean[k].max())] for k in rain.MEASUREMENTS},
                 zero_days=int((clean.rainfall == 0).sum()), positive_days=len(positive),
                 positive_mm_quantiles=positive.quantile([0, .25, .5, .75, .95, .99, 1]).to_dict())
    return clean, audit


def panel_for_period(clean, states, bounds):
    start, end = map(date.fromisoformat, bounds)
    subset = clean.loc[clean.date.between(start, end)]
    panel = []
    for state, group in subset.groupby("state"):
        records = {r.date: r for r in group.itertuples(index=False)}
        for origin in pd.date_range(start + timedelta(days=7), end - timedelta(days=7)).date:
            history_dates = [origin - timedelta(days=i) for i in range(1, 8)]
            target_dates = [origin + timedelta(days=i) for i in range(1, 8)]
            if all(d in records for d in history_dates + target_dates):
                features = rain.feature_values([records[d] for d in history_dates], state, origin, states)
                panel.append([origin, state, *features, *(records[d].rainfall for d in target_dates)])
    result = pd.DataFrame(panel, columns=["origin", "state", *rain.FEATURES, *rain.TARGETS])
    if set(result.state) != set(states):
        raise ValueError("A period lacks complete examples for some supported states.")
    return result


def fit_candidates(train, calibration):
    candidates = {"direct": [], "two_stage": []}
    x = train[rain.FEATURES]
    for target in rain.TARGETS:
        y = train[target]
        wet = y > rain.RAIN_THRESHOLD
        kwargs = {"categorical_feature": ["state_code"]}
        occurrence = lgb.LGBMClassifier(**CONFIG).fit(x, wet, **kwargs).booster_
        raw = occurrence.predict(calibration[rain.FEATURES], num_threads=1)
        calibrator = IsotonicRegression(out_of_bounds="clip").fit(raw, calibration[target] > rain.RAIN_THRESHOLD)
        # Gamma uses a log link for the positive conditional mean without log-target retransformation bias.
        conditional = lgb.LGBMRegressor(objective="gamma", **CONFIG).fit(x[wet], y[wet], **kwargs)
        direct = lgb.LGBMRegressor(objective="tweedie", tweedie_variance_power=1.5, **CONFIG).fit(x, y, **kwargs)
        for name, estimator in [("direct", direct), ("two_stage", conditional)]:
            candidates[name].append(dict(target=target, architecture=name, amount=estimator.booster_,
                occurrence=occurrence, calibration=dict(x=calibrator.X_thresholds_.tolist(),
                y=calibrator.y_thresholds_.tolist()), trace_mean=float(y[~wet].mean())))
    return candidates


def baseline_predictions(panel, training_observations):
    states_months = training_observations.assign(month=[d.month for d in training_observations.date],
                                                 wet=training_observations.rainfall > rain.RAIN_THRESHOLD)
    climate = states_months.groupby(["state", "month"])[["rainfall", "wet"]].mean()
    amounts, probabilities = [], []
    for h in range(1, 8):
        months = (pd.to_datetime(panel.origin) + pd.Timedelta(days=h)).dt.month
        matched = climate.loc[list(zip(panel.state, months))]
        amounts.append(matched.rainfall.to_numpy())
        probabilities.append(matched.wet.to_numpy())
    persistence = np.repeat(panel[["rain_lag1"]].to_numpy(), 7, axis=1)
    zeros = np.zeros_like(persistence)
    return {"zero": (zeros, zeros), "persistence": (persistence, (persistence > rain.RAIN_THRESHOLD).astype(float)),
            "seasonal": (np.column_stack(amounts), np.column_stack(probabilities))}


def scores(actual, amount, probability):
    y, a, p = (np.asarray(v).ravel() for v in (actual, amount, probability))
    wet = y > rain.RAIN_THRESHOLD
    error = a - y

    def errors(mask):
        e = error[mask]
        return {"n": len(e), "mae": float(np.abs(e).mean()) if len(e) else None,
                "rmse": float(np.sqrt(np.square(e).mean())) if len(e) else None}

    precision, recall, f1, _ = precision_recall_fscore_support(wet, p >= .5, average="binary", zero_division=0)
    bins = []
    indices = np.minimum((p * 10).astype(int), 9)
    for i in np.unique(indices):
        mask = indices == i
        bins.append(dict(bin=int(i), n=int(mask.sum()), predicted=float(p[mask].mean()), observed=float(wet[mask].mean())))
    ece = sum(b["n"] * abs(b["predicted"] - b["observed"]) for b in bins) / len(y)
    return dict(**errors(slice(None)), wet_fraction=float(wet.mean()), wet=errors(wet), dry=errors(~wet),
                heavy=errors(y >= HEAVY_MM), precision=precision, recall=recall, f1=f1,
                brier=float(np.square(p - wet).mean()), calibration_bins=bins, ece=ece)


def evaluate(panel, predictions):
    actual = panel[rain.TARGETS].to_numpy()
    return {k: {"overall": scores(actual, a, p),
                "by_horizon": [scores(actual[:, i], a[:, i], p[:, i]) for i in range(7)]}
            for k, (a, p) in predictions.items()}


def period_summary(panel):
    first, last = panel.origin.min(), panel.origin.max()
    return dict(state_origins=len(panel), distinct_origins=panel.origin.nunique(),
                origin_dates=[str(first), str(last)],
                history_start=str(first - timedelta(days=7)),
                target_dates=[str(first + timedelta(days=1)), str(last + timedelta(days=7))])


def probability_gate(results, selected):
    return [m["brier"] < b["brier"] and m["ece"] <= MAX_CALIBRATION_ERROR
            for m, b in zip(results[selected]["by_horizon"], results["seasonal"]["by_horizon"])]


def paired_rmse_gain(panel, forecasts, candidate, baseline):
    """Resample 14-day origin blocks together across states and all seven horizons."""
    actual = panel[rain.TARGETS].to_numpy()
    dates = pd.to_datetime(panel.origin)
    block = (dates - dates.min()).dt.days // 14
    contributions = pd.DataFrame({
        "baseline": np.square(actual - forecasts[baseline][0]).sum(axis=1),
        "model": np.square(actual - forecasts[candidate][0]).sum(axis=1),
        "count": actual.shape[1],
    }).groupby(block.to_numpy()).sum().to_numpy()
    rng = np.random.default_rng(42)
    draws = rng.integers(len(contributions), size=(2000, len(contributions)))
    base, model, count = contributions[draws].sum(axis=1).T
    gain = np.sqrt(base / count) - np.sqrt(model / count)
    return dict(baseline=baseline, block_days=14, blocks=len(contributions), resamples=2000, seed=42,
                rmse_gain_mm_percentile_95=np.quantile(gain, [.025, .975]).tolist())


def run(output):
    if output.exists():
        raise FileExistsError("Choose a new candidate output directory.")
    states = json.loads((ROOT / "model/model_info.json").read_text())["states"]
    clean, audit = clean_snapshot(snapshot(states), states)
    train, cal, val = [panel_for_period(clean, states, PERIODS[k]) for k in ("train", "calibration", "validation")]
    fit_observations = clean[clean.date.between(*map(date.fromisoformat, PERIODS["train"]))]
    candidates = fit_candidates(train, cal)
    predictions = baseline_predictions(val, fit_observations)
    for name, models in candidates.items():
        predictions[name] = rain.infer(models, val[rain.FEATURES])
    validation = evaluate(val, predictions)
    selected = min(candidates, key=lambda k: validation[k]["overall"]["rmse"])
    selected_models = candidates[selected]
    bundle = dict(features=rain.FEATURES, targets=rain.TARGETS, states=states, rain_threshold_mm=rain.RAIN_THRESHOLD,
                  models=[dict(m, amount=m["amount"].model_to_string(), occurrence=m["occurrence"].model_to_string())
                          for m in selected_models])
    payload = gzip.compress(json.dumps(bundle, separators=(",", ":")).encode(), mtime=0)
    # Freeze architecture, weights and calibrators before building the final test panel.
    frozen = json.loads(gzip.decompress(payload))["models"]
    for model in frozen:
        for key in ("occurrence", "amount"):
            model[key] = lgb.Booster(model_str=model[key])
    test = panel_for_period(clean, states, PERIODS["test"])
    predictions = baseline_predictions(test, fit_observations)
    predictions[selected] = rain.infer(frozen, test[rain.FEATURES])
    final = evaluate(test, predictions)
    best_baseline = min(("zero", "persistence", "seasonal"), key=lambda k: final[k]["overall"]["rmse"])
    passed = final[selected]["overall"]["rmse"] <= final[best_baseline]["overall"]["rmse"] * (1 - MIN_SKILL)
    publish = [v and t for v, t in zip(probability_gate(validation, selected), probability_gate(final, selected))]
    metadata = dict(architecture=selected, artifact=rain.ARTIFACT, sha256=hashlib.sha256(payload).hexdigest(),
                    unit="mm", features=rain.FEATURES, targets=rain.TARGETS, states=states,
                    independently_evaluated=True, independent_evaluation_passed=passed, publish_probability=publish,
                    rain_threshold_mm=rain.RAIN_THRESHOLD, heavy_threshold_mm=HEAVY_MM,
                    selection_rule="Lowest validation RMSE for expected daily rainfall",
                    release_rule="Test RMSE at least 1% below best baseline for release of standard amount forecasts",
                    probability_rule="Per-horizon Brier below seasonal and 10-bin ECE <= 0.08 on both validation and test",
                    occurrence_decision_threshold=.5, calibration="Isotonic, fitted only in calibration period",
                    direct_objective="tweedie", tweedie_variance_power=1.5, conditional_objective="gamma",
                    conditional_target="mm on days >0.1 mm; expected amount includes train mean for dry/trace class",
                    periods=PERIODS, samples={k: period_summary(v) for k, v in
                    zip(PERIODS, (train, cal, val, test))}, training_configuration=CONFIG, audit=audit,
                    packages={p: version(p) for p in ("lightgbm", "numpy", "pandas", "scikit-learn")},
                    validation=validation, test=final,
                    paired_rmse_gain=paired_rmse_gain(test, predictions, selected, best_baseline))
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as temp:
        stage = Path(temp) / "candidate"
        stage.mkdir()
        (stage / rain.ARTIFACT).write_bytes(payload)
        (stage / rain.METADATA).write_text(json.dumps(metadata, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        stage.rename(output)
    print(f"Selected {selected}; independent evaluation passed={passed}; probability publication={publish}")
    for name, metrics in final.items():
        print(name, {k: round(metrics["overall"][k], 4) for k in ("mae", "rmse", "brier", "ece")})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    run(parser.parse_args().output)
