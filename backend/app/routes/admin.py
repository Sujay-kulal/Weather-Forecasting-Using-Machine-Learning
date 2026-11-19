"""
Admin endpoints.
POST /admin/ingest triggers the weather ingestion job, guarded by X-Admin-Token header.
"""
import logging
import os
import secrets
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query
from app.schemas import IngestionResponse
from app.services.ingestion_service import IngestionConfigurationError, run_ingestion_with_lock

logger = logging.getLogger("admin")
router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/ingest", response_model=IngestionResponse, response_model_exclude_unset=True)
def admin_ingest(
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
    days_back: int = Query(7, ge=1, le=90)
):
    expected_token = os.environ.get("ADMIN_TOKEN", "").strip()
    if not expected_token or not x_admin_token or not secrets.compare_digest(
        x_admin_token.encode("utf-8"), expected_token.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Unauthorized: invalid or missing X-Admin-Token")

    try:
        result = run_ingestion_with_lock(days_back=days_back)
        # Total failure when 100% of states fail to ingest from upstream provider
        if isinstance(result, dict) and result.get("status") == "failed":
            raise HTTPException(status_code=502, detail=result)
        return result
    except HTTPException:
        raise
    except IngestionConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Admin ingestion failed (%s).", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Weather data ingestion failed due to an internal server error.")
