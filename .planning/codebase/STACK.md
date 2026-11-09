# Technology Stack

**Analysis Date:** 2026-11-08

## Languages

**Primary:**
- Python 3.11 - Backend API, ML training pipelines, data ingestion, database migrations (`backend/`, `scripts/`, root)
- TypeScript 5.6 - Frontend user interface, React components, state hooks, API clients (`frontend/src/`)

**Secondary:**
- SQL / PostgreSQL DDL - Database schemas and migrations (`backend/migrations/`)
- Bash / Shell / PowerShell - Test harnesses and build scripts (`scripts/`, `frontend/scripts/`)

## Runtime

**Environment:**
- Python 3.11+
- Node.js 20.x+ (development and frontend build)

**Package Managers:**
- pip (`requirements.txt`, `backend/requirements.txt`, `requirements-training.txt`)
- npm (`frontend/package.json`, lockfile `frontend/package-lock.json` present)

## Frameworks

**Core:**
- FastAPI 0.110+ - Asynchronous REST API web framework (`backend/app/main.py`)
- React 18.3 - Component-based user interface (`frontend/src/App.tsx`)
- Vite 6.0 - Frontend bundler and rapid HMR development server (`frontend/vite.config.ts`)

**Machine Learning & Data Science:**
- LightGBM 4.3+ - Gradient boosted tree regression for 7-day multi-target forecasting (`train_model.py`, `retrain_v3.py`)
- Scikit-Learn 1.4+ - Preprocessing, metrics evaluation (MAE, RMSE, R2), pipeline serialization (`backend/app/services/model_service.py`)
- Pandas 2.2+ - Time-series tabular data manipulation, feature lag calculations
- NumPy 1.26+ - Numerical matrix operations and array math
- Joblib 1.3+ - Serialized model persistence (`model/weather_model_v3.joblib`)

**Database & ORM:**
- SQLAlchemy 2.0+ - Python SQL toolkit and Object Relational Mapper (`backend/app/models.py`, `backend/app/database.py`)
- psycopg 3.1+ (binary) - Asynchronous and sync PostgreSQL database driver
- APScheduler 3.10+ - Background cron scheduler for automated weather data ingestion

**Frontend Visualization & UI:**
- Recharts 2.15+ - SVG composable charts for temperature, precipitation, and ML metrics (`frontend/src/pages/`)
- Leaflet 1.9+ & React-Leaflet 4.2+ - Interactive maps with GeoJSON state overlays (`frontend/src/components/IndiaMap.tsx`)
- Lucide React - Weather and UI icon set (`frontend/src/components/icons.tsx`)

**Testing:**
- pytest 8.0+ - Python test runner for backend integration, leakage, and consistency checks (`backend/tests/`)
- Node test runner / custom test harness - Frontend tier 1-4 real-world test suites (`frontend/scripts/run_e2e_tests.mjs`)

## Key Dependencies

**Critical:**
- `fastapi` - High-performance async ASGI API framework
- `sqlalchemy` - Relational mapping and connection pooling
- `lightgbm` - Core predictive machine learning engine
- `cachetools` - In-memory TTL caching for prediction deduplication (`backend/app/services/prediction_cache.py`)
- `react-leaflet` - Interactive geographical weather visualization

**Infrastructure:**
- `uvicorn[standard]` - ASGI production server for FastAPI
- `psycopg` - PostgreSQL connection layer

## Configuration

**Environment:**
- `.env` and `.env.example` - Root and backend configuration (`DATABASE_URL`, `OPEN_METEO_BASE_URL`, `CORS_ORIGINS`, `SCHEDULER_ENABLED`)
- `frontend/.env.example` - `VITE_API_URL` targeting backend endpoint

**Build:**
- `frontend/vite.config.ts` - Vite bundling configuration and proxy setup
- `frontend/tsconfig.json` - Strict TypeScript compilation settings
- `Dockerfile` / `docker-compose.yml` - Multi-service local and deployment orchestrator

## Platform Requirements

**Development:**
- Cross-platform: Windows, macOS, Linux
- PostgreSQL 15+ instance (or Docker container `postgres:15-alpine`)

**Production:**
- Containerized Docker deployment (`backend/Dockerfile`, `frontend/Dockerfile`, `nginx.conf`)
- Vercel supported for frontend static SPA (`frontend/vercel.json`)

---

*Stack analysis: 2026-11-08*
*Update after major dependency changes*
