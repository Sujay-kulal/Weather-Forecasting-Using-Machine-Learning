"""
SQLAlchemy ORM models - the two PostgreSQL tables.

weather_data : historical daily weather per state (imported from the real CSV).
               Only the columns the ML feature pipeline actually needs -
               power-demand variables are intentionally excluded.
predictions  : audit log of every prediction made through the API.
"""
from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WeatherData(Base):
    """One row = daily weather for one state, district, or named location."""
    __tablename__ = "weather_data"
    __table_args__ = (
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


class WeatherLocationMetadata(Base):
    """Catalog identity and provenance for an imported location time series."""
    __tablename__ = "weather_location_metadata"
    __table_args__ = (
        UniqueConstraint(
            "state", "district", "location", name="uq_weather_location_metadata_key"
        ),
        UniqueConstraint(
            "catalog_source", "catalog_record_id", name="uq_weather_location_catalog_id"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    state: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    district: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="")
    location: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="")
    catalog_source: Mapped[str] = mapped_column(String(40), nullable=False)
    catalog_record_id: Mapped[str] = mapped_column(String(40), nullable=False)
    feature_code: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    catalog_license: Mapped[str] = mapped_column(String(120), nullable=False)
    weather_source: Mapped[str] = mapped_column(String(120), nullable=False)
    weather_source_url: Mapped[str] = mapped_column(String(500), nullable=False)
    weather_license: Mapped[str] = mapped_column(String(120), nullable=False)
    imported_start_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    imported_end_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class WeatherImportBatch(Base):
    """Idempotent checkpoint for a location and a historical date window."""
    __tablename__ = "weather_import_batches"
    __table_args__ = (
        UniqueConstraint(
            "location_metadata_id", "start_date", "end_date",
            name="uq_weather_import_location_window",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    location_metadata_id: Mapped[int] = mapped_column(
        ForeignKey("weather_location_metadata.id", ondelete="CASCADE"), nullable=False, index=True
    )
    start_date: Mapped[object] = mapped_column(Date, nullable=False)
    end_date: Mapped[object] = mapped_column(Date, nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Prediction(Base):
    """One row = one prediction generated through POST /predict."""
    __tablename__ = "predictions"
    __table_args__ = (
        UniqueConstraint("state", "district", "location", "forecast_date", "created_at", name="uq_prediction_run_dist_loc"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    state: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    district: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="", index=True)
    location: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="", index=True)
    forecast_date: Mapped[object] = mapped_column(Date, nullable=False, index=True)
    predicted_temp_avg: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
