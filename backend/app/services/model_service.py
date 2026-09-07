"""
ML model service - loads the trained pipeline ONCE and serves predictions.

Rules enforced here:
 - Uses the existing model/weather_model.joblib (trained by train_model.py).
 - Never retrains, never creates a second model, never invents predictions.
 - If the model cannot be loaded, the application fails loudly at startup.
"""
import json
import logging
from pathlib import Path

import joblib
import pandas as pd

logger = logging.getLogger("model_service")

PROJECT_ROOT = Path(__file__).resolve().parents[3]   # backend/app/services -> project root
MODEL_PATH = PROJECT_ROOT / "model" / "weather_model.joblib"
MODEL_INFO_PATH = PROJECT_ROOT / "model" / "model_info.json"

try:
    pipeline = joblib.load(MODEL_PATH)
    with open(MODEL_INFO_PATH) as f:
        model_info = json.load(f)
    FEATURE_ORDER = model_info["features"]          # exact training column order
    MODEL_NAME = model_info["best_model"]
    MODEL_MAE = model_info["metrics"][MODEL_NAME]["MAE_mean"]
    logger.info("Loaded %s pipeline from %s (%d input features)",
                MODEL_NAME, MODEL_PATH, len(FEATURE_ORDER))
except Exception:
    logger.exception("FATAL: could not load the trained model from %s", MODEL_PATH)
    raise


def predict(features: pd.DataFrame) -> float:
    """
    Run the trained pipeline on a one-row feature DataFrame.
    Columns are re-indexed to the exact training order as a safety net.
    Scaling and one-hot encoding happen inside the pipeline itself.
    """
    X = features[FEATURE_ORDER]
    return float(pipeline.predict(X)[0])
