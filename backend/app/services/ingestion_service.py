"""
Ingestion service managing the scheduled/admin weather ingestion job
with PostgreSQL advisory locks, exception handling, and cache invalidation.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from app.database import SessionLocal
from app.services.prediction_cache import clear_forecast_cache
import update_weather

logger = logging.getLogger("ingestion_service")

# 64-bit integer advisory lock identifier for weather ingestion
ADVISORY_LOCK_ID = 84729103859

_last_ingested_at: Optional[datetime] = None

def get_last_ingested_at() -> Optional[datetime]:
    global _last_ingested_at
    return _last_ingested_at

def run_ingestion_with_lock(days_back: int = 7) -> dict:
    """
    Runs the weather ingestion with a PostgreSQL advisory lock to ensure
    only one ingestion job runs across workers/processes.
    """
    global _last_ingested_at
    session = SessionLocal()
    locked = False

    try:
        # Attempt non-blocking acquisition of the advisory lock
        res = session.execute(text(f"SELECT pg_try_advisory_lock({ADVISORY_LOCK_ID})")).scalar()
        if not res:
            logger.warning("Ingestion job skipped: advisory lock currently held by another job.")
            return {"status": "skipped", "reason": "advisory_lock_held"}

        locked = True
        logger.info(f"Acquired advisory lock ({ADVISORY_LOCK_ID}). Starting ingestion (days_back={days_back})...")

        # Run upsert ingestion
        records_upserted = update_weather.update_weather(days_back=days_back, session=session)

        # Update last ingested timestamp
        _last_ingested_at = datetime.now(timezone.utc)

        # Clear prediction / forecast cache after successful ingestion
        clear_forecast_cache()
        logger.info("Ingestion completed successfully. Cleared prediction cache.")

        return {
            "status": "success",
            "records_upserted": records_upserted,
            "last_ingested_at": _last_ingested_at.isoformat()
        }

    except Exception as exc:
        logger.exception("Error during weather ingestion job: %s", exc)
        raise
    finally:
        if locked:
            try:
                session.execute(text(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_ID})"))
                logger.info(f"Released advisory lock ({ADVISORY_LOCK_ID}).")
            except Exception as e:
                logger.error(f"Failed to release advisory lock: {e}")
        session.close()
