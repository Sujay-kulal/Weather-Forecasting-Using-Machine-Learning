"""GET /health - application + PostgreSQL + model status."""
from fastapi import APIRouter, Response

from app.database import check_connection
from app.schemas import HealthResponse
from app.services import model_service
from app.services.ingestion_service import get_last_ingested_at

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(response: Response):
    db_ok = check_connection()
    model_ok = pipeline_loaded()
    if not db_ok or not model_ok:
        response.status_code = 503
    return HealthResponse(
        status="healthy" if db_ok and model_ok else "degraded",
        database="connected" if db_ok else "unreachable",
        model_loaded=model_ok,
        last_ingested_at=get_last_ingested_at(),
    )


def pipeline_loaded() -> bool:
    try:
        return model_service.pipeline is not None
    except Exception:
        return False
