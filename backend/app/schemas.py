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
class PredictionResponse(BaseModel):
    state: str
    district: str = ""
    location: str = ""
    forecast_date: date_type
    predicted_temp_avg: list[float] = Field(..., description="Predicted Temp_Avg for next 7 days in deg C")
    unit: str = "deg C"
    model: str = Field(..., description="Model name that produced the prediction")
    typical_error_mae: Optional[float] = Field(None, description="Test-set MAE of the model")
    last_known: Optional[dict] = Field(None, description="Most recent measurement used "
                                                         "(date + temp_avg)")

    @field_validator("predicted_temp_avg", mode="before")
    @classmethod
    def normalize_predictions(cls, values):
        return [normalize_temperature(value) for value in values]

    @field_validator("last_known", mode="before")
    @classmethod
    def normalize_last_known(cls, value):
        if isinstance(value, dict) and "temp_avg" in value:
            value = {**value, "temp_avg": normalize_temperature(value["temp_avg"])}
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
