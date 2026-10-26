"""Actual outcome backfill and rolling live forecast metrics."""
from collections import defaultdict
from datetime import date as date_type, timedelta
from math import fsum
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Prediction, WeatherData


def india_today() -> date_type:
    from datetime import datetime
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def fill_missing_actuals(db: Session | None = None, *, today: date_type | None = None) -> int:
    """Fill past predictions from the exact matching weather series only."""
    owns_session = db is None
    session = db or SessionLocal()
    try:
        as_of = today or india_today()
        matches = session.execute(
            select(Prediction.id, WeatherData.temp_avg)
            .join(
                WeatherData,
                (WeatherData.state == Prediction.state)
                & (func.coalesce(WeatherData.district, "") == func.coalesce(Prediction.district, ""))
                & (func.coalesce(WeatherData.location, "") == func.coalesce(Prediction.location, ""))
                & (WeatherData.date == Prediction.forecast_date),
            )
            .where(Prediction.actual_temp.is_(None), Prediction.forecast_date < as_of)
        ).all()
        for prediction_id, actual in matches:
            session.execute(
                update(Prediction)
                .where(Prediction.id == prediction_id, Prediction.actual_temp.is_(None))
                .values(actual_temp=actual)
            )
        session.commit()
        return len(matches)
    except Exception:
        session.rollback()
        raise
    finally:
        if owns_session:
            session.close()


def rolling_live_metrics(
    db: Session,
    *,
    today: date_type | None = None,
    rolling_days: int = 30,
) -> dict:
    """Compare stored model forecasts and persistence on identical outcomes."""
    as_of = today or india_today()
    period_start = as_of - timedelta(days=rolling_days)
    period_end = as_of - timedelta(days=1)
    predictions = db.execute(
        select(Prediction)
        .where(
            Prediction.forecast_date >= period_start,
            Prediction.forecast_date <= period_end,
            Prediction.actual_temp.is_not(None),
            Prediction.model_version.is_not(None),
        )
        .order_by(Prediction.forecast_date, Prediction.id)
    ).scalars().all()
    if not predictions:
        return {
            "rolling_days": rolling_days,
            "period_start": period_start,
            "period_end": period_end,
            "models": [],
        }

    start_history = period_start - timedelta(days=1)
    weather = db.execute(
        select(WeatherData).where(
            WeatherData.date >= start_history,
            WeatherData.date < as_of,
        )
    ).scalars().all()
    history_by_key = {
        (row.state, row.district or "", row.location or "", row.date): float(row.temp_avg)
        for row in weather
    }

    errors: dict[str, tuple[list[float], list[float]]] = defaultdict(lambda: ([], []))
    for prediction in predictions:
        prior_date = prediction.forecast_date - timedelta(days=1)
        key = (prediction.state, prediction.district or "", prediction.location or "", prior_date)
        persistence = history_by_key.get(key)
        if persistence is None:
            continue
        forecast = prediction.predicted_temp_avg
        if not isinstance(forecast, list) or not forecast:
            continue
        try:
            predicted_temp = float(forecast[0])
            actual_temp = float(prediction.actual_temp)
        except (TypeError, ValueError):
            continue
        model_errors, persistence_errors = errors[prediction.model_version]
        model_errors.append(abs(predicted_temp - actual_temp))
        persistence_errors.append(abs(persistence - actual_temp))

    summaries = []
    for version, (model_errors, persistence_errors) in sorted(errors.items()):
        model_mae = fsum(model_errors) / len(model_errors) if model_errors else None
        persistence_mae = fsum(persistence_errors) / len(persistence_errors) if persistence_errors else None
        skill = (
            1 - model_mae / persistence_mae
            if model_mae is not None and persistence_mae not in (None, 0)
            else None
        )
        summaries.append({
            "model_version": version,
            "sample_count": len(model_errors),
            "model_mae": model_mae,
            "persistence_mae": persistence_mae,
            "skill_vs_persistence": skill,
        })
    return {
        "rolling_days": rolling_days,
        "period_start": period_start,
        "period_end": period_end,
        "models": summaries,
    }
