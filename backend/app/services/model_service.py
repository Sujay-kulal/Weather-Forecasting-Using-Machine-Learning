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
import numpy as np
import pandas as pd

from app.services.feature_service import build_features
from app.services.prediction_cache import prediction_cache

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
        raise FileNotFoundError(
            "No model_path configured in model_info.json and no evaluation_artifact found."
        )
    FEATURE_ORDER = model_info["features"]          # exact training column order
    MODEL_NAME = model_info["best_model"]
    MODEL_VERSION = MODEL_PATH.stem
    current_artifact_hash = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    expected_hash = model_info.get("evaluation_artifact_sha256")
    if expected_hash and current_artifact_hash != expected_hash:
        raise ValueError("Model artifact SHA-256 differs from the configured metadata.")
    pipeline = joblib.load(MODEL_PATH)
    encoder = pipeline.named_steps["preprocess"].named_transformers_["cat"]
    if (
        len(FEATURE_ORDER) != 20
        or list(pipeline.feature_names_in_) != FEATURE_ORDER
        or FEATURE_ORDER[-2:] != ["Season", "State"]
        or list(encoder.categories_[1]) != model_info["states"]
        or len(pipeline.named_steps["model"].estimators_) != 7
    ):
        raise ValueError("The loaded artifact does not match the 20-feature, seven-output model contract.")
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
    logger.exception("FATAL: could not load the trained model")
    raise


def predict(features: pd.DataFrame, pipeline=None) -> list[float]:
    """
    Run the trained pipeline on a one-row feature DataFrame.
    Columns are re-indexed to the exact training order as a safety net.
    Scaling and one-hot encoding happen inside the pipeline itself.
    """
    pipe = globals()["pipeline"] if pipeline is None else pipeline
    X = features[FEATURE_ORDER]
    if len(X) != 1 or not np.isfinite(X.iloc[:, :-2].to_numpy(dtype=float)).all():
        raise ValueError("Expected one feature row with finite numerical inputs.")
    if not all(X[column].iloc[0] in levels for column, levels in zip(("Season", "State"), encoder.categories_)):
        raise ValueError("Feature row has an unsupported season or state.")
    prediction = np.asarray(pipe.predict(X), dtype=float)
    if prediction.shape != (1, 7) or not np.isfinite(prediction).all():
        raise ValueError("Expected seven finite model predictions.")
    return prediction[0].tolist()


def predict_for_history(history, state, asof, *, today, pipeline=None) -> list[float]:
    """Validate the history on every request and cache predictions by model input."""
    features = build_features(history, state, asof, today=today)
    key = (id(pipeline), asof, tuple(features.iloc[0]))
    result = prediction_cache.get(key)
    if result is None:
        result = predict(features, pipeline=pipeline)
        if np.shape(result) != (7,) or not np.isfinite(result).all():
            raise ValueError("Expected seven finite model predictions.")
        prediction_cache[key] = result
    return result
