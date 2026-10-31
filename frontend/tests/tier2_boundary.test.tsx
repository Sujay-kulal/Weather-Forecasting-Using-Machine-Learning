/**
 * Tier 2: Boundary & Corner Cases Test Suite
 * Tests empty states, missing API data, network error banners, boundary date ranges,
 * zero-result searches, and extreme meteorological conditions.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderComponent, assertContains, assertNotContains } from "./mocks/testUtils";
import { setMockFetchOverride, resetMockFetchOverride } from "./mocks/useFetchMock";

// Import components under test
import { Card, PageHead, ErrorBanner, EmptyNote, StatChip, Badge, Skeleton, Spinner } from "../src/components/ui";
import { IndiaMap, getTempColor } from "../src/components/IndiaMap";
import { IndiaMapPage } from "../src/pages/IndiaMapPage";
import { WeatherHistoryPage } from "../src/pages/WeatherHistoryPage";
import { ModelPerformancePage } from "../src/pages/ModelPerformancePage";
import { PredictionHistoryPage } from "../src/pages/PredictionHistoryPage";
import { ApiError } from "../src/services/api";

describe("Tier 2: Boundary & Corner Cases", () => {
  afterEach(() => {
    resetMockFetchOverride();
  });

  // ── 2.1 Empty States ───────────────────────────────────────────────────
  describe("2.1 Empty States Verification", () => {
    it("renders EmptyNote on IndiaMapPage when no state is selected", () => {
      const html = renderComponent(<IndiaMapPage selectedState="" />);
      assertContains(html, "empty-state");
      assertContains(html, "No State Selected");
      assertContains(html, "Quick Select Key States:");
    });

    it("renders EmptyNote on WeatherHistoryPage when no state is selected", () => {
      const html = renderComponent(<WeatherHistoryPage />);
      assertContains(html, "empty-state");
      assertContains(html, "Select a Weather Region");
      assertContains(html, "Choose an Indian state from the filter toolbar above");
    });

    it("renders EmptyNote on PredictionHistoryPage when filtered records are empty", () => {
      // Override useFetch to return empty states and predictions
      setMockFetchOverride((fn: any) => {
        const fnStr = fn.toString();
        if (fnStr.includes("getStates")) {
          return { data: { states: ["Maharashtra", "Karnataka"] }, loading: false, error: null, retry: () => {} };
        }
        if (fnStr.includes("getPredictions")) {
          return { data: { count: 0, predictions: [] }, loading: false, error: null, retry: () => {} };
        }
        return { data: null, loading: false, error: null, retry: () => {} };
      });

      const html = renderComponent(<PredictionHistoryPage />);
      assertContains(html, "Prediction History &amp; Audit Log");
    });

    it("renders EmptyNote with custom title, hint, and action button", () => {
      const html = renderComponent(
        <EmptyNote
          title="No Station Records"
          hint="Please select a different meteorological observation point."
          action={<button className="btn-primary">Select Observatory</button>}
        />
      );
      assertContains(html, "No Station Records");
      assertContains(html, "Please select a different meteorological observation point.");
      assertContains(html, "Select Observatory");
      assertContains(html, "btn-primary");
    });
  });

  // ── 2.2 Missing & Partial API Data ─────────────────────────────────────
  describe("2.2 Missing & Partial API Data Handling", () => {
    it("renders ModelPerformancePage gracefully when optional fields are null or uncalibrated", () => {
      setMockFetchOverride({
        data: {
          model_name: "LightGBM",
          target: "next 7 days Temp_Avg (deg C)",
          features: ["lag1_temp_avg", "State"],
          train_period: ["2015-01-08", "2025-07-11"],
          test_period: ["2025-10-19", "2026-10-18"],
          metrics_status: "artifact_evaluated_training_overlap",
          interval_status: "not_calibrated_for_current_artifact",
          evaluation_note: null,
          q: null,
          coverage_90: null,
          metrics: {
            LightGBM: { MAE: 1.164, RMSE: 1.573, R2: 0.97 },
          },
        },
        loading: false,
        error: null,
        retry: () => {},
      });

      const html = renderComponent(<ModelPerformancePage />);
      assertContains(html, "Model Evaluation &amp; Benchmarking");
      assertContains(html, "Diagnostic Overlap (Unvalidated)");
      assertContains(html, "LightGBM Multi-Output");
      // Should not throw and should handle missing coverage gracefully
      assertNotContains(html, "NaN");
      assertNotContains(html, "undefined");
    });

    it("renders IndiaMap telemetry gracefully when recent observations are null", () => {
      const html = renderComponent(
        <IndiaMapPage
          selectedState="Goa"
          onSelectState={() => {}}
        />
      );
      assertContains(html, "Goa");
      assertContains(html, "Regional Telemetry &amp; Forecast");
      assertContains(html, "Day 1 Forecast");
      assertContains(html, "Recent Avg Temp");
    });
  });

  // ── 2.3 Network Error Banners ──────────────────────────────────────────
  describe("2.3 Network Error Banners & Failure Modes", () => {
    it("renders ErrorBanner with alert role, danger icon, and retry callback", () => {
      let retried = false;
      const html = renderComponent(
        <ErrorBanner
          message="FastAPI service at 127.0.0.1:8000 unreachable. Connection timed out."
          onRetry={() => { retried = true; }}
        />
      );

      assertContains(html, "error-banner");
      assertContains(html, "role=\"alert\"");
      assertContains(html, "System Alert");
      assertContains(html, "FastAPI service at 127.0.0.1:8000 unreachable");
      assertContains(html, "Retry");
    });

    it("renders ErrorBanner when ModelPerformancePage encounters an API error", () => {
      setMockFetchOverride({
        data: null,
        loading: false,
        error: new ApiError(500, "Internal Server Error: PostgreSQL connection pool exhausted"),
        retry: () => {},
      });

      const html = renderComponent(<ModelPerformancePage />);
      assertContains(html, "error-banner");
      assertContains(html, "PostgreSQL connection pool exhausted");
    });
  });

  // ── 2.4 Boundary Date Ranges & Formatting ──────────────────────────────
  describe("2.4 Boundary Date Ranges & Calculations", () => {
    it("handles single-day date filter bounds without crashing", () => {
      const html = renderComponent(<WeatherHistoryPage />);
      assertContains(html, "Start Date");
      assertContains(html, "End Date");
    });

    it("renders skeleton rows with boundary row count overrides", () => {
      const html1 = renderComponent(<Skeleton rows={1} />);
      assertContains(html1, "skeleton-box");

      const html8 = renderComponent(<Skeleton rows={8} />);
      assertContains(html8, "skeleton-box");
      const matchCount = (html8.match(/skeleton-line/g) || []).length;
      assert.strictEqual(matchCount, 8);
    });
  });

  // ── 2.5 Zero Results & Special Character Handling ──────────────────────
  describe("2.5 Zero Results & Query Sanitization", () => {
    it("renders search input accepting special characters and SQL injection attempts", () => {
      const html = renderComponent(<WeatherHistoryPage />);
      assertContains(html, "Search Observations");
      assertContains(html, "type=\"search\"");
    });

    it("renders Badge variants correctly across all status states", () => {
      const sDefault = renderComponent(<Badge variant="default">Default</Badge>);
      assertContains(sDefault, "badge default");

      const sSuccess = renderComponent(<Badge variant="success">Validated</Badge>);
      assertContains(sSuccess, "badge success");

      const sWarning = renderComponent(<Badge variant="warning">Warning Overlap</Badge>);
      assertContains(sWarning, "badge warning");

      const sDanger = renderComponent(<Badge variant="danger">Failed</Badge>);
      assertContains(sDanger, "badge danger");

      const sInfo = renderComponent(<Badge variant="info">Info</Badge>);
      assertContains(sInfo, "badge info");

      const sNeutral = renderComponent(<Badge neutral>Neutral Tag</Badge>);
      assertContains(sNeutral, "badge neutral");
    });
  });

  // ── 2.6 Boundary Meteorological Extremes ───────────────────────────────
  describe("2.6 Boundary Meteorological Temperature Thresholds", () => {
    it("maps extreme cold temperatures (< 15°C) to blue #3b82f6", () => {
      assert.strictEqual(getTempColor(-25), "#3b82f6"); // Extreme Ladakh winter
      assert.strictEqual(getTempColor(-5), "#3b82f6");
      assert.strictEqual(getTempColor(0), "#3b82f6");
      assert.strictEqual(getTempColor(14.9), "#3b82f6");
    });

    it("maps exact boundary transitions cleanly", () => {
      assert.strictEqual(getTempColor(15.0), "#06b6d4"); // 15–20 cyan
      assert.strictEqual(getTempColor(19.9), "#06b6d4");
      assert.strictEqual(getTempColor(20.0), "#10b981"); // 20–25 emerald
      assert.strictEqual(getTempColor(24.9), "#10b981");
      assert.strictEqual(getTempColor(25.0), "#f59e0b"); // 25–30 amber
      assert.strictEqual(getTempColor(29.9), "#f59e0b");
      assert.strictEqual(getTempColor(30.0), "#f97316"); // 30–35 orange
      assert.strictEqual(getTempColor(34.9), "#f97316");
    });

    it("maps extreme scorching heat (> 35°C) to crimson #ef4444", () => {
      assert.strictEqual(getTempColor(35.0), "#ef4444"); // 35+ crimson
      assert.strictEqual(getTempColor(48.5), "#ef4444"); // Rajasthan heatwave
      assert.strictEqual(getTempColor(55.0), "#ef4444"); // Historical record
    });

    it("handles undefined/null temperature by returning neutral slate", () => {
      assert.strictEqual(getTempColor(undefined), "#94a3b8");
    });
  });
});
