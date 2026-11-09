"""
FastAPI application entry point.

Run from the backend/ directory:
    uvicorn app.main:app --reload

Interactive docs: http://localhost:8000/docs  (Swagger) and /redoc
"""
import logging
import os
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.database import check_connection, init_db
from app.routes import admin, health, location_weather, prediction, weather
from app.services.ingestion_service import run_ingestion_with_lock
from app.services.metrics_service import fill_missing_actuals

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables if missing and verify PostgreSQL connectivity."""
    try:
        init_db()
    except Exception as exc:
        logger.warning(
            "Database initialization deferred or failed during startup (%s): %s. "
            "Server will start in degraded mode.",
            type(exc).__name__,
            exc,
        )

    if not check_connection():
        logger.error("Cannot connect to PostgreSQL - check DATABASE_URL in backend/.env")
    else:
        logger.info("PostgreSQL connection OK, tables ready")
    logger.info("Trained model loaded: %s", prediction.model_service.MODEL_NAME)

    # Keep model pipeline on app.state
    app.state.pipeline = prediction.model_service.pipeline
    app.state.model_info = prediction.model_service.model_info
    app.state.model_name = prediction.model_service.MODEL_NAME
    app.state.model_mae = prediction.model_service.MODEL_MAE

    # Start APScheduler: only when explicitly enabled via ENABLE_INGESTION_SCHEDULER
    scheduler_enabled = os.environ.get("ENABLE_INGESTION_SCHEDULER", "false").strip().lower() in ("true", "1", "yes")
    if scheduler_enabled:
        scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
        scheduler.add_job(
            run_ingestion_with_lock,
            trigger=CronTrigger(hour=6, minute=30, timezone="Asia/Kolkata"),
            id="daily_weather_ingest",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
            replace_existing=True,
        )
        scheduler.add_job(
            fill_missing_actuals,
            trigger=CronTrigger(hour=7, minute=0, timezone="Asia/Kolkata"),
            id="fill_prediction_actuals",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
            replace_existing=True,
        )
        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("APScheduler BackgroundScheduler started (Daily 06:30 Asia/Kolkata).")
    else:
        app.state.scheduler = None
        logger.info("APScheduler BackgroundScheduler is disabled (ENABLE_INGESTION_SCHEDULER is not enabled).")

    try:
        yield
    finally:
        if getattr(app.state, "scheduler", None) is not None:
            app.state.scheduler.shutdown(wait=False)
            logger.info("APScheduler BackgroundScheduler shut down.")


app = FastAPI(
    title="Weather Forecasting API",
    description="Seven-day average temperature forecasting for Indian states "
                "using the configured saved multi-output ML pipeline.",
    version="2.0.0",
    lifespan=lifespan,
)

# Global RFC 7807 Problem Details Handler
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    title = exc.detail if isinstance(exc.detail, str) else "HTTP Error"
    content = {
        "type": "about:blank",
        "title": title,
        "status": exc.status_code,
        "detail": detail,
        "instance": request.url.path,
    }
    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers={"Content-Type": "application/problem+json"},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    content = {
        "type": "about:blank",
        "title": "Unprocessable Entity",
        "status": 422,
        "detail": jsonable_encoder(exc.errors()),
        "instance": request.url.path,
    }
    return JSONResponse(
        status_code=422,
        content=content,
        headers={"Content-Type": "application/problem+json"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled internal server error at %s: %s", request.url.path, exc, exc_info=True)
    content = {
        "type": "about:blank",
        "title": "Internal Server Error",
        "status": 500,
        "detail": "An internal server error occurred.",
        "instance": request.url.path,
    }
    return JSONResponse(
        status_code=500,
        content=content,
        headers={"Content-Type": "application/problem+json"},
    )


def sanitize_cors_origins(origins_raw: str | list[str], allow_credentials: bool = True) -> list[str]:
    """Parse and sanitize allowed CORS origins, rejecting wildcard '*' when credentials are enabled."""
    if isinstance(origins_raw, str):
        origins = [o.strip() for o in origins_raw.split(",") if o.strip()]
    else:
        origins = [str(o).strip() for o in origins_raw if str(o).strip()]

    if allow_credentials:
        safe_origins = [o for o in origins if o != "*"]
        if len(safe_origins) < len(origins):
            logger.warning("CORS wildcard '*' was rejected because allow_credentials is True.")
        return safe_origins
    return origins


def parse_and_validate_cors_origins(origins_raw: str | list[str], allow_credentials: bool = True) -> list[str]:
    """Parse and validate CORS origins ensuring wildcard '*' cannot be combined with allow_credentials=True."""
    return sanitize_cors_origins(origins_raw, allow_credentials=allow_credentials)


# CORS - allow local dev servers AND production deployments.
# Override via env var:  CORS_ORIGINS=https://your-app.vercel.app
origins_env = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,"
    "http://127.0.0.1:3000,http://127.0.0.1:5173,"
    "http://localhost:8080,http://127.0.0.1:8080,"
    "https://weather-forecasting-using-machine.onrender.com"
)
origins_list = sanitize_cors_origins(origins_env, allow_credentials=True)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(admin.router)
app.include_router(weather.states_router)
app.include_router(weather.router)
app.include_router(prediction.router)
app.include_router(location_weather.router)
