"""Fit an explicitly requested LightGBM candidate in a new output directory."""

import argparse
import hashlib
import json
import logging
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import joblib
import lightgbm as lgb
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sqlalchemy import create_engine, text

from backend.evaluate_deployed_artifact import (
    CAT_FEATURES,
    FEATURE_ORDER,
    HORIZON_DAYS,
    NUMERIC_FEATURES,
    PROJECT_ROOT,
    TARGET_COLUMNS,
    build_calendar_verified_panel,
)
from app.database_url import postgres_url

logger = logging.getLogger("retrain_v3")
PRODUCTION_MODEL_DIR = PROJECT_ROOT / "model"


def retrain_v3(output_dir: Path, through: date) -> None:
    output_dir = output_dir.resolve()
    if output_dir.is_relative_to(PRODUCTION_MODEL_DIR.resolve()):
        raise ValueError("Write candidates outside the production model directory.")
    if output_dir.exists():
        raise FileExistsError("Choose a new candidate output directory.")
    if through >= datetime.now(ZoneInfo("Asia/Kolkata")).date():
        raise ValueError("The training cutoff must be a completed calendar date in India.")

    info = json.loads((PRODUCTION_MODEL_DIR / "model_info.json").read_text(encoding="utf-8"))
    engine = create_engine(postgres_url(os.environ["DATABASE_URL"]), hide_parameters=True)
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql("SET TRANSACTION READ ONLY")
            raw = pd.read_sql_query(text("""
                SELECT date, state, temp_max, temp_min, temp_avg, humidity, rainfall
                FROM weather_data
                WHERE district = '' AND location = ''
                  AND state <> 'Other' AND date <= :through
                ORDER BY state, date
            """), conn, params={"through": through})
    finally:
        engine.dispose()

    panel = build_calendar_verified_panel(raw, allowed_states=info["states"])
    if panel.empty or set(panel["State"]) != set(info["states"]):
        raise ValueError("Candidate training requires complete windows for every supported state.")

    pipeline = Pipeline([
        ("preprocess", ColumnTransformer([
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CAT_FEATURES),
        ])),
        ("model", MultiOutputRegressor(lgb.LGBMRegressor(random_state=42, n_jobs=-1, verbose=-1))),
    ])
    pipeline.fit(panel[FEATURE_ORDER], panel[TARGET_COLUMNS])

    output_dir.mkdir(parents=True, exist_ok=False)
    candidate = output_dir / "weather_model_v3_candidate.joblib"
    joblib.dump(pipeline, candidate)
    metadata = {
        "best_model": "LightGBM",
        "target": info["target"],
        "features": FEATURE_ORDER,
        "states": info["states"],
        "model_path": candidate.name,
        "trained_through": str(panel["Date"].max() + timedelta(days=HORIZON_DAYS)),
        "train_period": [str(panel["Date"].min()), str(panel["Date"].max())],
        "metrics": {},
        "test_period": [],
        "metrics_status": "not_evaluated_for_current_artifact",
        "validated_for_artifact": False,
        "evaluation_artifact_sha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
    }
    (output_dir / "model_info.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    logger.info("Candidate and its metadata saved in %s", output_dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path, help="New directory for candidate artifacts")
    parser.add_argument(
        "--through", type=date.fromisoformat,
        default=datetime.now(ZoneInfo("Asia/Kolkata")).date() - timedelta(days=1),
        help="Last eligible observation date (YYYY-MM-DD)",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    retrain_v3(args.output_dir, args.through)
