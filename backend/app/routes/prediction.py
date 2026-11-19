"""
Prediction endpoints.

POST /predict implements the Phase 2 pipeline:
  PostgreSQL -> 7 records before D-1 (training row for target D) -> exact 20
  training features -> weather_model_v3.joblib -> predicted Temp_Avg ->
  predictions table -> JSON response. No future data, no stale data,
  no hardcoded values.
"""
from collections import defaultdict
import logging
from datetime import date as date_type, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Prediction, WeatherData
from app.schemas import (ModelInfoResponse, PredictionRecord, PredictionRequest,
                         PredictionResponse, PredictionsResponse, LiveMetricsResponse)
from app.services import feature_service, model_service, open_meteo_service, weather_forecast_service
from app.services.metrics_service import rolling_live_metrics
from app.services.prediction_store import upsert_prediction
from app.services.resolve_location import resolve_location
from app.services.temperature import round_temperature
from app.services.feature_service import REQUIRED_HISTORY
from app.services.prediction_cache import prediction_cache as prediction_cache

logger = logging.getLogger("prediction")
router = APIRouter(tags=["prediction"])

@router.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest, req: Request, db: Session = Depends(get_db)):
    # 1. Reject district and location inputs: ML model only supports state-level forecasts
    if (request.district and request.district.strip()) or (request.location and request.location.strip()):
        raise HTTPException(
            422,
            detail="The deployed machine learning model only supports statewide forecasts for the 33 validated states/UTs. District- and location-level ML predictions are not supported.",
        )

    # 2. Validate the state against the supported 33 states/UTs
    canonical = request.state.strip().title()
    supported_states = set(model_service.model_info.get("states", []))
    if canonical not in supported_states or canonical == "Other":
        raise HTTPException(
            422,
            detail=f"State '{request.state}' is not supported by the deployed ML model.",
        )

    # Validate against database
    canonical, _, _ = resolve_location(canonical, "", "", db)

    # 3. Reproduce the training row t = D-1: its lags/rolls come from the
    #    7 records STRICTLY BEFORE D-1 (measurements D-2 ... D-8) and its
    #    target is day D. `date < asof` guarantees no future-data leakage.
    if request.forecast_date < date_type.min + timedelta(days=REQUIRED_HISTORY + 1):
        raise HTTPException(422, detail="Forecast date is too early to build the required history.")
    asof = request.forecast_date - timedelta(days=1)
    today = getattr(req.app.state, "today", None) or open_meteo_service.india_today()
    history = db.execute(
        select(WeatherData)
        .where(
            WeatherData.state == canonical,
            WeatherData.district == "",
            WeatherData.location == "",
            WeatherData.date < asof,
            WeatherData.date < today,
        )
        .order_by(WeatherData.date.desc())
        .limit(REQUIRED_HISTORY)
    ).scalars().all()

    loc_str = canonical

    if len(history) < REQUIRED_HISTORY:
        raise HTTPException(
            422,
            detail=f"Insufficient historical data for '{loc_str}' before "
                   f"{request.forecast_date}: need {REQUIRED_HISTORY} records "
                   f"prior to {asof}, found {len(history)}."
        )

    try:
        predicted = model_service.predict_for_history(
            history, canonical, asof, today=today, pipeline=getattr(req.app.state, "pipeline", None),
        )
    except feature_service.InsufficientHistoryError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Model prediction failed for %s", canonical)
        raise HTTPException(500, detail="Model prediction failed due to an internal server error.") from exc

    # 6. Store the prediction audit record (MUST write on every call, including cache hits)
    upsert_prediction(
        db,
        state=canonical,
        district="",
        location="",
        forecast_date=request.forecast_date,
        predicted_temp_avg=predicted,
        model_version=model_service.MODEL_VERSION,
    )

    daily_forecasts, weather_summary = weather_forecast_service.build_daily_forecasts(
        history=history,
        forecast_date=request.forecast_date,
        predicted_temp_avg=predicted,
    )

    last_record = history[0]
    last_known = {
        "date": str(last_record.date),
        "temp_avg": last_record.temp_avg,
        "temp_min": getattr(last_record, "temp_min", None),
        "temp_max": getattr(last_record, "temp_max", None),
        "humidity": getattr(last_record, "humidity", None),
        "rainfall": getattr(last_record, "rainfall", None),
    }

    return PredictionResponse(
        state=canonical,
        district="",
        location="",
        forecast_date=request.forecast_date,
        predicted_temp_avg=[round_temperature(p) for p in predicted],
        unit="deg C",
        model=model_service.MODEL_NAME,
        typical_error_mae=model_service.MODEL_MAE,
        last_known=last_known,
        daily_forecasts=daily_forecasts,
        weather_summary=weather_summary,
    )


@router.get("/predictions", response_model=PredictionsResponse)
def prediction_history(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    state: str | None = Query(None, min_length=1, max_length=100),
    model_version: str | None = Query(None, min_length=1, max_length=100),
    q: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
):
    """Paginated prediction history with optional state and model filters."""
    filters = []
    if state:
        filters.append(func.lower(Prediction.state) == state.strip().casefold())
    if model_version:
        filters.append(Prediction.model_version == model_version.strip())
    if q and (term := q.strip().lower()):
        filters.append(or_(*(
            func.lower(column).contains(term, autoescape=True)
            for column in (cast(Prediction.id, String), Prediction.state, Prediction.district,
                           Prediction.location, cast(Prediction.forecast_date, String))
        )))

    total = db.execute(
        select(func.count()).select_from(Prediction).where(*filters)
    ).scalar_one()
    stored_count = db.scalar(select(func.count()).select_from(Prediction)) if filters else total
    rows = db.execute(
        select(Prediction).where(*filters)
        .order_by(Prediction.created_at.desc(), Prediction.id.desc())
        .offset(offset).limit(limit)
    ).scalars().all()
    model_versions = list(db.scalars(
        select(Prediction.model_version).where(Prediction.model_version.is_not(None))
        .distinct().order_by(Prediction.model_version)
    ))
    return PredictionsResponse(
        count=total,
        predictions=[PredictionRecord(id=r.id, state=r.state, district=r.district, location=r.location,
                                      forecast_date=r.forecast_date,
                                      predicted_temp_avg=r.predicted_temp_avg,
                                      model_version=r.model_version,
                                      actual_temp=r.actual_temp,
                                      created_at=r.created_at) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
        stored_count=stored_count,
        model_versions=model_versions,
    )


@router.get("/model-info", response_model=ModelInfoResponse)
def model_info(response: Response):
    """Information about the trained model (from model/model_info.json)."""
    response.headers["Cache-Control"] = "public, max-age=300"
    info = model_service.model_info
    return ModelInfoResponse(
        model_name=info["best_model"],
        loaded_artifact_version=model_service.MODEL_VERSION,
        target=info["target"],
        features=info["features"],
        metrics=info["metrics"],
        train_period=info["train_period"],
        test_period=info["test_period"],
        calibration_period=info.get("calibration_period"),
        metrics_status=info.get("metrics_status"),
        validated_for_artifact=model_service.evaluation_matches_loaded_artifact,
        trained_through=info.get("trained_through") or (info.get("evaluation") or {}).get("artifact_trained_through"),
        evaluation_note=info.get("evaluation_note"),
        interval_status=info.get("interval_status"),
        evaluation=info.get("evaluation"),
    )


@router.get("/metrics/live", response_model=LiveMetricsResponse)
def live_metrics(db: Session = Depends(get_db)):
    """Rolling 30-day MAE for saved model versions against persistence."""
    return rolling_live_metrics(db, prospective_only=True)


@router.get("/forecast/all", response_model=dict[str, float])
def forecast_all(
    req: Request,
    day: int = Query(1, ge=1, le=7, description="Forecast horizon day, from 1 to 7"),
    date: date_type | None = Query(None, description="Forecast start date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """Return one selected horizon value per model-supported state."""
    today = getattr(req.app.state, "today", None) or open_meteo_service.india_today()
    states = [state for state in model_service.model_info.get("states", []) if state != "Other"]
    statewide = (
        WeatherData.state.in_(states),
        WeatherData.district == "",
        WeatherData.location == "",
        WeatherData.date < today,
    )
    if date is None:
        latest_date = db.scalar(select(func.max(WeatherData.date)).where(*statewide))
        if latest_date is None:
            raise HTTPException(404, detail="No completed weather data available for model states.")
        date = latest_date + timedelta(days=2)
    if date < date_type.min + timedelta(days=REQUIRED_HISTORY + 1):
        raise HTTPException(422, detail="Forecast date is too early to build the required history.")
    asof = date - timedelta(days=1)

    history_by_state = defaultdict(list)
    rows = db.scalars(
        select(WeatherData)
        .where(*statewide, WeatherData.date >= asof - timedelta(days=REQUIRED_HISTORY), WeatherData.date < asof)
        .order_by(WeatherData.state, WeatherData.date.desc())
    )
    for row in rows:
        history_by_state[row.state].append(row)

    pipeline = getattr(req.app.state, "pipeline", None)
    results = {}
    for state, history in history_by_state.items():
        try:
            forecast = model_service.predict_for_history(history, state, asof, today=today, pipeline=pipeline)
        except feature_service.InsufficientHistoryError:
            continue
        except Exception as exc:
            logger.exception("Map forecast failed for %s", state)
            raise HTTPException(500, detail="Model prediction failed due to an internal server error.") from exc
        results[state] = round_temperature(forecast[day - 1])
    return results
