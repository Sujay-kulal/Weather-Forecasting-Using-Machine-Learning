# Codebase Concerns

**Analysis Date:** 2026-11-08

## Tech Debt & Architectural Gaps

**Process-Local In-Memory Cache:**
- Issue: `backend/app/services/prediction_cache.py` uses `cachetools.TTLCache` held in memory of the single Python process.
- Why: Simple, zero-dependency caching implementation suitable for single-instance deployments.
- Impact: If backend is scaled across multiple Uvicorn workers or distributed container instances, each instance maintains a separate cache, leading to duplicate upstream Open-Meteo queries.
- Fix approach: Integrate Redis or Memcached as a centralized caching layer when horizontal scaling is required.

**Large GeoJSON Asset in Frontend Bundle:**
- Issue: `frontend/src/assets/india_states.geojson` is approximately 2.2MB uncompressed and bundled in the frontend assets.
- Why: Ensures reliable client-side boundary rendering for the interactive India and Karnataka state maps.
- Impact: Increases initial page load time on low-bandwidth connections.
- Fix approach: Simplify GeoJSON polygons with Mapshaper / TopoJSON or load dynamically via lazy fetch on demand.

**Model Retraining Automation:**
- Issue: Model retraining is currently executed manually via `train_model.py` / `retrain_v3.py`.
- Why: Training is compute-intensive and requires curated historical weather sets.
- Impact: Predictions may suffer concept drift over time without scheduled retraining and automated champion/challenger evaluation gates.
- Fix approach: Establish an automated ML pipeline job (or GitHub Action) that runs periodically, computes validation metrics, and alerts if performance degrades below thresholds.

## Security Considerations

**CORS Configuration:**
- Risk: Development mode often allows wildcard or permissive origins.
- Current mitigation: Controlled via `CORS_ORIGINS` in `.env`.
- Recommendations: Ensure production deployment explicitly enumerates the production domain (e.g., Vercel URL) and disallows unauthorized origins.

**Database Credentials in Environment:**
- Risk: Accidental credential leakage in commit history.
- Current mitigation: `.gitignore` and `.dockerignore` exclude `.env` files. Template provided in `.env.example`.
- Recommendations: Store production secrets in a secret manager or encrypted environment vault.

## Performance & Reliability

**Open-Meteo Rate Limiting:**
- Risk: Exceeding the free tier daily limit (10,000 requests/day) during high user traffic or rapid ingestion loops.
- Current mitigation: Exponential backoff in `OpenMeteoService` and in-memory TTL caching.
- Recommendations: Monitor API usage counters and expand database lookups before querying upstream APIs.

**Model Prediction Invariant Audits:**
- Risk: Model output sanity under extreme weather outliers (e.g. cyclones, cloudbursts).
- Current mitigation: `backend/tests/test_consistency.py` enforces bounded checks on physical quantities (relative humidity within 0-100%, non-negative precipitation).
- Recommendations: Apply post-prediction sanity clamping in `ModelService` before returning to frontend callers.

---

*Concerns analysis: 2026-11-08*
*Update after addressing tech debt or identifying new concerns*
