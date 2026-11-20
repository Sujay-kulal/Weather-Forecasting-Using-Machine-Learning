"""Frozen rainfall v2 validation protocol. Run with --output pointing to a new directory.

Expanding folds use disjoint input/target periods within each fold. The old v1
test interval is opened for retrospective diagnosis only after freezing selection.
"""
import argparse
import gzip
import hashlib
import json
from datetime import date
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.special import logit
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss

from app.services import rainfall as rain
import train_rainfall as v1

FOLDS = [
    {"train": ("2023-04-01", "2024-09-30"), "calibration": ("2024-10-01", "2024-12-31"),
     "validation": ("2025-01-01", "2025-04-30")},
    {key: v1.PERIODS[key] for key in ("train", "calibration", "validation")},
]
BASE = rain.FEATURES
EXTENDED = BASE + rain.EXTRA_FEATURES
REGULARIZED = dict(v1.CONFIG, num_leaves=12, min_child_samples=100, reg_lambda=3,
                   n_estimators=180, learning_rate=.035, max_depth=6)
# Targets remain in mm. Weighting is a sensitivity analysis for tail errors.
RECIPES = [
    ("v1_recipe", BASE, v1.CONFIG, 1.5, False),
    ("regularized", BASE, REGULARIZED, 1.3, False),
    ("extended", EXTENDED, REGULARIZED, 1.3, False),
    ("heavy_weighted", EXTENDED, REGULARIZED, 1.3, True),
]
SELECTION = ("Require lower RMSE than v1 in both folds and <=1% worse MAE and <=2% worse heavy MAE "
             "in each fold. Minimize equal-fold mean RMSE among eligible configurations. "
             "For direct regression select calibration by equal-fold mean Brier, isotonic on ties. "
             "For two-stage candidates the calibrator is part of the amount configuration. "
             "No new production publication without a fresh, representative test.")


def calibrators(raw, wet):
    iso = IsotonicRegression(out_of_bounds="clip").fit(raw, wet)
    log_odds = logit(np.clip(raw, 1e-8, 1 - 1e-8)).reshape(-1, 1)
    platt = LogisticRegression(C=1, random_state=42).fit(log_odds, wet)
    return {"isotonic": {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()},
            "platt": {"method": "platt", "slope": float(platt.coef_[0, 0]), "intercept": float(platt.intercept_[0])}}


def fit_fold(train, calibration):
    fitted = {}
    for name, columns, config, power, weighted in RECIPES:
        x, xc = train[columns], calibration[columns]
        for i, target in enumerate(rain.TARGETS):
            y = train[target]
            wet = y > rain.RAIN_THRESHOLD
            kwargs = dict(categorical_feature=["state_code"])
            if weighted:
                common = fitted["extended_direct_isotonic"][i]
                occurrence = common["occurrence"]
                curves = {method: fitted[f"extended_direct_{method}"][i]["calibration"] for method in ("isotonic", "platt")}
            else:
                occurrence = lgb.LGBMClassifier(**config).fit(x, wet, **kwargs).booster_
                curves = calibrators(occurrence.predict(xc, num_threads=1), calibration[target] > rain.RAIN_THRESHOLD)
            weights = np.where(y >= v1.HEAVY_MM, 1.5, 1.) if weighted else None
            direct = lgb.LGBMRegressor(objective="tweedie", tweedie_variance_power=power, **config)
            regressors = {"direct": direct.fit(x, y, sample_weight=weights, **kwargs).booster_}
            if name == "extended":
                gamma = lgb.LGBMRegressor(objective="gamma", **config)
                regressors["two_stage"] = gamma.fit(x[wet], y[wet], **kwargs).booster_
            for architecture, amount in regressors.items():
                for method, curve in curves.items():
                    key = f"{name}_{architecture}_{method}"
                    fitted.setdefault(key, []).append(dict(target=target, architecture=architecture,
                        occurrence=occurrence, amount=amount, calibration=curve, trace_mean=float(y[~wet].mean())))
    return fitted


def prediction(models, panel):
    return rain.infer(models, panel[models[0]["amount"].feature_name()])


def metrics(y, a, p):
    m = v1.scores(y, a, p)
    wet = y > rain.RAIN_THRESHOLD
    heavy = y >= v1.HEAVY_MM
    m["log_loss"] = float(log_loss(wet.ravel(), p.ravel(), labels=[False, True]))
    m["heavy_bias_mm"] = float((a[heavy] - y[heavy]).mean()) if heavy.any() else None
    return m


def season(month):
    return np.select([np.isin(month, [6, 7, 8, 9]), np.isin(month, [10, 11]), np.isin(month, [12, 1, 2])],
                     ["monsoon", "post_monsoon", "winter"], default="pre_monsoon")


def breakdown(panel, forecasts):
    y = panel[rain.TARGETS].to_numpy()
    dates = pd.to_datetime(panel.origin)
    seasons = np.column_stack([season((dates + pd.Timedelta(days=h)).dt.month) for h in range(1, 8)])
    groups = {s: (seasons == s) for s in np.unique(seasons)}
    groups.update({s: np.broadcast_to((panel.state == s).to_numpy()[:, None], y.shape) for s in panel.state.unique()})
    out = {}
    for key, (a, p) in forecasts.items():
        out[key] = dict(overall=metrics(y, a, p), by_horizon=[
            metrics(y[:, i], a[:, i], p[:, i]) for i in range(7)],
            by_group={s: metrics(y[mask], a[mask], p[mask]) for s, mask in groups.items()})
    return out


def choose(fold_scores):
    ref = "v1_recipe_direct_isotonic"
    eligible = []
    for name in fold_scores[0]:
        if name in ("zero", "persistence", "seasonal", ref):
            continue
        if all(s[name]["rmse"] < s[ref]["rmse"] and s[name]["mae"] <= 1.01 * s[ref]["mae"]
               and s[name]["heavy"]["mae"] <= 1.02 * s[ref]["heavy"]["mae"] for s in fold_scores):
            eligible.append(name)
    def rank(name):
        return (np.mean([s[name]["rmse"] for s in fold_scores]),
                np.mean([s[name]["brier"] for s in fold_scores]), name)
    return min(eligible, key=rank) if eligible else ref


def freeze(models, states):
    fields = models[0]["amount"].feature_name()
    data = dict(version="rainfall_v2", features=fields, history_days=7, states=states, targets=rain.TARGETS,
                rain_threshold_mm=rain.RAIN_THRESHOLD, unit="mm",
                models=[dict(m, amount=m["amount"].model_to_string(), occurrence=m["occurrence"].model_to_string())
                        for m in models])
    return gzip.compress(json.dumps(data, separators=(",", ":")).encode(), mtime=0)


def thaw(payload, checksum):
    if hashlib.sha256(payload).hexdigest() != checksum:
        raise ValueError("Rainfall candidate checksum mismatch.")
    doc = json.loads(gzip.decompress(payload))
    if (doc["features"] not in (BASE, EXTENDED) or doc["targets"] != rain.TARGETS
            or [m["target"] for m in doc["models"]] != rain.TARGETS or doc["version"] != "rainfall_v2"):
        raise ValueError("Invalid offline candidate contract.")
    for model in doc["models"]:
        for k in ("amount", "occurrence"):
            model[k] = lgb.Booster(model_str=model[k])
            if model[k].feature_name() != doc["features"]:
                raise ValueError("Candidate estimator feature mismatch.")
    return doc


def select_and_measure(clean, states):
    reports, scores, retained = [], [], []
    for fold_number, fold in enumerate(FOLDS, 1):
        partitions = [v1.panel_for_period(clean, states, fold[k], extended=True) for k in ("train", "calibration", "validation")]
        train, calibration, validation = partitions
        models = fit_fold(train, calibration)
        fit_raw = clean[clean.date.between(*map(date.fromisoformat, fold["train"]))]
        forecasts = v1.baseline_predictions(validation, fit_raw)
        actual = validation[rain.TARGETS].to_numpy()
        for name, horizons in models.items():
            forecasts[name] = prediction(horizons, validation)
        if fold_number == 2:
            active = prediction(rain.loaded_bundle().models, validation)
            for observed, expected in zip(forecasts["v1_recipe_direct_isotonic"], active):
                np.testing.assert_allclose(observed, expected, rtol=0, atol=1e-10)
        overall = {k: metrics(actual, a, p) for k, (a, p) in forecasts.items()}
        by_horizon = {k: [metrics(actual[:, i], a[:, i], p[:, i]) for i in range(7)]
                      for k, (a, p) in forecasts.items()}
        conditional = np.column_stack([m["amount"].predict(validation[EXTENDED], num_threads=1)
                                       for m in models["extended_two_stage_platt"]])
        conditional_errors = {}
        for group, mask in [("wet", actual > rain.RAIN_THRESHOLD), ("heavy", actual >= v1.HEAVY_MM)]:
            error = conditional[mask] - actual[mask]
            conditional_errors[group] = dict(n=len(error), mae=np.abs(error).mean(), bias=error.mean())
        scores.append(overall)
        reports.append(dict(periods=fold, samples={k: v1.period_summary(p) for k, p in zip(fold, partitions)},
                            metrics=overall, by_horizon=by_horizon, conditional_amount_errors=conditional_errors,
                            heavy_training_state_days=int((fit_raw.rainfall >= v1.HEAVY_MM).sum()),
                            unique_training_state_days=len(fit_raw)))
        retained.append((validation, forecasts))
    selected = choose(scores)
    for report, (panel, forecasts) in zip(reports, retained):
        comparisons = {"v1": forecasts["v1_recipe_direct_isotonic"], "candidate": forecasts[selected],
                       **{k: forecasts[k] for k in ("zero", "persistence", "seasonal", "extended_direct_platt",
                                                     "extended_two_stage_platt", "heavy_weighted_direct_platt")}}
        report["detail"] = breakdown(panel, comparisons)
        report["rmse_gain"] = {k: v1.paired_rmse_gain(panel, comparisons, "candidate", k) for k in ("v1", "seasonal")}
        report["challenger_gain_vs_v1"] = {k: v1.paired_rmse_gain(panel, comparisons, k, "v1")
                                          for k in ("extended_direct_platt", "extended_two_stage_platt",
                                                    "heavy_weighted_direct_platt")}
    return selected, models, fit_raw, reports


def run(output):
    if output.exists():
        raise FileExistsError("Choose a new experiment directory.")
    baseline = json.loads((rain.MODEL_DIR / rain.METADATA).read_text())
    states = baseline["states"]
    clean, audit = v1.clean_snapshot(v1.snapshot(states), states)
    if audit["snapshot_sha256"] != baseline["audit"]["snapshot_sha256"]:
        raise ValueError("This benchmark requires the recorded v1 snapshot.")
    development = clean[clean.date <= date(2025, 10, 31)]
    selected, models, fit_raw, folds = select_and_measure(development, states)
    payload = freeze(models[selected], states)
    checksum = hashlib.sha256(payload).hexdigest()
    frozen = thaw(payload, checksum)
    # Only the frozen winner sees these previously inspected dates. No feedback into selection.
    test = v1.panel_for_period(clean, states, v1.PERIODS["test"], extended=True)
    forecasts = v1.baseline_predictions(test, fit_raw)
    forecasts["v1"] = prediction(rain.loaded_bundle().models, test)
    forecasts["candidate"] = prediction(frozen["models"], test)
    retrospective = breakdown(test, forecasts)
    for field in ("mae", "rmse"):
        np.testing.assert_allclose(retrospective["v1"]["overall"][field], baseline["test"]["direct"]["overall"][field])
    metadata = dict(version="rainfall_v2", selected=selected, features=frozen["features"], states=states,
                    targets=rain.TARGETS, unit="mm", rain_threshold_mm=rain.RAIN_THRESHOLD,
                    selection_rule=SELECTION, periods=FOLDS[-1], source_sha256=audit["snapshot_sha256"],
                    baseline_artifact_sha256=baseline["sha256"],
                    data_changes="No added, substituted or interpolated observations.",
                    configurations=[dict(name=n, columns=c, lightgbm=p, tweedie_power=t, heavy_weight=1.5 if w else 1.)
                                    for n, c, p, t, w in RECIPES], packages={p: version(p) for p in baseline["packages"]},
                    folds=folds, retrospective=dict(bounds=v1.PERIODS["test"], samples=v1.period_summary(test),
                    metrics=retrospective, rmse_gain={k: v1.paired_rmse_gain(test, forecasts, "candidate", k)
                    for k in ("v1", "seasonal")}), test_status="previously_inspected_v1_period",
                    release_status="offline_research_only", independently_evaluated=False,
                    amount_released=False, publish_probability=[False]*7,
                    artifact_sha256=checksum if selected != "v1_recipe_direct_isotonic" else None)
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as temp:
        stage = Path(temp) / "experiment"
        stage.mkdir()
        if metadata["artifact_sha256"]:
            (stage / "rainfall_v2.json.gz").write_bytes(payload)
        (stage / "rainfall_v2_info.json").write_text(json.dumps(metadata, separators=(",", ":"), allow_nan=False)+"\n")
        stage.rename(output)
    print(selected, checksum, flush=True)
    for i, report in enumerate(folds):
        print(i+1, {k: round(v["rmse"], 4) for k, v in report["metrics"].items()}, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    run(parser.parse_args().output)
