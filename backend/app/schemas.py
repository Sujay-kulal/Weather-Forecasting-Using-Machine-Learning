"""
Pydantic schemas - API request/response contracts.

These drive the automatic Swagger documentation at /docs.
"""
from datetime import date as date_type
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.services.temperature import normalize_temperature


# ----------------------------- requests -----------------------------
class PredictionRequest(BaseModel):
    state: str = Field(..., min_length=1, description="Indian state name, e.g. 'Karnataka'")
    district: Optional[str] = Field("", description="District name, e.g. 'Udupi'")
    location: Optional[str] = Field("", description="Location name, e.g. 'Kundapura'")
    forecast_date: date_type = Field(..., description="Day to forecast (YYYY-MM-DD). "
                                                      "Must have 7 days of history before it.")


# ----------------------------- responses -----------------------------
class DayForecast(BaseModel):
    day: int = Field(..., description="Horizon day index 1 to 7")
    date: date_type = Field(..., description="Forecast date (YYYY-MM-DD)")
    temp_avg: float = Field(..., description="Predicted average temperature in deg C")
    temp_min: float = Field(..., description="Predicted low temperature in deg C")
    temp_max: float = Field(..., description="Predicted high temperature in deg C")
    feels_like: float = Field(..., description="Apparent / 'feels like' temperature in deg C")
    humidity: float = Field(..., description="Estimated relative humidity in %")
    rainfall: float = Field(..., description="Expected precipitation in mm")
    rain_probability: int = Field(..., description="Chance of rain in % (0-100)")
    condition: str = Field(..., description="Weather condition status, e.g. 'Clear & Sunny'")
    condition_icon: str = Field(..., description="Icon identifier, e.g. 'sun', 'cloud-sun', 'rain'")
    comfort: str = Field(..., description="Comfort category, e.g. 'Pleasant & Comfortable'")
    dew_point: float = Field(..., description="Estimated dew point in deg C")
    summary: str = Field(..., description="Brief day summary and advisory")

    @field_validator("temp_avg", "temp_min", "temp_max", "feels_like", "dew_point", mode="before")
    @classmethod
    def normalize_day_temperatures(cls, value):
        return normalize_temperature(value)


class PredictionResponse(BaseModel):
    state: str
    district: str = ""
    location: str = ""
    forecast_date: date_type
    predicted_temp_avg: list[float] = Field(..., description="Predicted Temp_Avg for next 7 days in deg C")
    unit: str = "deg C"
    model: str = Field(..., description="Model name that produced the prediction")
    typical_error_mae: Optional[float] = Field(None, description="Test-set MAE of the model")
    last_known: Optional[dict] = Field(None, description="Most recent measurement used")
    daily_forecasts: Optional[List[DayForecast]] = Field(None, description="Comprehensive 7-day multi-parameter forecasts")
    weather_summary: Optional[str] = Field(None, description="Overall summary of the 7-day forecast")

    @field_validator("predicted_temp_avg", mode="before")
    @classmethod
    def normalize_predictions(cls, values):
        return [normalize_temperature(value) for value in values]

    @field_validator("last_known", mode="before")
    @classmethod
    def normalize_last_known(cls, value):
        if isinstance(value, dict):
            for k in ("temp_avg", "temp_min", "temp_max"):
                if k in value and value[k] is not None:
                    value[k] = normalize_temperature(value[k])
        return value


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

    @field_validator("temp_max", "temp_min", "temp_avg", mode="before")
    @classmethod
    def normalize_weather_temperatures(cls, value):
        return normalize_temperature(value)


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
    model_version: Optional[str] = None
    actual_temp: Optional[float] = None
    created_at: datetime

    @field_validator("predicted_temp_avg", mode="before")
    @classmethod
    def normalize_predictions(cls, values):
        return [normalize_temperature(value) for value in values]

    @field_validator("actual_temp", mode="before")
    @classmethod
    def normalize_actual(cls, value):
        return normalize_temperature(value) if value is not None else value


class PredictionsResponse(BaseModel):
    count: int
    predictions: List[PredictionRecord]
    total: int
    limit: int
    offset: int


class LiveModelMetrics(BaseModel):
    model_version: str
    sample_count: int
    model_mae: Optional[float] = None
    persistence_mae: Optional[float] = None
    skill_vs_persistence: Optional[float] = None


class LiveMetricsResponse(BaseModel):
    rolling_days: int
    period_start: date_type
    period_end: date_type
    models: List[LiveModelMetrics]


class ModelInfoResponse(BaseModel):
    model_name: str
    loaded_artifact_version: str
    target: str
    features: List[str]
    metrics: dict
    train_period: List[str]
    test_period: List[str]
    calibration_period: Optional[List[str]] = None
    metrics_status: Optional[str] = None
    validated_for_artifact: Optional[bool] = None
    evaluation: Optional[dict] = None
