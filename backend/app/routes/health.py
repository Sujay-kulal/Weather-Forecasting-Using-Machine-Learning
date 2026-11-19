"""GET /health - application + PostgreSQL + model status."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import check_connection, get_db
from app.models import Prediction, WeatherData
from app.schemas import HealthResponse
from app.services import model_service
from app.services.ingestion_service import get_last_ingested_at

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health():
    db_ok = check_connection()
    return HealthResponse(
        status="healthy" if db_ok else "degraded",
        database="connected" if db_ok else "unreachable",
        model_loaded=pipeline_loaded(),
        last_ingested_at=get_last_ingested_at(),
    )


def pipeline_loaded() -> bool:
    try:
        return model_service.pipeline is not None
    except Exception:
        return False


@router.get("/ready", include_in_schema=False)
def readiness(db: Session = Depends(get_db)):
    if not pipeline_loaded():
        raise HTTPException(503, detail="Model is unavailable.")
    try:
        db.execute(select(WeatherData).limit(0))
        db.execute(select(Prediction).limit(0))
    except SQLAlchemyError as exc:
        raise HTTPException(503, detail="Weather database or schema is unavailable.") from exc
    return {"status": "ready"}
