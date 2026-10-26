"""Source selection for a user-selected India location.

This module deliberately requires an exact database identity before touching
the ML path.  A city in Karnataka, for example, can never inherit Karnataka's
state-wide training history merely because both strings mention Karnataka.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date as date_type, timedelta
import logging
import math
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import WeatherData, WeatherLocationMetadata
from app.schemas import LocationOption, LocationWeatherResponse, WeatherDay
from app.services import model_service, open_meteo_service
from app.services.feature_service import MAX_STALENESS_DAYS, REQUIRED_HISTORY, build_features
from app.services.prediction_cache import prediction_cache


logger = logging.getLogger("location_weather")


@dataclass(frozen=True)
class DatabaseLocation:
    state: str
    district: str
    location: str


def _same_text(column, value: str):
    """Case-insensitive SQL equality without converting a city into a state."""
    return func.lower(column) == value.strip().casefold()


def _candidate_database_locations(selected: LocationOption) -> list[tuple[str, str, str]]:
    """Return only geographic scopes explicitly represented by the selection."""
    candidates: list[tuple[str, str, str]] = []
    if selected.state:
        # A normal city/town is eligible only for a row with the exact same
        # state + district + location identity.
        candidates.append((selected.state, selected.district, selected.name))

        # A named district can use a genuinely district-wide database series;
        # it is still not allowed to borrow the state series.
        if selected.district and selected.name.casefold() == selected.district.casefold():
            candidates.append((selected.state, selected.district, ""))

        # State-wide data is valid only when the geocoder actually selected a
        # state (no district) whose displayed name equals its state field.
        if (
            not selected.district
            and selected.name.casefold() == selected.state.casefold()
        ):
            candidates.append((selected.state, "", ""))
    return candidates


def resolve_database_location(selected: LocationOption, db: Session) -> Optional[DatabaseLocation]:
    """Find one exact weather-data key, never a nearest or state-average proxy."""
    if selected.geoname_id is not None:
        metadata = db.execute(
            select(WeatherLocationMetadata).where(
                WeatherLocationMetadata.catalog_source == "GeoNames",
                WeatherLocationMetadata.catalog_record_id == str(selected.geoname_id),
                WeatherLocationMetadata.state == selected.state,
            )
        ).scalar_one_or_none()
        if metadata is not None:
            return DatabaseLocation(
                state=metadata.state,
                district=metadata.district,
                location=metadata.location,
            )

    for state, district, location in _candidate_database_locations(selected):
        row = db.execute(
            select(WeatherData.state, WeatherData.district, WeatherData.location)
            .where(
                _same_text(WeatherData.state, state),
                _same_text(WeatherData.district, district),
                _same_text(WeatherData.location, location),
            )
            .limit(1)
        ).first()
        if row is not None:
            return DatabaseLocation(state=row[0], district=row[1], location=row[2])
    return None


def _observation_for_date(
    identity: DatabaseLocation, requested_date: date_type, db: Session
) -> Optional[WeatherData]:
    return db.execute(
        select(WeatherData).where(
            WeatherData.state == identity.state,
            WeatherData.district == identity.district,
            WeatherData.location == identity.location,
            WeatherData.date == requested_date,
        )
    ).scalar_one_or_none()


def _provider_response(
    selected: LocationOption,
    requested_date: date_type,
    source: str,
    weather: open_meteo_service.ProviderWeather,
) -> LocationWeatherResponse:
    return LocationWeatherResponse(
        location=selected,
        forecast_date=requested_date,
        source=source,  # pydantic verifies this is one of the declared labels
        temperature=weather.temperature,
        temperature_min=weather.temperature_min,
        temperature_max=weather.temperature_max,
        humidity=weather.humidity,
        rainfall=weather.rainfall,
        wind_speed=weather.wind_speed,
        weather_code=weather.weather_code,
        weather_description=weather.weather_description,
    )


def _database_observation_response(
    selected: LocationOption, requested_date: date_type, observation: WeatherData
) -> LocationWeatherResponse:
    imported_archive = bool(observation.district or observation.location)
    return LocationWeatherResponse(
        location=selected,
        forecast_date=requested_date,
        source="Historical Reanalysis" if imported_archive else "Historical Observations",
        temperature=float(observation.temp_avg),
        temperature_min=float(observation.temp_min),
        temperature_max=float(observation.temp_max),
        humidity=float(observation.humidity),
        rainfall=float(observation.rainfall),
        message=(
            "Historical reanalysis from Open-Meteo for the matching location."
            if imported_archive
            else "Historical observation from the matching location record."
        ),
    )


def _try_ml_prediction(
    identity: DatabaseLocation,
    selected: LocationOption,
    requested_date: date_type,
    db: Session,
    pipeline,
) -> Optional[LocationWeatherResponse]:
    """Use the unchanged existing feature path only when it is valid and fresh."""
    asof = requested_date - timedelta(days=1)
    history = db.execute(
        select(WeatherData)
        .where(
            WeatherData.state == identity.state,
            WeatherData.district == identity.district,
            WeatherData.location == identity.location,
            WeatherData.date < asof,
        )
        .order_by(WeatherData.date.desc())
        .limit(REQUIRED_HISTORY)
    ).scalars().all()
    if len(history) < REQUIRED_HISTORY:
        return None
    if (asof - history[0].date).days > MAX_STALENESS_DAYS:
        return None

    cache_key = (
        identity.state,
        identity.district,
        identity.location,
        requested_date,
        history[0].date,
    )
    try:
        if cache_key in prediction_cache:
            predicted = prediction_cache[cache_key]
        else:
            features = build_features(history, identity.state, asof)
            predicted = model_service.predict(features, pipeline=pipeline)
            prediction_cache[cache_key] = predicted
        temperatures = [float(value) for value in predicted]
        if not temperatures or not all(math.isfinite(value) for value in temperatures):
            logger.error("Model returned no usable values for %s", identity)
            return None
    except Exception:
        # The automatic lookup remains truthful by falling back to a provider
        # response.  The original /predict endpoint keeps its established 500
        # behavior and remains unchanged.
        logger.exception("Model prediction unavailable for %s", identity)
        return None

    return LocationWeatherResponse(
        location=selected,
        forecast_date=requested_date,
        source="ML Prediction",
        temperature=temperatures[0],
        forecast=[
            WeatherDay(date=requested_date + timedelta(days=index), temperature=temperature)
            for index, temperature in enumerate(temperatures)
        ],
        model=model_service.MODEL_NAME,
        last_known={"date": str(history[0].date), "temp_avg": float(history[0].temp_avg)},
        message="Forecast generated from the existing saved ML model and matching historical data.",
    )


def lookup_location_weather(
    selected: LocationOption,
    requested_date: date_type,
    db: Session,
    pipeline=None,
    *,
    today: Optional[date_type] = None,
) -> LocationWeatherResponse:
    """Choose a source based on date and exact data availability.

    Past dates prefer real observations.  The current date always uses current
    provider conditions.  Only future dates can enter the existing ML route,
    and only after an exact database identity and its required seven-record
    history have both been established.
    """
    current_date = today or open_meteo_service.india_today()

    if requested_date == current_date:
        weather = open_meteo_service.fetch_current_weather(
            selected.latitude, selected.longitude
        )
        return _provider_response(selected, requested_date, "Current Weather", weather)

    identity = resolve_database_location(selected, db)
    if requested_date < current_date:
        if identity is not None:
            observation = _observation_for_date(identity, requested_date, db)
            if observation is not None:
                return _database_observation_response(selected, requested_date, observation)
        weather = open_meteo_service.fetch_historical_weather(
            selected.latitude, selected.longitude, requested_date
        )
        return _provider_response(selected, requested_date, "Historical Observations", weather)

    # The saved artifact was trained only on state-wide series.  Location
    # history can supply past observations, but city/district rows must not be
    # fed to that state-trained model and described as local ML forecasts.
    if (
        identity is not None
        and selected.scope == "state"
        and identity.district == ""
        and identity.location == ""
    ):
        ml_response = _try_ml_prediction(
            identity, selected, requested_date, db, pipeline
        )
        if ml_response is not None:
            return ml_response

    weather = open_meteo_service.fetch_forecast_weather(
        selected.latitude, selected.longitude, requested_date, today=current_date
    )
    return _provider_response(selected, requested_date, "Weather API Forecast", weather)
