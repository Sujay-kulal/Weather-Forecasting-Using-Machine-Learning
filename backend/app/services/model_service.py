"""
ML model service - loads the trained pipeline ONCE and serves predictions.

Rules enforced here:
 - Loads the artifact named by model/model_info.json when a path is recorded.
 - Uses a deterministic legacy search order only when metadata has no artifact path.
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
MODEL_INFO_PATH = PROJECT_ROOT / "model" / "model_info.json"

try:
    with open(MODEL_INFO_PATH) as f:
        model_info = json.load(f)

    configured_path = model_info.get("model_path") or model_info.get("model_v3_path")
    if configured_path:
        # Metadata may have been written on Windows and used on Linux.
        MODEL_PATH = PROJECT_ROOT / Path(str(configured_path).replace("\\", "/"))
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(f"Configured model artifact does not exist: {MODEL_PATH}")
    else:
        MODEL_PATH = next(
            (
                candidate for candidate in (
                    PROJECT_ROOT / "model" / "weather_model.joblib",
                    PROJECT_ROOT / "model" / "weather_model_v3.joblib",
                    PROJECT_ROOT / "model" / "weather_model_v2.joblib",
                )
                if candidate.is_file()
            ),
            PROJECT_ROOT / "model" / "weather_model.joblib",
        )

    pipeline = joblib.load(MODEL_PATH)
    FEATURE_ORDER = model_info["features"]          # exact training column order
    MODEL_NAME = model_info["best_model"]
    MODEL_METRICS = model_info.get("metrics", {})
    MODEL_METRICS_STATUS = model_info.get("metrics_status", "unknown")
    INTERVAL_STATUS = model_info.get("interval_status", "unknown")
    model_metrics = MODEL_METRICS.get(MODEL_NAME, {})
    MODEL_MAE = (
        model_metrics.get("MAE", model_metrics.get("MAE_mean"))
        if MODEL_METRICS_STATUS == "validated_for_current_artifact"
        else None
    )
    # Do not serve stale or fallback interval widths as calibrated confidence
    # intervals. A q value is active only when metadata explicitly validates it
    # for this exact artifact.
    MODEL_Q = (
        float(model_info["q"])
        if INTERVAL_STATUS == "calibrated_for_current_artifact"
        and model_info.get("q") is not None
        else None
    )
    logger.info(
        "Loaded %s pipeline from %s (%d input features, metrics=%s, interval=%s)",
        MODEL_NAME, MODEL_PATH, len(FEATURE_ORDER), MODEL_METRICS_STATUS,
        INTERVAL_STATUS,
    )
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
