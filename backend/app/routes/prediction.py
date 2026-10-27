"""
Prediction endpoints.

POST /predict implements the Phase 2 pipeline:
  PostgreSQL -> 7 records before D-1 (training row for target D) -> exact 13
  training features -> weather_model.joblib -> predicted Temp_Avg ->
  predictions table -> JSON response. No future data, no stale data,
  no hardcoded values.
"""
from datetime import date as date_type, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Prediction, WeatherData
from app.schemas import (ModelInfoResponse, PredictionRecord, PredictionRequest,
                         PredictionResponse, PredictionsResponse, LiveMetricsResponse)
from app.services import feature_service, model_service, weather_forecast_service
from app.services.metrics_service import rolling_live_metrics
from app.services.prediction_store import upsert_prediction
from app.services.temperature import round_temperature
from app.services.feature_service import (MAX_STALENESS_DAYS, REQUIRED_HISTORY,
                                          build_features)
from app.services.prediction_cache import prediction_cache

router = APIRouter(tags=["prediction"])

def _resolve_location_predict(state: str, district: str, location: str, db: Session):
    canonical_state = state.strip().title()
    dist = district.strip()
    loc = location.strip()

    exists = db.execute(
        select(func.count()).select_from(WeatherData).where(
            WeatherData.state == canonical_state,
            WeatherData.district == dist,
            WeatherData.location == loc
        )
    ).scalar_one()

    if not exists:
        if dist == "" and loc == "":
            raise HTTPException(404, detail=f"Unknown state '{state}'. Call GET /states for the available names.")
        elif loc == "":
            raise HTTPException(404, detail=f"Unknown district '{district}' in state '{state}'.")
        else:
            raise HTTPException(404, detail=f"Unknown location '{location}' in district '{district}', state '{state}'.")

    return canonical_state, dist, loc

@router.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest, req: Request, db: Session = Depends(get_db)):
    # 1. Validate the state/district/location against the database
    canonical, dist, loc = _resolve_location_predict(
        request.state, request.district or "", request.location or "", db
    )

    # 2. Reproduce the training row t = D-1: its lags/rolls come from the
    #    7 records STRICTLY BEFORE D-1 (measurements D-2 ... D-8) and its
    #    target is day D. `date < asof` guarantees no future-data leakage.
    asof = request.forecast_date - timedelta(days=1)
    history = db.execute(
        select(WeatherData)
        .where(
            WeatherData.state == canonical,
            WeatherData.district == dist,
            WeatherData.location == loc,
            WeatherData.date < asof
        )
        .order_by(WeatherData.date.desc())
        .limit(REQUIRED_HISTORY)
    ).scalars().all()

    loc_str = canonical if not loc else f"{canonical}/{dist}/{loc}"

    if len(history) < REQUIRED_HISTORY:
        raise HTTPException(
            422,
            detail=f"Insufficient historical data for '{loc_str}' before "
                   f"{request.forecast_date}: need {REQUIRED_HISTORY} records "
                   f"prior to {asof}, found {len(history)}."
        )

    # 3. Refuse stale history: if the newest usable record is far older than
    #    D-1, this is not a genuine next-day forecast anymore.
    staleness = (asof - history[0].date).days
    if staleness > MAX_STALENESS_DAYS:
        raise HTTPException(
            422,
            detail=f"No recent measurements before {request.forecast_date} "
                   f"(latest available for '{loc_str}' is {history[0].date}). "
                   f"A forecast needs data up to ~2 days before the target date.",
        )

    # 4. Check TTLCache for prediction computation, keyed (state, target_date, latest_data_date)
    cache_key = (canonical, request.forecast_date, history[0].date)
    if cache_key in prediction_cache:
        predicted = prediction_cache[cache_key]
    else:
        # Build features and predict with saved model (from app.state if available)
        try:
            features = build_features(history, canonical, asof)
            pipeline = getattr(req.app.state, "pipeline", None)
            predicted = model_service.predict(features, pipeline=pipeline)
            prediction_cache[cache_key] = predicted
        except feature_service.InsufficientHistoryError as exc:
            raise HTTPException(422, detail=str(exc))
        except Exception as exc:  # model failure -> honest 500, never fake values
            raise HTTPException(500, detail=f"Model prediction failed: {exc}")

    # 5. Store the prediction audit record (MUST write on every call, including cache hits)
    upsert_prediction(
        db,
        state=canonical,
        district=dist,
        location=loc,
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
        district=dist,
        location=loc,
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
    db: Session = Depends(get_db),
):
    """Paginated prediction history with optional state and model filters."""
    filters = []
    if state:
        filters.append(func.lower(Prediction.state) == state.strip().casefold())
    if model_version:
        filters.append(Prediction.model_version == model_version.strip())

    total = db.execute(
        select(func.count()).select_from(Prediction).where(*filters)
    ).scalar_one()
    rows = db.execute(
        select(Prediction).where(*filters)
        .order_by(Prediction.created_at.desc(), Prediction.id.desc())
        .offset(offset).limit(limit)
    ).scalars().all()
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
        validated_for_artifact=info.get("validated_for_artifact"),
        evaluation=info.get("evaluation"),
    )


@router.get("/metrics/live", response_model=LiveMetricsResponse)
def live_metrics(db: Session = Depends(get_db)):
    """Rolling 30-day MAE for saved model versions against persistence."""
    return rolling_live_metrics(db)


@router.get("/forecast/all", response_model=dict[str, float])
def forecast_all(
    req: Request,
    day: int = Query(1, ge=1, le=7, description="Forecast horizon day, from 1 to 7"),
    date: date_type | None = Query(None, description="Forecast start date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """Return one selected horizon value per model-supported state."""
    if date is None:
        latest_date = db.execute(
            select(func.max(WeatherData.date)).where(
                WeatherData.state != "Other",
                WeatherData.district == "",
                WeatherData.location == "",
            )
        ).scalar()
        if latest_date is None:
            raise HTTPException(404, detail="No weather data available")
        target_date = latest_date + timedelta(days=2)
    else:
        target_date = date

    asof = target_date - timedelta(days=1)
    pipeline = getattr(req.app.state, "pipeline", None)
    states = [state for state in model_service.model_info.get("states", []) if state != "Other"]
    results: dict[str, float] = {}
    for state in states:
        history = db.execute(
            select(WeatherData)
            .where(
                WeatherData.state == state,
                WeatherData.district == "",
                WeatherData.location == "",
                WeatherData.date < asof,
            )
            .order_by(WeatherData.date.desc())
            .limit(REQUIRED_HISTORY)
        ).scalars().all()
        if len(history) < REQUIRED_HISTORY or (asof - history[0].date).days > MAX_STALENESS_DAYS:
            continue
        key = (state, target_date, history[0].date)
        try:
            predicted = prediction_cache.get(key)
            if predicted is None:
                features = build_features(history, state, asof)
                predicted = model_service.predict(features, pipeline=pipeline)
                prediction_cache[key] = predicted
            if len(predicted) >= day:
                results[state] = round_temperature(predicted[day - 1])
        except Exception:
            continue
    return results
