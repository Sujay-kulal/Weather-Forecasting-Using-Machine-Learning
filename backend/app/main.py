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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, check_connection, engine, init_db
from app.routes import admin, health, prediction, weather
from app.services.ingestion_service import run_ingestion_with_lock
from app.services.metrics_service import fill_missing_actuals

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables if missing and verify PostgreSQL connectivity."""
    init_db()
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

    # Start APScheduler: Daily at 06:30 Asia/Kolkata
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

    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler BackgroundScheduler shut down.")


app = FastAPI(
    title="Weather Forecasting API",
    description="Next-day average temperature forecasting for Indian states "
                "using a trained Gradient Boosting model (scikit-learn).",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS - allow local dev servers AND production deployments.
# Override via env var:  CORS_ORIGINS=https://your-app.vercel.app
origins_env = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,"
    "http://127.0.0.1:3000,http://127.0.0.1:5173,"
    "https://weather-forecasting-using-machine.onrender.com"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins_env.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(admin.router)
app.include_router(weather.states_router)
app.include_router(weather.router)
app.include_router(prediction.router)
