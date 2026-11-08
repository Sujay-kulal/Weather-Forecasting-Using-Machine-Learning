# Codebase Structure

**Analysis Date:** 2026-11-08

## Directory Layout

```
Weather-Forecasting-Using-Machine-Learning-main/
├── .agents/            # Agent skill definitions and domain workflows
├── .planning/          # GSD project plans, roadmaps, and codebase maps
├── audit/              # Historical system audits, verification notes, and deliverables
├── backend/            # FastAPI application, database layer, background scheduler
│   ├── app/            # Core backend package
│   │   ├── routes/     # API route handlers
│   │   ├── services/   # Business logic, caching, and ML inference services
│   │   ├── database.py # SQLAlchemy session management and connection pooling
│   │   ├── models.py   # Database ORM models
│   │   ├── schemas.py  # Pydantic request/response schemas
│   │   └── main.py     # FastAPI application entry point and lifespan hooks
│   ├── migrations/     # Database migration scripts
│   ├── tests/          # Pytest backend test suite
│   ├── Dockerfile      # Backend container definition
│   └── requirements.txt# Backend Python dependencies
├── deliverables/       # Release documentation and audit reports
├── docs/               # System and architectural documentation
├── frontend/           # React 18 + Vite frontend application
│   ├── src/            # Frontend source tree
│   │   ├── assets/     # Static assets (india_states.geojson)
│   │   ├── components/ # Reusable UI components (IndiaMap, icons, ui)
│   │   ├── hooks/      # React custom hooks (useFetch, useHealth)
│   │   ├── pages/      # Top-level view pages (Forecast, MLDashboard, etc.)
│   │   ├── services/   # HTTP API clients (api.ts, cityWeather.ts)
│   │   ├── types/      # TypeScript interfaces and type definitions
│   │   ├── App.tsx     # Root application shell and tab routing
│   │   ├── main.tsx    # React DOM mounting entry point
│   │   └── styles.css  # Application styles and responsive theme definitions
│   ├── tests/          # Frontend automated test suites (tier1-tier4)
│   ├── scripts/        # Frontend test runners and build scripts
│   ├── package.json    # Frontend npm dependencies and scripts
│   ├── vite.config.ts  # Vite build configuration
│   └── Dockerfile      # Frontend container definition
├── model/              # Serialized ML artifacts and evaluation metrics
│   ├── weather_model_v3.joblib  # Production LightGBM regressor
│   ├── model_info.json          # Training hyperparameters and feature list
│   └── evaluation_results_v3.json # Holdout validation scores
├── notebooks/          # Exploratory data analysis and model prototyping notebooks
├── scratch/            # Temporary scratch scripts and execution logs
├── scripts/            # Standalone automation, data fetch, and utility scripts
├── docker-compose.yml  # Multi-container Docker composition
├── fetch_data.py       # Open-Meteo batch data fetcher
├── train_model.py      # Production model training script
└── README.md           # Project overview and setup instructions
```

## Directory Purposes

**`backend/app/`:**
- Purpose: Houses the complete backend web application and inference engine.
- Contains: Python 3.11 modules, route definitions, service implementations, Pydantic schemas, and database ORM classes.
- Key files:
  - `backend/app/main.py`: Configures FastAPI, CORS, API router mounts, and lifespan scheduler startup/teardown.
  - `backend/app/database.py`: Manages the PostgreSQL connection pool and session generator.
  - `backend/app/models.py`: Declares SQLAlchemy models for locations, records, and predictions.
  - `backend/app/schemas.py`: Strict input/output validation contracts.

**`backend/app/routes/`:**
- Purpose: HTTP endpoint routing.
- Key files:
  - `location_weather.py`: District-level weather queries and prediction endpoints.
  - `weather.py`: Raw observations and historical time-series queries.
  - `prediction.py`: ML forecasting endpoints.
  - `admin.py`: Manual ingestion and data management triggers.
  - `health.py`: Liveness and health checks.

**`backend/app/services/`:**
- Purpose: Encapsulates domain logic and isolates infrastructure dependencies.
- Key files:
  - `model_service.py`: ML model loading and feature matrix prediction.
  - `feature_service.py`: Feature engineering (lags, rolling averages, seasonality).
  - `open_meteo_service.py`: External Open-Meteo REST API wrapper.
  - `ingestion_service.py`: Batch syncing of weather data.
  - `prediction_cache.py`: In-memory TTL caching.

**`frontend/src/`:**
- Purpose: Houses the interactive Single Page Application.
- Contains: TypeScript (`.tsx`, `.ts`) files and CSS stylesheets.
- Key files:
  - `App.tsx`: Navigation bar, dark/light theme toggle, toast notifications, and tab navigation.
  - `components/IndiaMap.tsx`: Leaflet map with GeoJSON state overlays and district pins.
  - `pages/ForecastPage.tsx`: Primary weather forecast view with charts and metrics.
  - `pages/MLDashboardPage.tsx`: ML telemetry and feature attribution charts.
  - `pages/ModelPerformancePage.tsx`: Evaluation metrics (MAE, RMSE, R²) versus baselines.

**`model/`:**
- Purpose: Stores the trained ML artifacts and metadata required for serving.
- Key files:
  - `weather_model_v3.joblib`: Binary LightGBM regressor.
  - `model_info.json`: Training feature metadata.
  - `evaluation_results_v3.json`: Holdout test metrics.

## Key File Locations

**Entry Points:**
- `backend/app/main.py`: API server entry point.
- `frontend/src/main.tsx`: Web client mount point.
- `train_model.py`: Training script for model regeneration.

**Configuration:**
- `.env.example` / `.env`: Global and backend environment configuration.
- `frontend/vite.config.ts`: Frontend bundler and proxy configuration.
- `frontend/tsconfig.json`: TypeScript compiler options.
- `docker-compose.yml`: Local Docker service definitions (PostgreSQL, backend, frontend).

---

*Structure analysis: 2026-11-08*
*Update after moving or creating top-level directories*
