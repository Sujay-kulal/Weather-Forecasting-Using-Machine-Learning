"""
Pydantic schemas - API request/response contracts.

These drive the automatic Swagger documentation at /docs.
"""
from datetime import date as date_type
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ----------------------------- requests -----------------------------
class PredictionRequest(BaseModel):
    state: str = Field(..., min_length=1, description="Indian state name, e.g. 'Karnataka'")
    district: Optional[str] = Field("", description="District name, e.g. 'Udupi'")
    location: Optional[str] = Field("", description="Location name, e.g. 'Kundapura'")
    forecast_date: date_type = Field(..., description="Day to forecast (YYYY-MM-DD). "
                                                      "Must have 7 days of history before it.")


# ----------------------------- responses -----------------------------
class PredictionResponse(BaseModel):
    state: str
    district: str = ""
    location: str = ""
    forecast_date: date_type
    predicted_temp_avg: list[float] = Field(..., description="Predicted Temp_Avg for next 7 days in deg C")
    temp_lo: Optional[list[float]] = Field(None, description="Lower bound when a calibrated interval is available")
    temp_hi: Optional[list[float]] = Field(None, description="Upper bound when a calibrated interval is available")
    interval_status: str = "unknown"
    unit: str = "deg C"
    model: str = Field(..., description="Model name that produced the prediction")
    typical_error_mae: Optional[float] = Field(None, description="Test-set MAE of the model")
    last_known: Optional[dict] = Field(None, description="Most recent measurement used "
                                                         "(date + temp_avg)")


class WeatherRecord(BaseModel):
    date: date_type
    state: str
    district: str = ""
    location: str = ""
    temp_max: float
    temp_min: float
    temp_avg: float
    humidity: float
    rainfall: float


class WeatherResponse(BaseModel):
    state: str
    district: str = ""
    location: str = ""
    count: int
    records: List[WeatherRecord]


class StatesResponse(BaseModel):
    states: List[str]

class DistrictsResponse(BaseModel):
    districts: List[str]

class LocationsResponse(BaseModel):
    locations: List[str]


class HealthResponse(BaseModel):
    status: str
    database: str
    model_loaded: bool
    last_ingested_at: Optional[datetime] = None


class PredictionRecord(BaseModel):
    id: int
    state: str
    district: str = ""
    location: str = ""
    forecast_date: date_type
    predicted_temp_avg: list[float]
    created_at: datetime


class PredictionsResponse(BaseModel):
    count: int
    predictions: List[PredictionRecord]


class ModelInfoResponse(BaseModel):
    model_name: str
    target: str
    features: List[str]
    metrics: dict
    train_period: List[str]
    test_period: List[str]
    trained_through: Optional[str] = None
    q: Optional[float] = None
    coverage_90: Optional[float] = None
    metrics_status: str = "unknown"
    interval_status: str = "unknown"
    evaluation_note: Optional[str] = None


# ---------------------- location weather lookup ----------------------
class LocationOption(BaseModel):
    """A concrete India location returned by the geocoding provider.

    The frontend sends this complete object back to ``/weather/lookup`` so
    weather requests always use the coordinates the person selected, rather
    than trying to infer a nearby city or a state-wide fallback.
    """

    name: str = Field(..., min_length=1, max_length=160)
    district: str = Field("", max_length=160)
    state: str = Field("", max_length=160)
    country: str = Field("India", max_length=160)
    country_code: str = Field("IN", min_length=2, max_length=2)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    scope: Literal["place", "district", "state"] = "place"
    geoname_id: Optional[int] = Field(
        None, ge=1, description="Stable GeoNames identity from the selected geocoding result"
    )

    @field_validator("name", "district", "state", "country", mode="before")
    @classmethod
    def strip_location_text(cls, value: object) -> str:
        return str(value or "").strip()

    @field_validator("country_code", mode="before")
    @classmethod
    def normalize_country_code(cls, value: object) -> str:
        return str(value or "").strip().upper()

    @model_validator(mode="after")
    def require_india_coordinates(self):
        # A broad geographic envelope covers mainland India and the island
        # territories while rejecting accidentally swapped/foreign coordinates.
        if self.country_code != "IN":
            raise ValueError("Only locations in India are supported.")
        if not (6.0 <= self.latitude <= 38.5 and 68.0 <= self.longitude <= 98.5):
            raise ValueError("Location coordinates must be within India.")
        return self


class LocationSearchResponse(BaseModel):
    locations: List[LocationOption]


class LocationWeatherRequest(BaseModel):
    location: LocationOption
    forecast_date: date_type = Field(..., description="Date to retrieve (YYYY-MM-DD).")


class WeatherDay(BaseModel):
    date: date_type
    temperature: float


class LocationWeatherResponse(BaseModel):
    """Normalized result from an ML prediction or a verified provider response."""

    location: LocationOption
    forecast_date: date_type
    source: Literal[
        "ML Prediction",
        "Historical Observations",
        "Historical Reanalysis",
        "Current Weather",
        "Weather API Forecast",
    ]
    temperature: float
    temperature_min: Optional[float] = None
    temperature_max: Optional[float] = None
    humidity: Optional[float] = None
    rainfall: Optional[float] = None
    wind_speed: Optional[float] = None
    weather_code: Optional[int] = None
    weather_description: Optional[str] = None
    forecast: List[WeatherDay] = Field(default_factory=list)
    model: Optional[str] = None
    last_known: Optional[dict] = None
    message: Optional[str] = None
