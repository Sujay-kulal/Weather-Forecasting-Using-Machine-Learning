"""
FastAPI application entry point.

Run from the backend/ directory:
    uvicorn app.main:app --reload

Interactive docs: http://localhost:8000/docs  (Swagger) and /redoc
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, check_connection, engine
from app.routes import health, prediction, weather

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables if missing and verify PostgreSQL connectivity."""
    Base.metadata.create_all(bind=engine)
    if not check_connection():
        logger.error("Cannot connect to PostgreSQL - check DATABASE_URL in backend/.env")
    else:
        logger.info("PostgreSQL connection OK, tables ready")
        
    logger.info("Trained model loaded: %s", prediction.model_service.MODEL_NAME)
    yield


app = FastAPI(
    title="Weather Forecasting API",
    description="Next-day average temperature forecasting for Indian states "
                "using a trained Gradient Boosting model (scikit-learn).",
    version="2.0.0",
    lifespan=lifespan,
)

@app.get("/populate_debug")
def populate_debug():
    import subprocess
    try:
        out1 = subprocess.check_output(["python", "import_data.py"], stderr=subprocess.STDOUT)
        out2 = subprocess.check_output(["python", "update_weather.py"], stderr=subprocess.STDOUT)
        return {"import": out1.decode(), "update": out2.decode()}
    except subprocess.CalledProcessError as e:
        return {"error": str(e), "output": e.output.decode()}

#   CORS_ORIGINS=http://localhost:3000,http://localhost:5173
origins_env = os.environ.get("CORS_ORIGINS",
                             "http://localhost:3000,http://localhost:5173,"
                             "http://127.0.0.1:3000,http://127.0.0.1:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins_env.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(weather.states_router)
app.include_router(weather.router)
app.include_router(prediction.router)
