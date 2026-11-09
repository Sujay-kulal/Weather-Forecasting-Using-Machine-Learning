# External Integrations

**Analysis Date:** 2026-11-08

## APIs & External Services

**Weather Data Providers:**
- **Open-Meteo Weather Forecast API** - Provides real-time weather observations and 7-day numerical weather predictions.
  - Client: Python `urllib` / custom HTTP client with retry and backoff in `backend/app/services/open_meteo_service.py`
  - Auth: Public tier (no API key required), optional customer key via `OPEN_METEO_API_KEY`
  - Endpoints used: `https://api.open-meteo.com/v1/forecast`
  - Variables fetched: `temperature_2m`, `relative_humidity_2m`, `precipitation`, `surface_pressure`, `wind_speed_10m`, `shortwave_radiation`
  - Rate limits: 10,000 calls/day on free tier; handled with client-side retry logic and in-memory TTL caching

- **Open-Meteo Historical Archive API** - Used for backfilling historical training data and offline model validation.
  - Client: `backend/app/services/open_meteo_service.py`, `fetch_karnataka_dataset.py`, `backend/backfill.py`
  - Endpoints used: `https://archive-api.open-meteo.com/v1/archive`
  - Date ranges: Multi-year historical records for Karnataka districts

**Map & Geospatial Providers:**
- **OpenStreetMap / CARTO Basemaps** - Provides map tile rendering for India and Karnataka regional maps.
  - Client: Leaflet tile layer in `frontend/src/components/IndiaMap.tsx`
  - Tile URL: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
  - GeoJSON data: Local asset `frontend/src/assets/india_states.geojson` containing state boundary polygons

## Data Storage

**Databases:**
- **PostgreSQL 15+** - Primary relational data store.
  - Connection: `DATABASE_URL` environment variable (e.g., `postgresql+psycopg://postgres:postgres@localhost:5432/weather_db`)
  - Client: SQLAlchemy 2.0 ORM with psycopg 3.1 driver in `backend/app/database.py`
  - Connection Pooling: Configured with `pool_pre_ping=True`, `pool_size=10`, `max_overflow=20`
  - Migrations: Handled via `backend/migrate_db.py` and `backend/migrations/`
  - Core Tables:
    - `karnataka_locations` - District names, coordinates (latitude, longitude), elevation
    - `weather_records` - Historical hourly and daily weather observations
    - `weather_predictions` - Persisted 7-day ML forecasts with generation timestamps

**Caching:**
- **In-Memory TTL Cache** - Prevents redundant ML inference runs and external API requests.
  - Implementation: `cachetools.TTLCache` in `backend/app/services/prediction_cache.py`
  - TTL: Configurable duration (default 3600 seconds) keyed by rounded latitude/longitude

## Background Jobs & Schedulers

**Scheduled Ingestion:**
- **APScheduler (AsyncIOScheduler)** - Runs background tasks inside FastAPI lifespan lifecycle.
  - Implementation: `backend/app/services/ingestion_service.py` initialized in `backend/app/main.py`
  - Control flag: `SCHEDULER_ENABLED=true/false` in `.env`
  - Jobs:
    - Daily periodic sync of weather observation records across configured locations
    - Prediction cache warming

---

*Integrations analysis: 2026-11-08*
*Update after adding external services or storage providers*
