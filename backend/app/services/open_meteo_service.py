"""Small, defensive Open-Meteo client used by location-aware weather lookup.

The client intentionally lives on the backend: the browser never calls a
weather provider directly, and every request uses the exact coordinates chosen
from geocoding.  It has no API key and uses the standard library so it does not
add another runtime dependency.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date as date_type
import json
import math
from threading import RLock
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from datetime import datetime

from cachetools import TTLCache

from app.schemas import LocationOption


GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
REQUEST_TIMEOUT_SECONDS = 12
# Open-Meteo's 16-day window includes today, so the furthest future target is
# 15 days ahead of the India-local current date.
MAX_FORECAST_DAYS = 15

# This includes the mainland plus Lakshadweep and Andaman/Nicobar while
# excluding a latitude/longitude typo or a location outside India.
INDIA_LATITUDE_RANGE = (6.0, 38.5)
INDIA_LONGITUDE_RANGE = (68.0, 98.5)

# Existing ingestion coordinates, used only when the user's query explicitly
# names a state/UT.  Such entries are marked ``scope=state`` and can use only
# the matching state-wide PostgreSQL series; they are never described as a
# city or district observation.
STATE_CENTERS: dict[str, tuple[float, float]] = {
    "Andhra Pradesh": (15.9129, 79.7400),
    "Arunachal Pradesh": (28.2180, 94.7278),
    "Assam": (26.2006, 92.9376),
    "Bihar": (25.0961, 85.3131),
    "Chandigarh": (30.7333, 76.7794),
    "Chhattisgarh": (21.2787, 81.8661),
    "Dadra And Nagar Haveli And Daman And Diu": (20.3974, 72.8328),
    "Delhi": (28.7041, 77.1025),
    "Goa": (15.2993, 74.1240),
    "Gujarat": (22.2587, 71.1924),
    "Haryana": (29.0588, 76.0856),
    "Himachal Pradesh": (31.1048, 77.1666),
    "Jammu And Kashmir": (33.7782, 76.5762),
    "Jharkhand": (23.6102, 85.2799),
    "Karnataka": (15.3173, 75.7139),
    "Kerala": (10.8505, 76.2711),
    "Madhya Pradesh": (22.9734, 78.6569),
    "Maharashtra": (19.7515, 75.7139),
    "Manipur": (24.6637, 93.9063),
    "Meghalaya": (25.4670, 91.3662),
    "Mizoram": (23.1645, 92.9376),
    "Nagaland": (26.1584, 94.5624),
    "Odisha": (20.9517, 85.0985),
    "Puducherry": (11.9416, 79.8083),
    "Punjab": (31.1471, 75.3412),
    "Rajasthan": (27.0238, 74.2179),
    "Sikkim": (27.5330, 88.5122),
    "Tamil Nadu": (11.1271, 78.6569),
    "Telangana": (18.1124, 79.0193),
    "Tripura": (23.9408, 91.9882),
    "Uttar Pradesh": (26.8467, 80.9462),
    "Uttarakhand": (30.0668, 79.0193),
    "West Bengal": (22.9868, 87.8550),
    "Andaman And Nicobar": (11.6234, 92.7265),
    "Lakshadweep": (10.5626, 72.6369),
}

_geocode_cache: TTLCache[tuple[str, int], list[dict[str, Any]]] = TTLCache(
    maxsize=256, ttl=600
)
_geocode_lock = RLock()


class WeatherProviderError(RuntimeError):
    """Base class for an upstream weather provider failure."""


class WeatherProviderUnavailable(WeatherProviderError):
    """The provider could not be reached or returned an unusable response."""


class WeatherDataUnavailable(WeatherProviderError):
    """The provider responded but did not have data for the requested date."""


class UnsupportedForecastDate(WeatherProviderError):
    """The requested future date is outside the provider forecast window."""


@dataclass(frozen=True)
class ProviderWeather:
    """Only values genuinely present in one Open-Meteo response."""

    temperature: float
    temperature_min: Optional[float] = None
    temperature_max: Optional[float] = None
    humidity: Optional[float] = None
    rainfall: Optional[float] = None
    wind_speed: Optional[float] = None
    weather_code: Optional[int] = None
    weather_description: Optional[str] = None


def india_today() -> date_type:
    """Return the calendar date relevant to all date-routing decisions."""
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def coordinates_are_in_india(latitude: float, longitude: float) -> bool:
    """Validate finite numeric coordinates against India's broad envelope."""
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return False
    return (
        math.isfinite(lat)
        and math.isfinite(lon)
        and INDIA_LATITUDE_RANGE[0] <= lat <= INDIA_LATITUDE_RANGE[1]
        and INDIA_LONGITUDE_RANGE[0] <= lon <= INDIA_LONGITUDE_RANGE[1]
    )


def _require_coordinates(latitude: float, longitude: float) -> tuple[float, float]:
    if not coordinates_are_in_india(latitude, longitude):
        raise WeatherDataUnavailable("The selected location has invalid India coordinates.")
    return float(latitude), float(longitude)


def _request_json(url: str) -> dict[str, Any]:
    """Fetch one JSON object with a bounded timeout and safe error messages."""
    try:
        request = Request(url, headers={"User-Agent": "WeatherForecastingIndia/1.0"})
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise WeatherProviderUnavailable("Open-Meteo is temporarily unavailable.") from exc

    if not isinstance(payload, dict):
        raise WeatherProviderUnavailable("Open-Meteo returned an invalid response.")
    return payload


def _numeric(value: Any, field: str, *, required: bool = False) -> Optional[float]:
    if value is None:
        if required:
            raise WeatherProviderUnavailable(f"Open-Meteo omitted {field}.")
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise WeatherProviderUnavailable(f"Open-Meteo returned an invalid {field}.") from exc
    if not math.isfinite(numeric):
        raise WeatherProviderUnavailable(f"Open-Meteo returned an invalid {field}.")
    return numeric


def _weather_code(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise WeatherProviderUnavailable("Open-Meteo returned an invalid weather code.") from exc


def weather_code_description(code: Optional[int]) -> Optional[str]:
    """Human-readable WMO label for a returned code; no estimated conditions."""
    if code is None:
        return None
    descriptions = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
        55: "Dense drizzle", 56: "Freezing drizzle", 57: "Heavy freezing drizzle",
        61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Freezing rain",
        67: "Heavy freezing rain", 71: "Slight snow", 73: "Moderate snow",
        75: "Heavy snow", 77: "Snow grains", 80: "Slight rain showers",
        81: "Moderate rain showers", 82: "Violent rain showers", 85: "Snow showers",
        86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail",
        99: "Thunderstorm with heavy hail",
    }
    return descriptions.get(code, "Unknown weather condition")


def _daily_weather(payload: dict[str, Any], requested_date: date_type) -> ProviderWeather:
    daily = payload.get("daily")
    if not isinstance(daily, dict):
        raise WeatherProviderUnavailable("Open-Meteo returned no daily weather data.")

    dates = daily.get("time")
    if not isinstance(dates, list):
        raise WeatherProviderUnavailable("Open-Meteo returned invalid daily dates.")
    try:
        index = dates.index(requested_date.isoformat())
    except ValueError as exc:
        raise WeatherDataUnavailable(
            f"No verified weather data is available for {requested_date.isoformat()}."
        ) from exc

    def at(field: str, *, required: bool = False) -> Optional[float]:
        values = daily.get(field)
        if not isinstance(values, list) or index >= len(values):
            if required:
                raise WeatherProviderUnavailable(f"Open-Meteo returned no {field} data.")
            return None
        return _numeric(values[index], field, required=required)

    code_values = daily.get("weather_code")
    code = None
    if isinstance(code_values, list) and index < len(code_values):
        code = _weather_code(code_values[index])

    return ProviderWeather(
        temperature=_numeric(daily.get("temperature_2m_mean", [None])[index]
                             if isinstance(daily.get("temperature_2m_mean"), list)
                             and index < len(daily["temperature_2m_mean"])
                             else None, "temperature_2m_mean", required=True),
        temperature_min=at("temperature_2m_min"),
        temperature_max=at("temperature_2m_max"),
        humidity=at("relative_humidity_2m_mean"),
        rainfall=at("precipitation_sum"),
        weather_code=code,
        weather_description=weather_code_description(code),
    )


def _copy_locations(items: list[dict[str, Any]]) -> list[LocationOption]:
    return [LocationOption.model_validate(item) for item in items]


def clear_geocode_cache() -> None:
    """Test/admin helper; ordinary callers rely on the ten-minute TTL."""
    with _geocode_lock:
        _geocode_cache.clear()


def search_india_locations(query: str, limit: int = 8) -> list[LocationOption]:
    """Return genuine India-only autocomplete entries from Open-Meteo geocoding."""
    clean_query = query.strip()
    if len(clean_query) < 2:
        return []
    safe_limit = max(1, min(int(limit), 10))
    cache_key = (clean_query.casefold(), safe_limit)
    with _geocode_lock:
        cached = _geocode_cache.get(cache_key)
    if cached is not None:
        return _copy_locations(cached)

    normalized_query = " ".join(clean_query.casefold().replace("&", "and").split())
    for state_name, (latitude, longitude) in STATE_CENTERS.items():
        if normalized_query == " ".join(state_name.casefold().split()):
            state_result = LocationOption(
                name=state_name,
                district="",
                state=state_name,
                country="India",
                country_code="IN",
                latitude=latitude,
                longitude=longitude,
                scope="state",
                geoname_id=None,
            )
            with _geocode_lock:
                _geocode_cache[cache_key] = [state_result.model_dump(mode="json")]
            return [state_result]

    query_params = {
        'name': clean_query,
        'count': safe_limit,
        'language': 'en',
        'format': 'json',
        'countryCode': 'IN',
    }
    url = f"{GEOCODING_URL}?{urlencode(query_params)}"
    payload = _request_json(url)
    raw_results = payload.get("results", [])
    if not isinstance(raw_results, list):
        raise WeatherProviderUnavailable("Open-Meteo returned invalid geocoding results.")

    locations: list[LocationOption] = []
    for result in raw_results:
        if not isinstance(result, dict) or str(result.get("country_code", "")).upper() != "IN":
            continue
        latitude = _numeric(result.get("latitude"), "latitude")
        longitude = _numeric(result.get("longitude"), "longitude")
        if latitude is None or longitude is None or not coordinates_are_in_india(latitude, longitude):
            continue
        name = str(result.get("name", "")).strip()
        state = str(result.get("admin1", "")).strip()
        district = str(result.get("admin2", "")).strip()
        if not name or not state:
            # Do not invent an administrative region when the geocoder has
            # not supplied one; incomplete results cannot meet this API's
            # disambiguation contract.
            continue
        scope = "state" if name.casefold() == state.casefold() else (
            "district" if district and name.casefold() == district.casefold() else "place"
        )
        try:
            locations.append(LocationOption(
                name=name,
                district=district,
                state=state,
                country=str(result.get("country", "India")).strip() or "India",
                country_code="IN",
                latitude=latitude,
                longitude=longitude,
                scope=scope,
                geoname_id=(int(result["id"]) if result.get("id") is not None else None),
            ))
        except ValueError:
            # A malformed provider row must not become a selectable location.
            continue

    cached_locations = [item.model_dump(mode="json") for item in locations[:safe_limit]]
    with _geocode_lock:
        _geocode_cache[cache_key] = cached_locations
    return _copy_locations(cached_locations)


def fetch_historical_weather(latitude: float, longitude: float, requested_date: date_type) -> ProviderWeather:
    """Fetch a real daily archive observation for exactly one past date."""
    lat, lon = _require_coordinates(latitude, longitude)
    date_text = requested_date.isoformat()
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": date_text,
        "end_date": date_text,
        "daily": (
            "temperature_2m_max,temperature_2m_min,temperature_2m_mean,"
            "precipitation_sum,relative_humidity_2m_mean,weather_code"
        ),
        "timezone": "Asia/Kolkata",
    }
    return _daily_weather(_request_json(f"{ARCHIVE_URL}?{urlencode(params)}"), requested_date)


def fetch_current_weather(latitude: float, longitude: float) -> ProviderWeather:
    """Fetch genuine current conditions; it is never represented as an ML result."""
    lat, lon = _require_coordinates(latitude, longitude)
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
        "timezone": "Asia/Kolkata",
    }
    payload = _request_json(f"{FORECAST_URL}?{urlencode(params)}")
    current = payload.get("current")
    if not isinstance(current, dict):
        raise WeatherProviderUnavailable("Open-Meteo returned no current weather data.")
    code = _weather_code(current.get("weather_code"))
    return ProviderWeather(
        temperature=_numeric(current.get("temperature_2m"), "temperature_2m", required=True),
        humidity=_numeric(current.get("relative_humidity_2m"), "relative_humidity_2m"),
        wind_speed=_numeric(current.get("wind_speed_10m"), "wind_speed_10m"),
        weather_code=code,
        weather_description=weather_code_description(code),
    )


def fetch_forecast_weather(
    latitude: float,
    longitude: float,
    requested_date: date_type,
    *,
    today: Optional[date_type] = None,
) -> ProviderWeather:
    """Fetch a provider forecast only when the exact requested date is supported."""
    current_date = today or india_today()
    days_ahead = (requested_date - current_date).days
    if days_ahead < 1 or days_ahead > MAX_FORECAST_DAYS:
        raise UnsupportedForecastDate(
            f"Forecasts are available for the next {MAX_FORECAST_DAYS} days only."
        )
    lat, lon = _require_coordinates(latitude, longitude)
    params = {
        "latitude": lat,
        "longitude": lon,
        "forecast_days": days_ahead + 1,
        "daily": (
            "temperature_2m_max,temperature_2m_min,temperature_2m_mean,"
            "precipitation_sum,relative_humidity_2m_mean,weather_code"
        ),
        "timezone": "Asia/Kolkata",
    }
    return _daily_weather(_request_json(f"{FORECAST_URL}?{urlencode(params)}"), requested_date)
