# Architecture

**Analysis Date:** 2026-11-08

## Pattern Overview

**Overall:** Decoupled Full-Stack Client-Server Architecture with Embedded ML Inference Pipeline

**Key Characteristics:**
- **Stateless RESTful API:** FastAPI handles HTTP endpoints with explicit Pydantic request/response validation.
- **Embedded ML Inference:** The serialized LightGBM model (`weather_model_v3.joblib`) is loaded into memory on server startup for sub-millisecond prediction generation without dedicated model-serving infrastructure overhead.
- **Layered Service Separation:** Clear boundaries between HTTP routing, business domain logic, external API integration, and database operations.
- **Client-Side SPA Visualization:** React 18 frontend with rich visual components (Leaflet maps, interactive Recharts time series) consuming standard REST endpoints.

## Layers

**1. Presentation Layer (`frontend/src/`):**
- Purpose: Provides responsive, interactive dashboards for weather forecasts, historical analysis, ML performance, and regional geospatial map exploration.
- Contains: React components (`App.tsx`, `IndiaMap.tsx`, `icons.tsx`, `ui.tsx`), page views (`ForecastPage`, `MLDashboardPage`, `ModelPerformancePage`, `WeatherHistoryPage`), custom hooks (`useFetch`, `useHealth`), and CSS modules.
- Depends on: API service client (`frontend/src/services/api.ts`).
- Used by: End users in web browsers.

**2. Routing & HTTP Transport Layer (`backend/app/routes/`):**
- Purpose: Defines API endpoints, performs request parsing, query parameter validation, status code management, and OpenAPI documentation generation.
- Contains:
  - `location_weather.py`: District and coordinate weather endpoints
  - `weather.py`: Current weather observations and historical series
  - `prediction.py`: 7-day ML weather prediction endpoints
  - `admin.py`: Manual ingestion triggers and administrative utilities
  - `health.py`: Liveness and database connectivity probes
- Depends on: Service Layer and Pydantic schemas (`backend/app/schemas.py`).
- Used by: Frontend API client and external automation consumers.

**3. Domain Service Layer (`backend/app/services/`):**
- Purpose: Encapsulates all application business logic, caching, ML feature creation, and orchestration.
- Contains:
  - `model_service.py`: Loads the LightGBM model and computes inference
  - `feature_service.py`: Generates lag features and rolling window statistical aggregations
  - `location_weather_service.py`: Orchestrates location resolution, current observation retrieval, and prediction stitching
  - `open_meteo_service.py`: Communicates with Open-Meteo external REST APIs with retry policies
  - `ingestion_service.py`: Handles database sync and automated ingestion schedules
  - `prediction_cache.py`: Manages in-memory TTL caching for fast repeated lookups
  - `prediction_store.py`: Persists generated prediction artifacts into PostgreSQL
  - `metrics_service.py`: Aggregates model validation metrics (MAE, RMSE, R²)
- Depends on: Data Access Layer and external APIs.
- Used by: Route handlers and background schedulers.

**4. Data Access & Persistence Layer (`backend/app/database.py`, `backend/app/models.py`):**
- Purpose: Manages relational persistence, transactions, and table schemas.
- Contains: SQLAlchemy declarative models (`WeatherRecord`, `WeatherPrediction`, `KarnatakaLocation`) and connection session factory (`get_db` dependency).
- Depends on: PostgreSQL database.
- Used by: Service layer for reading and persisting weather records.

**5. Machine Learning Core (`model/`, `scripts/`, root):**
- Purpose: Defines training pipelines, feature engineering recipes, validation splits, and model serialization.
- Contains:
  - `model/weather_model_v3.joblib`: Production LightGBM regressor artifact
  - `model/model_info.json`: Feature names, hyperparameters, and dataset metadata
  - `model/evaluation_results_v3.json`: Holdout validation scores
  - `train_model.py` / `retrain_v3.py`: Reproducible model training scripts with temporal holdout validation to prevent future leakage
- Used by: `backend/app/services/model_service.py`.

## Data Flow

**1. Weather Forecast & ML Prediction Request:**
1. User clicks a location on `IndiaMap` or selects a city in `ForecastPage`.
2. Frontend calls `GET /api/v1/locations/weather?lat={lat}&lon={lon}`.
3. `location_weather.py` routes the request to `LocationWeatherService`.
4. `LocationWeatherService` checks `prediction_cache.py` for cached results.
5. If cache miss, `OpenMeteoService` retrieves recent weather observations.
6. `FeatureService` constructs lag and rolling features from historical weather data.
7. `ModelService` passes feature matrix into `weather_model_v3.joblib` to produce 7-day predictions.
8. `PredictionStore` writes the forecast record to PostgreSQL asynchronously.
9. Combined payload (current weather + 7-day forecast + model confidence) returns to frontend.
10. `ForecastPage` updates state, rendering summary metric cards and Recharts forecast curves.

**2. Background Weather Ingestion Flow:**
1. `APScheduler` fires periodic trigger (configured in `backend/app/main.py`).
2. `IngestionService.sync_locations()` loops through tracked districts in `karnataka_locations`.
3. `OpenMeteoService` queries external APIs for latest observation windows.
4. Records are deduplicated and saved to `weather_records` table using SQLAlchemy bulk operations.

---

*Architecture analysis: 2026-11-08*
*Update after structural architectural changes*
