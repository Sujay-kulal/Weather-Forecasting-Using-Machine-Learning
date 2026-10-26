"""
Pydantic schemas - API request/response contracts.

These drive the automatic Swagger documentation at /docs.
"""
from datetime import date as date_type
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


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
