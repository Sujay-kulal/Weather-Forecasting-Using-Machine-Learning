"""
Database configuration - PostgreSQL via SQLAlchemy.

The connection string comes from the DATABASE_URL environment variable
(loaded from backend/.env). PostgreSQL is the only supported database;
there is no SQLite fallback by design.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Load backend/.env (safe if missing - real env vars still work)
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy backend/.env.example to backend/.env "
        "and set your database connection string."
    )

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]


def get_engine_kwargs(database_url: str) -> dict:
    """Return appropriate connection pooling arguments based on database dialect.

    PostgreSQL (QueuePool) uses pool_size, max_overflow, pool_timeout, pool_recycle, and pool_pre_ping.
    SQLite (SingletonThreadPool/NullPool) omits QueuePool-specific options.
    """
    kwargs = {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "echo": False,
    }
    if "sqlite" not in database_url.lower():
        kwargs.update({
            "pool_size": 5,
            "max_overflow": 10,
            "pool_timeout": 30,
        })
    return kwargs


ENGINE_KWARGS = get_engine_kwargs(DATABASE_URL)
engine = create_engine(DATABASE_URL, **ENGINE_KWARGS)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def init_db(target_engine=None):
    """Ensure all SQLAlchemy ORM models are registered and create tables if not present."""
    import app.models  # noqa: F401
    eng = target_engine or engine
    Base.metadata.create_all(bind=eng)


def get_db():
    """FastAPI dependency: one database session per request."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def check_connection() -> bool:
    """Verify the app can talk to PostgreSQL (used by /health)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
