"""
SQLAlchemy ORM models - the two PostgreSQL tables.

weather_data : historical daily weather per state (imported from the real CSV).
               Only the columns the ML feature pipeline actually needs -
               power-demand variables are intentionally excluded.
predictions  : audit log of every prediction made through the API.
"""
from sqlalchemy import Column, Date, DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WeatherData(Base):
    """One row = weather measurements for one state on one day."""
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
    predicted_temp_avg: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
