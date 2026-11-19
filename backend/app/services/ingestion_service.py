"""
Ingestion service managing the scheduled/admin weather ingestion job
with PostgreSQL advisory locks, exception handling, and cache invalidation.
"""
import logging
from datetime import datetime, timezone, date
from typing import Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, URL
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool
from app.database import SessionLocal, engine
from app.services.prediction_cache import clear_forecast_cache
import update_weather

logger = logging.getLogger("ingestion_service")

# 64-bit integer advisory lock identifier for weather ingestion
ADVISORY_LOCK_ID = 84729103859

_last_ingested_at: Optional[datetime] = None


class IngestionConfigurationError(RuntimeError):
    """The configured PostgreSQL endpoint cannot hold session advisory locks."""


def _ingestion_engine() -> Engine:
    url = getattr(engine, "url", None)
    if isinstance(url, URL) and {"host", "hostaddr", "service"}.intersection(url.query):
        raise IngestionConfigurationError("Weather ingestion requires one direct PostgreSQL hostname.")
    hostname = getattr(url, "host", None)
    if not isinstance(hostname, str) or "-pooler." not in hostname.lower():
        return engine

    endpoint, domain = hostname.lower().split(".", 1)
    if not endpoint.startswith("ep-") or not endpoint.endswith("-pooler") or not domain.endswith(".neon.tech"):
        raise IngestionConfigurationError("Weather ingestion requires a direct PostgreSQL endpoint.")

    # Neon uses the same role, database and TLS options on both endpoint names.
    direct_url = url.set(host=f"{endpoint.removesuffix('-pooler')}.{domain}")
    return create_engine(
        direct_url, poolclass=NullPool, connect_args={"connect_timeout": 5}, hide_parameters=True
    )


def get_last_ingested_at() -> Optional[datetime]:
    global _last_ingested_at
    return _last_ingested_at

def run_ingestion_with_lock(days_back: int = 7, today: Optional[date] = None) -> update_weather.IngestionSummary:
    """
    Runs the weather ingestion with a PostgreSQL advisory lock to ensure
    only one ingestion job runs across workers/processes.
    """
    global _last_ingested_at
    target_engine = _ingestion_engine()

    conn = None
    try:
        if hasattr(target_engine, "connect"):
            conn = target_engine.connect()
            session = SessionLocal(bind=conn)
        else:
            session = SessionLocal()
    except Exception as init_exc:
        logger.warning("Failed to bind the ingestion database session (%s).", type(init_exc).__name__)
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
            conn = None
        if target_engine is not engine:
            raise RuntimeError("Could not open the direct ingestion database session.") from None
        session = SessionLocal()
        try:
            bind = session.get_bind()
            if isinstance(bind, Engine):
                conn = bind.connect()
                session.bind = conn
        except SQLAlchemyError:
            session.close()
            raise RuntimeError("Could not open the ingestion database session.") from None

    locked = False

    try:
        # Attempt non-blocking acquisition of the advisory lock
        try:
            res = session.execute(text(f"SELECT pg_try_advisory_lock({ADVISORY_LOCK_ID})")).scalar()
        except SQLAlchemyError:
            raise RuntimeError("Could not acquire the weather ingestion lock.") from None
        if not res:
            logger.warning("Ingestion job skipped: advisory lock currently held by another job.")
            return update_weather.IngestionSummary({
                "status": "skipped",
                "reason": "advisory_lock_held",
                "records_upserted": 0,
                "records_inserted_or_updated": 0,
                "records_inserted": 0,
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
        # The session lock survives a commit. Avoid an idle transaction during provider I/O.
        try:
            session.commit()
        except SQLAlchemyError:
            raise RuntimeError("Could not start weather ingestion.") from None
        logger.info(f"Acquired advisory lock ({ADVISORY_LOCK_ID}). Starting ingestion (days_back={days_back})...")

        # Run upsert ingestion
        if today is not None:
            raw_result = update_weather.update_weather(days_back=days_back, session=session, today=today)
        else:
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
        logger.error("Weather ingestion did not complete (%s).", type(exc).__name__)
        raise
    finally:
        # An invalidated connection no longer owns the lock, and can reconnect implicitly.
        if locked and (conn is None or conn.invalidated is not True):
            try:
                # If rollback fails, discard the connection without attempting another statement.
                session.rollback()
                unlocked = session.execute(text(f"SELECT pg_advisory_unlock({ADVISORY_LOCK_ID})")).scalar()
                if unlocked:
                    logger.info(f"Released advisory lock ({ADVISORY_LOCK_ID}).")
                else:
                    logger.warning(f"Advisory lock ({ADVISORY_LOCK_ID}) was not held when unlock was attempted.")
            except Exception as e:
                logger.error("Failed to release the ingestion lock (%s).", type(e).__name__)
                # If releasing the lock on the connection fails, invalidate it so
                # the connection is terminated and PostgreSQL frees the lock,
                # rather than returning a connection with a dangling lock to the pool.
                if conn is not None:
                    try:
                        conn.invalidate()
                    except Exception as inv_exc:
                        logger.warning("Could not invalidate the ingestion connection (%s).", type(inv_exc).__name__)
        try:
            session.close()
        finally:
            if conn is not None:
                conn.close()
