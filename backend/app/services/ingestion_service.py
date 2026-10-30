"""
Ingestion service managing the scheduled/admin weather ingestion job
with PostgreSQL advisory locks, exception handling, and cache invalidation.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from app.database import SessionLocal, engine
from app.services.prediction_cache import clear_forecast_cache
import update_weather

logger = logging.getLogger("ingestion_service")

# 64-bit integer advisory lock identifier for weather ingestion
ADVISORY_LOCK_ID = 84729103859

_last_ingested_at: Optional[datetime] = None

def get_last_ingested_at() -> Optional[datetime]:
    global _last_ingested_at
    return _last_ingested_at

def run_ingestion_with_lock(days_back: int = 7) -> update_weather.IngestionSummary:
    """
    Runs the weather ingestion with a PostgreSQL advisory lock to ensure
    only one ingestion job runs across workers/processes.
    """
    global _last_ingested_at
    conn = None
    try:
        if hasattr(engine, "connect"):
            conn = engine.connect()
            session = SessionLocal(bind=conn)
        else:
            session = SessionLocal()
    except Exception as init_exc:
        logger.warning("Failed to bind session to dedicated connection: %s", init_exc)
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
            conn = None
        session = SessionLocal()

    locked = False

    try:
        # Attempt non-blocking acquisition of the advisory lock
        res = session.execute(text(f"SELECT pg_try_advisory_lock({ADVISORY_LOCK_ID})")).scalar()
        if not res:
            logger.warning("Ingestion job skipped: advisory lock currently held by another job.")
            return update_weather.IngestionSummary({
                "status": "skipped",
                "reason": "advisory_lock_held",
                "records_upserted": 0,
                "records_inserted_or_updated": 0,
                "total_states": len(update_weather.STATE_COORDS),
                "successful_states": [],
                "failed_states": [],
                "successful_count": 0,
                "failed_count": 0,
                "failed_state_errors": {},
                "errors": {},
                "last_ingested_at": _last_ingested_at.isoformat() if _last_ingested_at else None,
            })

        locked = True
        logger.info(f"Acquired advisory lock ({ADVISORY_LOCK_ID}). Starting ingestion (days_back={days_back})...")

        # Run upsert ingestion
        raw_result = update_weather.update_weather(days_back=days_back, session=session)

        # Normalize result to IngestionSummary
        if isinstance(raw_result, update_weather.IngestionSummary):
            summary = raw_result
        elif isinstance(raw_result, dict):
            summary = update_weather.IngestionSummary(raw_result)
        else:
            records = int(raw_result)
            summary = update_weather.IngestionSummary({
                "status": "success",
                "total_states": len(update_weather.STATE_COORDS),
                "successful_states": list(update_weather.STATE_COORDS.keys()),
                "failed_states": [],
                "successful_count": len(update_weather.STATE_COORDS),
                "failed_count": 0,
                "records_upserted": records,
                "records_inserted_or_updated": records,
                "failed_state_errors": {},
                "errors": {},
            })

        status = summary.get("status", "success")

        # Update last ingested timestamp and clear forecast cache when at least one state succeeded
        if status in ("success", "partial_success") and (summary.get("successful_count", 0) > 0 or summary.get("records_upserted", 0) > 0):
            _last_ingested_at = datetime.now(timezone.utc)
            clear_forecast_cache()
            logger.info(f"Ingestion completed with status '{status}'. Cleared prediction cache.")
            summary["last_ingested_at"] = _last_ingested_at.isoformat()
        else:
            logger.warning(f"Ingestion completed with status '{status}'. Prediction cache was not cleared.")
            summary["last_ingested_at"] = _last_ingested_at.isoformat() if _last_ingested_at else None

        return summary

    except Exception as exc:
        logger.exception("Error during weather ingestion job: %s", exc)
        raise
    finally:
        if locked:
            try:
                # Clear any aborted transaction state before releasing advisory lock
                try:
                    session.rollback()
                except Exception as rb_exc:
                    logger.debug("Pre-unlock rollback error: %s", rb_exc)

                unlocked = session.execute(text(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_ID})")).scalar()
                if unlocked:
                    logger.info(f"Released advisory lock ({ADVISORY_LOCK_ID}).")
                else:
                    logger.warning(f"Advisory lock ({ADVISORY_LOCK_ID}) was not held when unlock was attempted.")
            except Exception as e:
                logger.error(f"Failed to release advisory lock: {e}")
                # If releasing the lock on the connection fails, invalidate it so
                # the connection is terminated and PostgreSQL frees the lock,
                # rather than returning a connection with a dangling lock to the pool.
                if conn is not None:
                    try:
                        conn.invalidate()
                        conn = None
                    except Exception as inv_exc:
                        logger.warning("Error invalidating locked connection: %s", inv_exc)
        session.close()
        if conn is not None:
            try:
                conn.close()
            except Exception as e:
                logger.warning(f"Error closing pinned advisory lock connection: {e}")
