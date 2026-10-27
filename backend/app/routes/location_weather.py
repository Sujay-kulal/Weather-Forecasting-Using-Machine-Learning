"""Location autocomplete and automatic ML/Open-Meteo weather lookup routes."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    LocationSearchResponse,
    LocationWeatherRequest,
    LocationWeatherResponse,
)
from app.services import location_weather_service, open_meteo_service


router = APIRouter(tags=["location weather"])


@router.get("/locations/search", response_model=LocationSearchResponse)
def search_locations(
    response: Response,
    q: str = Query(..., min_length=2, max_length=100, description="Location text to search in India"),
    limit: int = Query(8, ge=1, le=10),
):
    """Search genuine India-only locations, preserving their provider coordinates."""
    try:
        locations = open_meteo_service.search_india_locations(q, limit)
    except open_meteo_service.WeatherProviderUnavailable as exc:
        raise HTTPException(
            status_code=502,
            detail="Location search is temporarily unavailable from the weather provider.",
        ) from exc
    # Backend caching prevents repeated upstream calls; this header also lets a
    # browser reuse a just-typed query for a short period.
    response.headers["Cache-Control"] = "public, max-age=300"
    return LocationSearchResponse(locations=locations)


@router.post("/weather/lookup", response_model=LocationWeatherResponse)
def lookup_weather(
    payload: LocationWeatherRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Return an accurately labelled ML result or exact-coordinate API result."""
    try:
        return location_weather_service.lookup_location_weather(
            selected=payload.location,
            requested_date=payload.forecast_date,
            db=db,
            pipeline=getattr(request.app.state, "pipeline", None),
        )
    except open_meteo_service.UnsupportedForecastDate as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except open_meteo_service.WeatherDataUnavailable as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except open_meteo_service.WeatherProviderUnavailable as exc:
        raise HTTPException(
            status_code=502,
            detail="Weather data is temporarily unavailable from the weather provider.",
        ) from exc
