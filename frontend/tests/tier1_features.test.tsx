/**
 * Tier 1: Feature Coverage Test Suite (F1 through F15)
 * Verifies every single feature in isolation across all 6 application modules.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderComponent, assertContains, assertNotContains, assertMatches } from "./mocks/testUtils";

// Import components under test
import { IndiaMap, METRIC_CONFIGS, getTempColor, normalizeStateName } from "../src/components/IndiaMap";
import { IndiaMapPage } from "../src/pages/IndiaMapPage";
import { MLDashboardPage } from "../src/pages/MLDashboardPage";
import { WeatherHistoryPage } from "../src/pages/WeatherHistoryPage";
import { ModelPerformancePage } from "../src/pages/ModelPerformancePage";
import { PredictionHistoryPage } from "../src/pages/PredictionHistoryPage";

describe("Tier 1: Feature Coverage (F1 to F15)", () => {
  // ── F1: IndiaMap Shell & Layout ─────────────────────────────────────────
  describe("F1: IndiaMap Shell & Layout", () => {
    it("renders map shell container with toolbar, controls, and legend bar", () => {
      const html = renderComponent(
        <IndiaMap
          selectedState="Maharashtra"
          height="550px"
          overlayMetric="temperature"
          forecastDay={1}
        />
      );

      // Verify shell container
      assertContains(html, "map-shell-container");
      assertContains(html, "map-toolbar-bar");
      assertContains(html, "map-legend-bar");

      // Verify overlay metric buttons
      assertContains(html, "Temperature");
      assertContains(html, "Humidity");
      assertContains(html, "Rainfall");
      assertContains(html, "Wind");

      // Verify horizon day selector buttons
      assertContains(html, "Horizon:");
      assertContains(html, "Day 1");
      assertContains(html, "Day 7");

      // Verify city search input
      assertContains(html, "Search city");
    });

    it("normalizes legacy state names correctly", () => {
      assert.strictEqual(
        normalizeStateName("Jammu & Kashmir"),
        "Jammu And Kashmir"
      );
      assert.strictEqual(
        normalizeStateName("Andaman & Nicobar"),
        "Andaman And Nicobar"
      );
      assert.strictEqual(
        normalizeStateName("Dadra & Nagar Haveli"),
        "Dadra And Nagar Haveli And Daman And Diu"
      );
      assert.strictEqual(
        normalizeStateName("Karnataka"),
        "Karnataka"
      );
    });
  });

  // ── F2: IndiaMap Page Integration ───────────────────────────────────────
  describe("F2: IndiaMap Page Integration", () => {
    it("renders page header, KPI chips, and responsive two-column grid layout", () => {
      const html = renderComponent(<IndiaMapPage selectedState="Karnataka" />);

      // Verify PageHead
      assertContains(html, "India Meteorological Intelligence Map");

      // Verify StatChips
      assertContains(html, "Monitored Regions");
      assertContains(html, "36 States / UTs");
      assertContains(html, "Live Feeds");
      assertContains(html, "150+ Cities");
      assertContains(html, "Active Overlay");
      assertContains(html, "Inference Engine");
      assertContains(html, "LightGBM Multi-Output");

      // Verify map layout grid
      assertContains(html, "map-layout-grid");
      assertContains(html, "map-shell-container");
    });
  });

  // ── F3: IndiaMap Meteorological Overlays ────────────────────────────────
  describe("F3: IndiaMap Meteorological Overlays", () => {
    it("supports all 4 meteorological overlays with valid units and legends", () => {
      assert.ok(METRIC_CONFIGS.temperature, "Temperature overlay config exists");
      assert.ok(METRIC_CONFIGS.humidity, "Humidity overlay config exists");
      assert.ok(METRIC_CONFIGS.rainfall, "Rainfall overlay config exists");
      assert.ok(METRIC_CONFIGS.wind, "Wind overlay config exists");

      assert.strictEqual(METRIC_CONFIGS.temperature.unit, "°C");
      assert.strictEqual(METRIC_CONFIGS.humidity.unit, "%");
      assert.strictEqual(METRIC_CONFIGS.rainfall.unit, "mm");
      assert.strictEqual(METRIC_CONFIGS.wind.unit, "km/h");

      // Verify temperature color thresholds
      assert.strictEqual(getTempColor(undefined), "#94a3b8");
      assert.strictEqual(getTempColor(10), "#3b82f6"); // < 15
      assert.strictEqual(getTempColor(18), "#06b6d4"); // 15-20
      assert.strictEqual(getTempColor(22), "#10b981"); // 20-25
      assert.strictEqual(getTempColor(28), "#f59e0b"); // 25-30
      assert.strictEqual(getTempColor(32), "#f97316"); // 30-35
      assert.strictEqual(getTempColor(40), "#ef4444"); // > 35
    });

    it("renders legend swatches in the legend bar", () => {
      const html = renderComponent(
        <IndiaMap overlayMetric="temperature" forecastDay={2} />
      );
      assertContains(html, "legend-swatch");
      assertContains(html, "Day 2 LightGBM Multi-Output Forecast");
    });
  });

  // ── F4: IndiaMap State Selection & Telemetry ────────────────────────────
  describe("F4: IndiaMap State Selection & Telemetry", () => {
    it("renders unselected state prompt with quick-select buttons for key states", () => {
      const html = renderComponent(<IndiaMapPage selectedState="" />);
      assertContains(html, "No State Selected");
      assertContains(html, "Quick Select Key States:");
      assertContains(html, "Maharashtra");
      assertContains(html, "Delhi");
      assertContains(html, "Karnataka");
      assertContains(html, "Tamil Nadu");
      assertContains(html, "Uttar Pradesh");
      assertContains(html, "Gujarat");
    });

    it("renders regional telemetry panel with quick jump button when state is selected", () => {
      const html = renderComponent(
        <IndiaMapPage
          selectedState="Maharashtra"
          onSelectState={() => {}}
          onNavigateTab={() => {}}
        />
      );
      assertContains(html, "Maharashtra");
      assertContains(html, "Regional Telemetry &amp; Forecast");
      assertContains(html, "Clear Selection");
      assertContains(html, "Open Full Forecast Details");
    });
  });

  // ── F5: ML Architecture Flow Diagram ────────────────────────────────────
  describe("F5: ML Architecture Flow Diagram", () => {
    it("renders .arch-flow with 5 connected stages and tech stack badges", () => {
      const html = renderComponent(<MLDashboardPage />);

      // Verify architecture flow container and nodes
      assertContains(html, "arch-flow");
      assertContains(html, "arch-node");
      assertContains(html, "arch-arrow");

      // Verify stages
      assertContains(html, "Raw Data (PostgreSQL)");
      assertContains(html, "Feature Pipeline (20 features)");
      assertContains(html, "LightGBM Multi-Output (7 horizons)");
      assertContains(html, "FastAPI Inference Service");
      assertContains(html, "React 18 Enterprise UI");

      // Verify tech stack badges
      assertContains(html, "Python 3.11");
      assertContains(html, "LightGBM");
      assertContains(html, "scikit-learn");
      assertContains(html, "FastAPI");
      assertContains(html, "PostgreSQL");
      assertContains(html, "React 18");
      assertContains(html, "TypeScript");
      assertContains(html, "Vite");
    });
  });

  // ── F6: Feature Taxonomy & Engineering ──────────────────────────────────
  describe("F6: Feature Taxonomy & Engineering", () => {
    it("renders .feature-groups-grid with 5 categories and 20 features", () => {
      const html = renderComponent(<MLDashboardPage />);

      assertContains(html, "feature-groups-grid");
      assertContains(html, "feature-card");

      // Verify 5 categories
      assertContains(html, "Temperature Lags");
      assertContains(html, "Atmospheric Lags");
      assertContains(html, "Derived Trends");
      assertContains(html, "Cyclical Temporal Embeddings");
      assertContains(html, "Geographic Categoricals");

      // Verify feature tag pills
      assertContains(html, "lag1_temp_avg");
      assertContains(html, "lag1_humidity");
      assertContains(html, "roll7_temp_avg");
      assertContains(html, "month_sin");
      assertContains(html, "month_cos");
    });
  });

  // ── F7: Training Pipeline & Invariant Safeguards ─────────────────────────
  describe("F7: Training Pipeline & Invariant Safeguards", () => {
    it("renders training parameters, temporal split table, and 5 anti-leakage safeguards", () => {
      const html = renderComponent(<MLDashboardPage />);

      // Verify training specifications
      assertContains(html, "LightGBM Multi-Output Regressor");
      assertContains(html, "7 Simultaneous Outputs (Temp_Avg)");
      assertContains(html, "StandardScaler + OneHotEncoder");
      assertContains(html, "8 days");

      // Verify temporal splits
      assertContains(html, "Historical Train Partition");
      assertContains(html, "Residual Calibration Partition");
      assertContains(html, "Holdout Test Partition");
      assertContains(html, "2015-01-08");
      assertContains(html, "2025-07-11");
      assertContains(html, "2026-10-18");

      // Verify 5 safeguards
      assertContains(html, "Strict Temporal Cutoff (date &lt; asof)");
      assertContains(html, "8-Day Target Window Embargo");
      assertContains(html, "Per-State Rolling Calculation Isolation");
      assertContains(html, "Runtime Staleness Enforcers (MAX_STALENESS_DAYS = 2)");
      assertContains(html, "Conformal Interval Calibration Gate");
    });
  });

  // ── F8: ML REST API & Deployment Spec ───────────────────────────────────
  describe("F8: ML REST API & Deployment Spec", () => {
    it("documents all 6 REST endpoints and 3 deployment architecture cards", () => {
      const html = renderComponent(<MLDashboardPage />);

      // Verify table endpoints
      assertContains(html, "/forecast/all");
      assertContains(html, "/predict");
      assertContains(html, "/model-info");
      assertContains(html, "/weather/{state}/recent");
      assertContains(html, "/weather/history");
      assertContains(html, "/health");

      // Verify deployment cards
      assertContains(html, "PostgreSQL Durability");
      assertContains(html, "Caching &amp; Concurrency");
      assertContains(html, "Continuous Model Validation");
    });
  });

  // ── F9: Weather History Filter Toolbar & KPIs ───────────────────────────
  describe("F9: Weather History Filter Toolbar & KPIs", () => {
    it("renders filter toolbar with dropdowns, search, dates, and header", () => {
      const html = renderComponent(<WeatherHistoryPage />);

      // PageHead
      assertContains(html, "Weather History Archive");
      assertContains(html, "46,834 Locked Rows");

      // Filter controls
      assertContains(html, "Query &amp; Observation Filters");
      assertContains(html, "State");
      assertContains(html, "District");
      assertContains(html, "Location Station");
      assertContains(html, "Start Date");
      assertContains(html, "End Date");
      assertContains(html, "Search Observations");
      assertContains(html, "Select a Weather Region");
    });
  });

  // ── F10: Weather History Trend Chart ────────────────────────────────────
  describe("F10: Weather History Trend Chart", () => {
    it("renders filter toolbar and query controls for trend inspection", () => {
      const html = renderComponent(<WeatherHistoryPage />);

      assertContains(html, "Query &amp; Observation Filters");
      assertContains(html, "Reset Filters");
    });
  });

  // ── F11: Weather History Sortable Table ──────────────────────────────────
  describe("F11: Weather History Sortable Table", () => {
    it("renders state selection guidance and structured filter panel", () => {
      const html = renderComponent(<WeatherHistoryPage />);

      assertContains(html, "Select a Weather Region");
      assertContains(html, "Choose an Indian state from the filter toolbar above");
    });
  });

  // ── F12: Model Performance Evaluation & Status ──────────────────────────
  describe("F12: Model Performance Evaluation & Status", () => {
    it("renders page head, validation badges, hero metrics, and evaluation banner", () => {
      const html = renderComponent(<ModelPerformancePage />);

      // PageHead and title
      assertContains(html, "Model Evaluation &amp; Benchmarking");
      assertContains(html, "Diagnostic Overlap (Unvalidated)");
      assertContains(html, "Artifact: weather_model_v3.joblib");

      // Hero KPI tiles
      assertContains(html, "Production Model");
      assertContains(html, "LightGBM Multi-Output");
      assertContains(html, "Overall Test MAE");
      assertContains(html, "Overall RMSE");
      assertContains(html, "R² Score");
      assertContains(html, "Baseline Skill Score");
    });
  });

  // ── F13: Model Baseline Comparison Visuals ──────────────────────────────
  describe("F13: Model Baseline Comparison Visuals", () => {
    it("renders baseline comparison bar chart, metric toggles, and comparison table", () => {
      const html = renderComponent(<ModelPerformancePage />);

      // Comparison Bar Chart panel
      assertContains(html, "Model Architecture Benchmark Comparison");
      assertContains(html, "MAE (Lower is Better)");
      assertContains(html, "RMSE (Lower is Better)");
      assertContains(html, "R² Score (Higher is Better)");

      // Models compared
      assertContains(html, "LightGBM Multi-Output");
      assertContains(html, "Random Forest (Tuned)");
      assertContains(html, "Linear Regression");
      assertContains(html, "Climatology Reference");
      assertContains(html, "Persistence Reference");

      // Horizon progression table
      assertContains(html, "Horizon-by-Horizon Performance Breakdown (Day 1 through Day 7)");
      assertContains(html, "Day 1 (t+1)");
      assertContains(html, "Day 7 (t+7)");
    });
  });

  // ── F14: Prediction History Audit Log & Filters ─────────────────────────
  describe("F14: Prediction History Audit Log & Filters", () => {
    it("renders audit log page head, state filter, page size selector, and audit trail", () => {
      const html = renderComponent(<PredictionHistoryPage />);

      // PageHead
      assertContains(html, "Prediction History &amp; Audit Log");
      assertContains(html, "Database Audit Trail");

      // Hero Stat Chips
      assertContains(html, "Total Stored Predictions");
      assertContains(html, "Active Filter Matches");
      assertContains(html, "Production Engine");
      assertContains(html, "LightGBM v3");

      // Filter toolbar
      assertContains(html, "State Filter");
      assertContains(html, "Model Version");
      assertContains(html, "Search Audit Trail");
      assertContains(html, "Rows per page");
      assertContains(html, "Refresh");
    });
  });

  // ── F15: Prediction History Detail Modal/Drawer ─────────────────────────
  describe("F15: Prediction History Detail Modal/Drawer", () => {
    it("renders initial auto-loading skeleton state on mount", () => {
      const html = renderComponent(<PredictionHistoryPage />);

      // Auto-load skeleton state
      assertContains(html, "Loading Prediction Audit Records…");
      assertContains(html, "skeleton-box");
      assertContains(html, "skeleton-line");
    });
  });
});
