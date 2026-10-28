"""
SQLAlchemy ORM models - the two PostgreSQL tables.

weather_data : historical daily weather per state (imported from the real CSV).
               Only the columns the ML feature pipeline actually needs -
               power-demand variables are intentionally excluded.
predictions  : audit log of every prediction made through the API.
"""
from sqlalchemy import Column, Date, DateTime, Float, Integer, String, UniqueConstraint, func, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WeatherData(Base):
    """One row = weather measurements for one state on one day."""
    __tablename__ = "weather_data"
    __table_args__ = (
        UniqueConstraint("state", "date", name="uq_weather_state_date"),
        UniqueConstraint("state", "district", "location", "date", name="uq_weather_state_dist_loc_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[object] = mapped_column(Date, nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    district: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="", index=True)
    location: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="", index=True)
    temp_max: Mapped[float] = mapped_column(Float, nullable=False)
    temp_min: Mapped[float] = mapped_column(Float, nullable=False)
    temp_avg: Mapped[float] = mapped_column(Float, nullable=False)
    humidity: Mapped[float] = mapped_column(Float, nullable=False)
    rainfall: Mapped[float] = mapped_column(Float, nullable=False)


class Prediction(Base):
    """One row = one prediction generated through POST /predict."""
    __tablename__ = "predictions"
    __table_args__ = (
        UniqueConstraint("state", "district", "location", "forecast_date", "created_at", name="uq_prediction_run_dist_loc"),
        UniqueConstraint(
            "state", "district", "location", "forecast_date", "model_version",
            name="uq_prediction_state_location_date_model_version",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    state: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    district: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="", index=True)
    location: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="", index=True)
    forecast_date: Mapped[object] = mapped_column(Date, nullable=False, index=True)
    predicted_temp_avg: Mapped[list] = mapped_column(JSON, nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    actual_temp: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )



class WeatherLocationMetadata(Base):
    """Links a geocoding catalog record (e.g. GeoNames ID) to the exact
    (state, district, location) triple used in ``weather_data``.

    This allows the location-weather service to resolve an Open-Meteo
    geocoder result to the correct database series without guessing.
    """
    __tablename__ = "weather_location_metadata"
    __table_args__ = (
        UniqueConstraint("catalog_source", "catalog_record_id", "state",
                         name="uq_wlm_catalog_state"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    catalog_source: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    catalog_record_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    district: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="")
    location: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="")
