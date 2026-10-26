"""
ML model service - loads the trained pipeline ONCE and serves predictions.

Rules enforced here:
 - Loads the artifact configured in model/model_info.json when available.
 - Never retrains, never creates a second model, never invents predictions.
 - If the model cannot be loaded, the application fails loudly at startup.
"""
import json
import logging
import hashlib
from pathlib import Path

import joblib
import pandas as pd

logger = logging.getLogger("model_service")

PROJECT_ROOT = Path(__file__).resolve().parents[3]   # backend/app/services -> project root
MODEL_INFO_PATH = PROJECT_ROOT / "model" / "model_info.json"

try:
    with open(MODEL_INFO_PATH) as f:
        model_info = json.load(f)
    configured_path = model_info.get("model_path") or model_info.get("model_v3_path")
    evaluation_path = model_info.get("evaluation_artifact")
    if configured_path:
        MODEL_PATH = PROJECT_ROOT / Path(str(configured_path).replace("\\", "/"))
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(f"Configured model artifact does not exist: {MODEL_PATH}")
    elif evaluation_path and (PROJECT_ROOT / evaluation_path).is_file():
        MODEL_PATH = PROJECT_ROOT / evaluation_path
    else:
        MODEL_PATH = next(
            (
                candidate for candidate in (
                    PROJECT_ROOT / "model" / "weather_model_v2.joblib",
                    PROJECT_ROOT / "model" / "weather_model.joblib",
                )
                if candidate.is_file()
            ),
            PROJECT_ROOT / "model" / "weather_model_v2.joblib",
        )
    pipeline = joblib.load(MODEL_PATH)
    FEATURE_ORDER = model_info["features"]          # exact training column order
    MODEL_NAME = model_info["best_model"]
    MODEL_VERSION = MODEL_PATH.stem
    current_artifact_hash = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    evaluation_matches_loaded_artifact = (
        model_info.get("validated_for_artifact") is True
        and model_info.get("evaluation_artifact_sha256") == current_artifact_hash
    )
    MODEL_MAE = (
        model_info.get("metrics", {}).get(MODEL_NAME, {}).get("MAE")
        if evaluation_matches_loaded_artifact else None
    )
    logger.info("Loaded %s pipeline from %s (%d input features)",
                MODEL_NAME, MODEL_PATH, len(FEATURE_ORDER))
except Exception:
    logger.exception("FATAL: could not load the trained model from %s", MODEL_PATH)
    raise


def predict(features: pd.DataFrame, pipeline=None) -> list[float]:
    """
    Run the trained pipeline on a one-row feature DataFrame.
    Columns are re-indexed to the exact training order as a safety net.
    Scaling and one-hot encoding happen inside the pipeline itself.
    """
    pipe = pipeline or globals()["pipeline"]
    X = features[FEATURE_ORDER]
    return pipe.predict(X)[0].tolist()
