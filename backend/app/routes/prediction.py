"""
Prediction endpoints.

POST /predict implements the Phase 2 pipeline:
  PostgreSQL -> 7 records before D-1 (training row for target D) -> exact 13
  training features -> weather_model.joblib -> predicted Temp_Avg ->
  predictions table -> JSON response. No future data, no stale data,
  no hardcoded values.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Prediction, WeatherData
from app.schemas import (ModelInfoResponse, PredictionRecord, PredictionRequest,
                         PredictionResponse, PredictionsResponse)
from app.services import feature_service, model_service
from app.services.feature_service import (MAX_STALENESS_DAYS, REQUIRED_HISTORY,
                                          build_features)

router = APIRouter(tags=["prediction"])


@router.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest, db: Session = Depends(get_db)):
    # 1. Validate the state against the database (not a hardcoded list)
    canonical = request.state.strip().title()
    exists = db.execute(
        select(func.count()).select_from(WeatherData).where(WeatherData.state == canonical)
    ).scalar_one()
    if not exists:
        raise HTTPException(404, detail=f"Unknown state '{request.state}'. "
                                        f"Call GET /states for the available names.")

    # 2. Reproduce the training row t = D-1: its lags/rolls come from the
    #    7 records STRICTLY BEFORE D-1 (measurements D-2 ... D-8) and its
    #    target is day D. `date < asof` guarantees no future-data leakage.
    asof = request.forecast_date - timedelta(days=1)
    history = db.execute(
        select(WeatherData)
        .where(WeatherData.state == canonical, WeatherData.date < asof)
        .order_by(WeatherData.date.desc())
        .limit(REQUIRED_HISTORY)
    ).scalars().all()

    if len(history) < REQUIRED_HISTORY:
        raise HTTPException(
            422,
            detail=f"Insufficient historical data for '{canonical}' before "
                   f"{request.forecast_date}: need {REQUIRED_HISTORY} records "
                   f"prior to {asof}, found {len(history)}. Data starts 2023-04-01.",
        )

    # 3. Refuse stale history: if the newest usable record is far older than
    #    D-1, this is not a genuine next-day forecast anymore.
    staleness = (asof - history[0].date).days
    if staleness > MAX_STALENESS_DAYS:
        raise HTTPException(
            422,
            detail=f"No recent measurements before {request.forecast_date} "
                   f"(latest available for '{canonical}' is {history[0].date}). "
                   f"A forecast needs data up to ~2 days before the target date.",
        )

    # 4. Build the exact 13 training features and predict with the saved model
    try:
        features = build_features(history, canonical, asof)
        predicted = model_service.predict(features)
    except feature_service.InsufficientHistoryError as exc:
        raise HTTPException(422, detail=str(exc))
    except Exception as exc:  # model failure -> honest 500, never fake values
        raise HTTPException(500, detail=f"Model prediction failed: {exc}")

    # 5. Store the prediction audit record
    record = Prediction(state=canonical, forecast_date=request.forecast_date,
                        predicted_temp_avg=predicted)
    db.add(record)
    db.commit()

    return PredictionResponse(
        state=canonical,
        forecast_date=request.forecast_date,
        predicted_temp_avg=round(predicted, 2),
        model=model_service.MODEL_NAME,
        typical_error_mae=model_service.MODEL_MAE,
        last_known={"date": str(history[0].date), "temp_avg": history[0].temp_avg},
    )


@router.get("/predictions", response_model=PredictionsResponse)
def prediction_history(limit: int = Query(50, ge=1, le=500),
                       offset: int = Query(0, ge=0),
                       db: Session = Depends(get_db)):
    """Previously generated predictions, newest first."""
    rows = db.execute(
        select(Prediction).order_by(Prediction.created_at.desc(), Prediction.id.desc())
        .offset(offset).limit(limit)
    ).scalars().all()
    return PredictionsResponse(
        count=len(rows),
        predictions=[PredictionRecord(id=r.id, state=r.state, forecast_date=r.forecast_date,
                                      predicted_temp_avg=r.predicted_temp_avg,
                                      created_at=r.created_at) for r in rows],
    )


@router.get("/model-info", response_model=ModelInfoResponse)
def model_info():
    """Information about the trained model (from model/model_info.json)."""
    info = model_service.model_info
    return ModelInfoResponse(
        model_name=info["best_model"],
        target=info["target"],
        features=info["features"],
        metrics=info["metrics"],
        train_period=info["train_period"],
        test_period=info["test_period"],
    )
