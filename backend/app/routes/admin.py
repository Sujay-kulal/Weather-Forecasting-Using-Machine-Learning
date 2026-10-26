"""
Admin endpoints.
POST /admin/ingest triggers the weather ingestion job, guarded by X-Admin-Token header.
"""
import os
import hmac
import logging
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query
from app.services.ingestion_service import run_ingestion_with_lock

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger("admin")

@router.post("/ingest")
def admin_ingest(
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
    days_back: int = Query(7, ge=1, le=90)
):
    expected_token = os.environ.get("ADMIN_TOKEN")
    if not expected_token:
        raise HTTPException(
            status_code=503,
            detail="Service Unavailable: ADMIN_TOKEN environment variable is not configured"
        )
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected_token):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: invalid or missing X-Admin-Token"
        )

    try:
        result = run_ingestion_with_lock(days_back=days_back)
        return result
    except Exception:
        logger.exception("Manual weather ingestion failed")
        raise HTTPException(status_code=500, detail="Weather ingestion failed. Check the server logs.")
