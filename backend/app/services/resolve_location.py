"""Shared location resolution used by weather and prediction routes."""
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import WeatherData


def resolve_location(state: str, district: str, location: str, db: Session):
    """Validate that the exact state/district/location combination exists in the DB.

    Returns (canonical_state, district, location) or raises HTTPException 404.
    """
    canonical_state = state.strip().title()
    dist = district.strip()
    loc = location.strip()

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
