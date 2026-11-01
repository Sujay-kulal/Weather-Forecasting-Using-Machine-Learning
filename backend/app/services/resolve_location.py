"""Shared location resolution used by weather and prediction routes."""
import json
from pathlib import Path
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import WeatherData

PROJECT_ROOT = Path(__file__).resolve().parents[3]
MODEL_INFO_PATH = PROJECT_ROOT / "model" / "model_info.json"

try:
    with open(MODEL_INFO_PATH, "r", encoding="utf-8") as f:
        _info = json.load(f)
    MODEL_SUPPORTED_STATES = frozenset(s for s in _info.get("states", []) if s != "Other")
except Exception:
    MODEL_SUPPORTED_STATES = frozenset()


def resolve_location(
    state: str,
    district: str,
    location: str,
    db: Session,
    *,
    require_model_support: bool = False,
):
    """Validate that the exact state/district/location combination exists in the DB.

    Returns (canonical_state, district, location) or raises HTTPException 404 / 422.
    """
    canonical_state = state.strip().title()
    dist = district.strip()
    loc = location.strip()

    if require_model_support and canonical_state not in MODEL_SUPPORTED_STATES:
        raise HTTPException(
            422,
            detail=f"State '{canonical_state}' is not supported for machine learning model inference. "
                   f"Supported states are: {sorted(MODEL_SUPPORTED_STATES)}",
        )

    exists = db.execute(
        select(func.count()).select_from(WeatherData).where(
            WeatherData.state == canonical_state,
            WeatherData.district == dist,
            WeatherData.location == loc
        )
    ).scalar_one()

    if not exists:
        if dist == "" and loc == "":
            raise HTTPException(404, detail=f"Unknown state '{state}'. Call GET /states for the available names.")
        elif loc == "":
            raise HTTPException(404, detail=f"Unknown district '{district}' in state '{state}'.")
        else:
            raise HTTPException(404, detail=f"Unknown location '{location}' in district '{district}', state '{state}'.")

    return canonical_state, dist, loc
