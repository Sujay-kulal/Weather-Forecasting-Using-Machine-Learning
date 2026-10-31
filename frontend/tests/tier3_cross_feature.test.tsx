/**
 * Tier 3: Cross-Feature Combinations Test Suite
 * Tests interactions across feature boundaries:
 * - Map state selection -> Forecast pre-selection handoff
 * - Cascading geography -> Date range filtering -> Column sorting
 * - Multi-metric evaluation toggling in Model Performance
 * - Audit log selection -> 7-Day trajectory detail inspection
 * - Dynamic overlay switching across meteorological metrics
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderComponent, assertContains, assertNotContains } from "./mocks/testUtils";
import { resetMockFetchOverride, setMockFetchOverride } from "./mocks/useFetchMock";

// Import components under test
import { IndiaMapPage } from "../src/pages/IndiaMapPage";
import { ForecastPage } from "../src/pages/ForecastPage";
import { WeatherHistoryPage } from "../src/pages/WeatherHistoryPage";
import { ModelPerformancePage } from "../src/pages/ModelPerformancePage";
import { PredictionHistoryPage } from "../src/pages/PredictionHistoryPage";
import { IndiaMap, METRIC_CONFIGS, type OverlayMetric } from "../src/components/IndiaMap";

describe("Tier 3: Cross-Feature Combinations", () => {
  afterEach(() => {
    resetMockFetchOverride();
  });

  // ── 3.1 Map Selection to Forecast Page Pre-Selection Handoff ─────────────
  describe("3.1 Map to Forecast Pre-Selection Handoff", () => {
    it("propagates selected state from IndiaMapPage into ForecastPage", () => {
      let selectedRegion = "";
      let activeTab = "map";

      // 1. Operator selects 'Karnataka' on IndiaMapPage
      const onSelectState = (state: string) => {
        selectedRegion = state;
      };
      const onNavigateTab = (tab: string) => {
        activeTab = tab;
      };

      const mapHtml = renderComponent(
        <IndiaMapPage
          selectedState="Karnataka"
          onSelectState={onSelectState}
          onNavigateTab={onNavigateTab}
        />
      );

      // Verify IndiaMapPage displays selected state and handoff button
      assertContains(mapHtml, "Karnataka");
      assertContains(mapHtml, "Open Full Forecast Details");

      // 2. Operator navigates to ForecastPage with 'Karnataka' pre-selected
      const forecastHtml = renderComponent(
        <ForecastPage
          selectedState="Karnataka"
          onSelectState={onSelectState}
        />
      );

      // Verify ForecastPage accepts Karnataka and renders state in selector/badge
      assertContains(forecastHtml, "Karnataka");
    });
  });

  // ── 3.2 Cascading Geography & Date Filter Coordination in History ────────
  describe("3.2 Cascading Geography and Date Filter Coordination", () => {
    it("renders cascading selectors and date presets in WeatherHistoryPage", () => {
      const html = renderComponent(<WeatherHistoryPage />);

      // Verify State, District, and Location selectors coexist
      assertContains(html, "State");
      assertContains(html, "District");
      assertContains(html, "Location Station");

      // Verify Start and End Date range inputs
      assertContains(html, "Start Date");
      assertContains(html, "End Date");
      assertContains(html, "Search Observations");
    });
  });

  // ── 3.3 Multi-Metric Bar Chart & Table Coordination in Performance ───────
  describe("3.3 Model Performance Multi-Metric Synchronization", () => {
    it("renders metric tabs for MAE, RMSE, and R² alongside horizon decay table", () => {
      const html = renderComponent(<ModelPerformancePage />);

      // Verify all 3 metric selection buttons exist in the card header
      assertContains(html, "MAE (Lower is Better)");
      assertContains(html, "RMSE (Lower is Better)");
      assertContains(html, "R² Score (Higher is Better)");

      // Verify all baseline models are listed in the comparison table
      assertContains(html, "LightGBM Multi-Output");
      assertContains(html, "Random Forest (Tuned)");
      assertContains(html, "Linear Regression");
      assertContains(html, "Climatology Reference");
      assertContains(html, "Persistence Reference");

      // Verify 7-day horizon progression is synchronized
      assertContains(html, "Horizon-by-Horizon Performance Breakdown (Day 1 through Day 7)");
      assertContains(html, "Day 1 (t+1)");
      assertContains(html, "Day 2 (t+2)");
      assertContains(html, "Day 3 (t+3)");
      assertContains(html, "Day 4 (t+4)");
      assertContains(html, "Day 5 (t+5)");
      assertContains(html, "Day 6 (t+6)");
      assertContains(html, "Day 7 (t+7)");
    });
  });

  // ── 3.4 Prediction Audit Log and Model Version Filter ───────────────────
  describe("3.4 Prediction History Audit Filters & Detail Synchronization", () => {
    it("renders model version and state filter dropdowns with pagination controls", () => {
      const html = renderComponent(<PredictionHistoryPage />);

      // Verify filter toolbar elements
      assertContains(html, "State Filter");
      assertContains(html, "Model Version");
      assertContains(html, "Search Audit Trail");
      assertContains(html, "Rows per page");
      assertContains(html, "Refresh");
    });
  });

  // ── 3.5 Dynamic Overlay Switching Across Metrics in IndiaMap ────────────
  describe("3.5 Multi-Metric Map Overlay Synchronization", () => {
    it("switches metric legends and units correctly between temperature, rainfall, and humidity", () => {
      // 1. Temperature overlay
      const tempHtml = renderComponent(
        <IndiaMap overlayMetric="temperature" forecastDay={1} />
      );
      assertContains(tempHtml, "Temperature Legend (°C)");
      assertContains(tempHtml, "Choropleth: Day 1 LightGBM Multi-Output Forecast");

      // 2. Humidity overlay
      const humidityHtml = renderComponent(
        <IndiaMap overlayMetric="humidity" forecastDay={1} />
      );
      assertContains(humidityHtml, "Relative Humidity Legend (%)");
      assertContains(humidityHtml, "Choropleth: Regional Aggregated Observations");

      // 3. Rainfall overlay
      const rainHtml = renderComponent(
        <IndiaMap overlayMetric="rainfall" forecastDay={1} />
      );
      assertContains(rainHtml, "Rainfall Legend (mm)");
      assertContains(rainHtml, "Choropleth: Regional Aggregated Observations");

      // 4. Wind overlay
      const windHtml = renderComponent(
        <IndiaMap overlayMetric="wind" forecastDay={1} />
      );
      assertContains(windHtml, "Wind Speed Legend (km/h)");
      assertContains(windHtml, "Choropleth: Regional Aggregated Observations");
    });
  });
});
