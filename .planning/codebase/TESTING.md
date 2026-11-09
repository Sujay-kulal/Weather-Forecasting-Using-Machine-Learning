# Testing Patterns

**Analysis Date:** 2026-11-08

## Test Framework

**Backend (Python):**
- Runner: `pytest` 8.0+
- Configuration: `backend/conftest.py` with mock fixtures and test database bindings
- Assertion style: standard Python `assert` with descriptive messages

**Frontend (TypeScript/React):**
- Runner: Custom test runner via `frontend/scripts/run_e2e_tests.mjs`
- Test structure: Tiered testing strategy (Tier 1 to Tier 4) located in `frontend/tests/`

## Run Commands

**Backend Tests:**
```bash
# Run all backend tests
pytest backend/tests

# Run a specific test suite
pytest backend/tests/test_consistency.py

# Run temporal leakage tests specifically
pytest backend/tests/test_no_leakage.py

# Run with verbose output and short traceback
pytest -v --tb=short backend/tests
```

**Frontend Tests:**
```bash
# Navigate to frontend directory and run tiered test suite
cd frontend
npm test

# Run build verification (TypeScript compile check)
npm run build
```

## Test File Organization

**Backend Test Suites (`backend/tests/`):**
- `test_consistency.py`: Validates model prediction output sanity (e.g., valid temperature ranges, relative humidity within 0-100%, non-negative precipitation).
- `test_no_leakage.py`: Critical temporal evaluation test verifying that lag features and rolling calculations do NOT leak future data points into prediction feature vectors.
- `test_evaluate_deployed_artifact.py`: Confirms that `model/weather_model_v3.joblib` loads correctly, accepts expected feature schemas, and matches baseline evaluation metrics.
- `test_prediction_integrity.py`: Tests API input validation, handling of missing coordinates, and prediction persistence in PostgreSQL.
- `test_ingestion_pipeline.py`: Tests Open-Meteo external service mock handling, retries, and data ingestion pipeline reliability.
- `test_scheduler_lifecycle.py` & `test_scheduler_demo_isolation.py`: Tests background task start/stop lifecycles and demo isolation.
- `test_migrate_db.py`: Verifies database migration scripts and schema stability.

**Frontend Test Suites (`frontend/tests/`):**
- `tier1_features.test.tsx`: Smoke and feature tests for navigation, basic component rendering, and UI elements.
- `tier2_boundary.test.tsx`: Boundary conditions, invalid coordinate inputs, API failure fallbacks, and error toast states.
- `tier3_cross_feature.test.tsx`: Multi-component flows (e.g., clicking a district in `IndiaMap` and verifying that `ForecastPage` populates with that district's forecast).
- `tier4_real_world.test.tsx`: End-to-end user workflows, simulated network latency, and caching responsiveness.

## Mocking & Isolation Strategies

- **Open-Meteo API Mocking:** External weather API responses are mocked in `backend/tests/` fixtures using synthetic JSON payloads to prevent network dependence or API rate limits during automated testing.
- **Database Isolation:** Tests utilize in-memory SQLite fixtures or test transactions that rollback after each test to keep test runs side-effect free.
- **Frontend Mocks:** `frontend/tests/mocks/` provides mock API responses for weather, predictions, and locations.

---

*Testing analysis: 2026-11-08*
*Update after test framework or suite modifications*
