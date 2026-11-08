# Automated E2E & Component Integration Test Infrastructure

**WeatherCast India — Frontend Enterprise Redesign**  
**Repository Branch**: `feature/industry-frontend-redesign`  
**Execution Environment**: Node.js v24.20.0 native ESM runner with `esbuild` bundling and React 18 SSR  
**Primary Execution Command**: `node frontend/scripts/run_e2e_tests.mjs`  
**Alternative Execution Command**: `cd frontend; npm test`

---

## 1. Executive Summary

This testing infrastructure provides a robust, self-contained, and deterministic verification framework for the redesigned enterprise frontend of WeatherCast India. It exercises all 15 core features (F1 through F15) across 4 structured testing tiers without requiring heavy headless browsers, physical display servers, or external network services.

The runner compiles modern React 18 TypeScript/TSX components on the fly via `esbuild` (0.25.12) with zero-cost CSS and Leaflet polyfill interception, rendering components to static markup via `react-dom/server` and asserting against real DOM attributes, accessibility roles, meteorological legends, cascading state transitions, and responsive layout shells using Node's native `node:test` framework.

---

## 2. Directory & Component Layout

```text
frontend/
├── scripts/
│   └── run_e2e_tests.mjs          # Standalone test runner and esbuild compilation harness
└── tests/
    ├── mocks/
    │   ├── apiFixtures.ts         # High-fidelity domain mock data matching FastAPI schemas
    │   ├── leafletMock.tsx        # Headless React mock for Leaflet and react-leaflet primitives
    │   ├── testUtils.tsx          # SSR rendering pipeline (renderComponent) & assertion helpers
    │   └── useFetchMock.ts        # Dynamic hook mock with function pattern matching & overrides
    ├── tier1_features.test.tsx    # Tier 1: Feature Coverage (F1 to F15) — 18 tests
    ├── tier2_boundary.test.tsx    # Tier 2: Boundary & Corner Cases — 16 tests
    ├── tier3_cross_feature.test.tsx# Tier 3: Cross-Feature Combinations — 5 tests
    ├── tier4_real_world.test.tsx  # Tier 4: Real-World Scenarios — 14 tests
    └── .built/                    # Ephemeral esbuild ESM output bundles (*.mjs)
```

---

## 3. Mocking Architecture & Invariants

| Layer | Implementation | Purpose |
|---|---|---|
| **GIS / Map Engine** | `frontend/tests/mocks/leafletMock.tsx` | Replaces browser-only `leaflet` and `react-leaflet` with headless React components emitting standard `.leaflet-container`, `.map-shell-container`, and `.leaflet-tile-pane` classes. |
| **Data Fetching Hook** | `frontend/tests/mocks/useFetchMock.ts` | Intercepts `useFetch(fn, deps)` calls, dynamically returning typed API responses derived from `apiFixtures.ts`. Supports per-test overrides via `setMockFetchOverride()` and `resetMockFetchOverride()`. |
| **API Schema Fixtures** | `frontend/tests/mocks/apiFixtures.ts` | Provides immutable, schema-compliant data fixtures matching PostgreSQL tables and FastAPI Pydantic models (36 states, districts, telemetry observations, 7-horizon LightGBM predictions). |
| **SSR DOM Renderer** | `frontend/tests/mocks/testUtils.tsx` | Executes `renderToStaticMarkup` on React elements and provides string/regex assertion utilities (`assertContains`, `assertNotContains`, `assertMatches`). |
| **Vite Environment Injection** | `run_e2e_tests.mjs` (`define`) | Defines `import.meta.env.VITE_API_BASE_URL`, `import.meta.env.MODE`, and `import.meta.env.PROD` so client modules execute identically to Vite runtime. |

---

## 4. Four-Tier Testing Hierarchy

### Tier 1: Feature Coverage (F1 to F15)
- **File**: `frontend/tests/tier1_features.test.tsx`
- **Scope**: Direct isolated verification of each feature in the frontend redesign specification:
  - **F1 (IndiaMap Shell & Layout)**: Validates map container, toolbar, overlay controls, legend bar, and state name normalization.
  - **F2 (IndiaMap Page Integration)**: Validates page header, 4 KPI chips, and 2-column grid.
  - **F3 (Meteorological Overlays)**: Validates temperature, rainfall, humidity, and wind speed scales with threshold coloring.
  - **F4 (State Selection & Telemetry)**: Validates unselected empty note, quick-select state chips, and regional telemetry panel.
  - **F5 (ML Architecture Flow Diagram)**: Validates 5 connected pipeline stages (`Raw Data`, `Feature Pipeline`, `LightGBM Multi-Output`, `FastAPI Inference`, `React 18 UI`).
  - **F6 (Feature Taxonomy & Engineering)**: Validates 5 feature categories and 20 individual engineered predictors.
  - **F7 (Training Pipeline & Invariants)**: Validates temporal validation split table and 5 anti-leakage safeguards.
  - **F8 (ML REST API & Deployment Spec)**: Validates 6 standardized REST endpoint cards and 3 deployment architecture cards.
  - **F9 (Weather History Filter Toolbar & KPIs)**: Validates cascading state/district/station dropdowns, date bounds, and search.
  - **F10 (Weather History Trend Chart)**: Validates query filters, reset button, and visual trend controls.
  - **F11 (Weather History Sortable Table)**: Validates selection guidance card and structured filter container.
  - **F12 (Model Performance Evaluation)**: Validates production validation status badge, hero metrics, and MAE/RMSE/R² metrics.
  - **F13 (Model Baseline Comparison)**: Validates benchmark comparison bar chart, metric toggles, and comparison table.
  - **F14 (Prediction History Audit Log)**: Validates audit log table, state filter, page size selector, and refresh button.
  - **F15 (Prediction History Detail Modal)**: Validates auto-loading skeleton on mount and audit detail drawer.
- **Count**: 18 tests (All PASS)

### Tier 2: Boundary & Corner Cases
- **File**: `frontend/tests/tier2_boundary.test.tsx`
- **Scope**: Stress testing extreme inputs, missing data, and error boundaries:
  - **2.1 Empty States**: Verifies `EmptyNote` displays on IndiaMapPage, WeatherHistoryPage, and PredictionHistoryPage.
  - **2.2 Missing & Partial Data**: Graceful rendering when telemetry observations or optional performance metrics are null.
  - **2.3 Network Error Banners**: Verifies `ErrorBanner` displays with `role="alert"`, danger icon, and retry callback.
  - **2.4 Boundary Date Ranges**: Verifies single-day date ranges and custom skeleton row count boundaries.
  - **2.5 Query Sanitization & Zero Results**: Verifies resilience against SQL injection attempts, control characters, and special symbols in search inputs.
  - **2.6 Temperature Threshold Coloring**: Mathematical boundary tests for extreme freezing (< 15°C) and scorching (> 35°C) heat.
- **Count**: 16 tests (All PASS)

### Tier 3: Cross-Feature Combinations
- **File**: `frontend/tests/tier3_cross_feature.test.tsx`
- **Scope**: Multi-module coordination and state propagation across feature boundaries:
  - **3.1 Map to Forecast Pre-Selection Handoff**: Validates propagating selected state from `IndiaMapPage` to `ForecastPage`.
  - **3.2 Cascading Geography & Date Filter Coordination**: Validates state -> district -> station cascade and date presets in `WeatherHistoryPage`.
  - **3.3 Model Performance Multi-Metric Synchronization**: Validates synchronized toggling between MAE, RMSE, and R² metrics.
  - **3.4 Prediction History Audit Filters & Detail Synchronization**: Validates model version and state filters alongside pagination.
  - **3.5 Multi-Metric Map Overlay Synchronization**: Validates dynamic switching of metric legends, color scales, and units across overlays.
- **Count**: 5 tests (All PASS)

### Tier 4: Real-World Scenarios
- **File**: `frontend/tests/tier4_real_world.test.tsx`
- **Scope**: Operator workflows, shell responsiveness, telemetry synchronization, and persistence:
  - **4.1 Complete 6-Module Operator Workflow**: End-to-end operator traversal across Forecast -> Map -> ML -> History -> Model -> Predictions.
  - **4.2 Sidebar Collapse/Expand & Persistence**: Validates sidebar toggle and state persistence in `localStorage.getItem("weathercast_sidebar_collapsed")`.
  - **4.3 Live Health Status Indicator**: Validates all 4 health states (`ok`, `checking`, `degraded`, `down`) and backend status mapping.
  - **4.4 System Clock & Header Telemetry**: Validates topbar clock container and date/time formatting.
  - **4.5 Responsive Mobile Navigation Drawer & Overlay**: Validates mobile menu toggle and overlay `mobile-open` state.
  - **4.6 Breadcrumbs Synchronization**: Validates breadcrumbs root and active state badge formatting (`Platform / [Module] / [State]`).
- **Count**: 14 tests (All PASS)

---

## 5. Verification Commands

To execute the test suite:
```bash
# Direct runner invocation from repository root
node frontend/scripts/run_e2e_tests.mjs

# Or from the frontend subdirectory via npm
cd frontend
npm test
```

To verify production bundle compilation and TypeScript types:
```bash
cd frontend
npm run build
```
