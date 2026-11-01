"""
SQLAlchemy ORM models - the PostgreSQL tables.

weather_data : historical daily weather per state (imported from the real CSV).
               Only the columns the ML feature pipeline actually needs -
               power-demand variables are intentionally excluded.
predictions  : audit log of every prediction made through the API.
weather_location_metadata: catalog metadata for resolved locations.
weather_import_batches: batch audit history for location weather imports.
"""
from datetime import date, datetime
from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WeatherData(Base):
    """One row = weather measurements for one state on one day."""
    __tablename__ = "weather_data"
    __table_args__ = (
        UniqueConstraint("state", "district", "location", "date", name="uq_weather_state_dist_loc_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
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
    forecast_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    predicted_temp_avg: Mapped[list] = mapped_column(JSON, nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    actual_temp: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
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
    feature_code: Mapped[str] = mapped_column(String(10), nullable=False, default="", server_default="")
    population: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    latitude: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0.0")
    longitude: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0.0")
    catalog_license: Mapped[str] = mapped_column(String(50), nullable=False, default="", server_default="")
    weather_source: Mapped[str] = mapped_column(String(200), nullable=False, default="", server_default="")
    weather_source_url: Mapped[str] = mapped_column(String(500), nullable=False, default="", server_default="")
    weather_license: Mapped[str] = mapped_column(String(50), nullable=False, default="", server_default="")
    imported_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    imported_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    batches: Mapped[list["WeatherImportBatch"]] = relationship(
        "WeatherImportBatch", back_populates="location_metadata", cascade="all, delete-orphan"
    )


class WeatherImportBatch(Base):
    """Audit record for a single import batch window for a location."""
    __tablename__ = "weather_import_batches"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_wib_date_range"),
        CheckConstraint("row_count >= 0", name="ck_wib_row_count_positive"),
        UniqueConstraint("location_metadata_id", "start_date", "end_date", name="uq_wib_loc_window"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    location_metadata_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("weather_location_metadata.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    location_metadata: Mapped["WeatherLocationMetadata"] = relationship(
        "WeatherLocationMetadata", back_populates="batches"
    )
