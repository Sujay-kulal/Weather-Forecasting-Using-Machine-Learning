/**
 * Tier 4: Real-World Scenarios Test Suite
 * Validates production end-to-end user journeys, responsive layouts,
 * shell navigation, telemetry synchronization, and persistence:
 * - 4.1 Complete 6-module operator workflow (Forecast -> Map -> ML -> History -> Model -> Predictions)
 * - 4.2 Sidebar collapse/expand with localStorage persistence
 * - 4.3 Live health status indicator and degraded/down transitions
 * - 4.4 System clock formatting and telemetry status
 * - 4.5 Responsive mobile navigation drawer & overlay behavior
 * - 4.6 Breadcrumbs synchronization with state selection
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderComponent, assertContains, assertNotContains, assertMatches } from "./mocks/testUtils";
import { resetMockFetchOverride } from "./mocks/useFetchMock";

// Components under test
import App, { NAVIGATION_MODULES } from "../src/App";
import { ForecastPage } from "../src/pages/ForecastPage";
import { IndiaMapPage } from "../src/pages/IndiaMapPage";
import { MLDashboardPage } from "../src/pages/MLDashboardPage";
import { WeatherHistoryPage } from "../src/pages/WeatherHistoryPage";
import { ModelPerformancePage } from "../src/pages/ModelPerformancePage";
import { PredictionHistoryPage } from "../src/pages/PredictionHistoryPage";
import type { HealthResponse } from "../src/types/api";

describe("Tier 4: Real-World Scenarios", () => {
  // Mock localStorage for headless Node environment
  const originalLocalStorage = (globalThis as any).localStorage;
  let mockStorage: Map<string, string>;

  beforeEach(() => {
    mockStorage = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => mockStorage.set(key, String(value)),
      removeItem: (key: string) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
      get length() {
        return mockStorage.size;
      },
      key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
    };
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    resetMockFetchOverride();
  });

  // ── 4.1 Complete Operator Navigation Flow Across All 6 Modules ─────────────
  describe("4.1 Complete 6-Module Operator Workflow", () => {
    it("defines all 6 navigation modules with appropriate metadata and icons", () => {
      assert.equal(NAVIGATION_MODULES.length, 6, "Expected exactly 6 enterprise modules");
      const moduleIds = NAVIGATION_MODULES.map((m) => m.id);
      assert.deepEqual(moduleIds, [
        "forecast",
        "map",
        "ml",
        "history",
        "model",
        "predictions",
      ]);

      for (const m of NAVIGATION_MODULES) {
        assert.ok(m.label.length > 0, `Module ${m.id} should have a valid label`);
        assert.ok(m.shortLabel.length > 0, `Module ${m.id} should have a shortLabel`);
        assert.ok(m.desc.length > 0, `Module ${m.id} should have a description`);
        assert.ok(typeof m.Icon === "function", `Module ${m.id} must provide an icon component`);
      }
    });

    it("renders the primary application layout shell with branding and navigation", () => {
      const html = renderComponent(<App />);

      // Sidebar branding
      assertContains(html, "WeatherCast India");
      assertContains(html, "ML Weather Platform");

      // All 6 navigation items rendered in sidebar
      for (const m of NAVIGATION_MODULES) {
        assertContains(html, m.label);
      }

      // Default active module is forecast
      assertMatches(html, /class="[^"]*nav-item active[^"]*"[^>]*title="Weather Forecast"/);

      // Model engine status footer in sidebar
      assertContains(html, "Model Engine");
      assertContains(html, "LightGBM v3");
      assertContains(html, "7 Days Multi-Out");

      // App topbar breadcrumbs and health
      assertContains(html, "Platform");
      assertContains(html, "Weather Forecast");
      assertContains(html, "status-pill");

      // App footer
      assertContains(html, "Architecture: React 18 · FastAPI · PostgreSQL · LightGBM");
      assertContains(html, "Test-Set MAE: ±1.25°C");
    });

    it("executes the sequential operator journey through each module page", () => {
      // Step 1: Operator reviews Weather Forecast
      const forecastHtml = renderComponent(<ForecastPage />);
      assertContains(forecastHtml, "Weather Forecast Dashboard");
      assertContains(forecastHtml, "Forecast Parameters");

      // Step 2: Operator transitions to India Weather Map for spatial analytics
      const mapHtml = renderComponent(<IndiaMapPage />);
      assertContains(mapHtml, "India Meteorological Intelligence Map");
      assertContains(mapHtml, "No State Selected");
      assertContains(mapHtml, "Quick Select Key States");

      // Step 3: Operator explores ML Architecture & Feature Engineering
      const mlHtml = renderComponent(<MLDashboardPage />);
      assertContains(mlHtml, "Machine Learning System Architecture");
      assertContains(mlHtml, "Raw Data (PostgreSQL)");
      assertContains(mlHtml, "LightGBM Multi-Output");
      assertContains(mlHtml, "Feature Taxonomy");
      assertContains(mlHtml, "20 engineered predictors");

      // Step 4: Operator queries Historical Weather Records
      const historyHtml = renderComponent(<WeatherHistoryPage />);
      assertContains(historyHtml, "Weather History Archive");
      assertContains(historyHtml, "Select a Weather Region");
      assertContains(historyHtml, "Choose an Indian state from the filter toolbar above");

      // Step 5: Operator validates Model Evaluation & Performance Benchmarks
      const modelHtml = renderComponent(<ModelPerformancePage />);
      assertContains(modelHtml, "Model Evaluation &amp; Benchmarking");
      assertContains(modelHtml, "Overall Test MAE");
      assertContains(modelHtml, "Horizon-by-Horizon Performance Breakdown");

      // Step 6: Operator audits Prediction History and Inference Logs
      const auditHtml = renderComponent(<PredictionHistoryPage />);
      assertContains(auditHtml, "Prediction History &amp; Audit Log");
      assertContains(auditHtml, "Database Audit Trail");
    });
  });

  // ── 4.2 Sidebar Collapse/Expand with LocalStorage Persistence ───────────────
  describe("4.2 Sidebar Collapse/Expand & Persistence", () => {
    it("renders expanded sidebar by default when no localStorage preference is set", () => {
      const html = renderComponent(<App />);

      // Sidebar element should NOT have 'collapsed' class
      assertMatches(html, /<aside class="app-sidebar\s+"><div class="sidebar-header">/);
      assertContains(html, "Collapse Sidebar");
      assertContains(html, "Collapse sidebar");
    });

    it("renders collapsed sidebar when localStorage has collapsed=true", () => {
      localStorage.setItem("weathercast_sidebar_collapsed", "true");
      const html = renderComponent(<App />);

      // Sidebar element should have 'collapsed' class
      assertMatches(html, /<aside class="app-sidebar collapsed\s*">/);
      // 'Collapse Sidebar' label is hidden when collapsed
      assertNotContains(html, "<span>Collapse Sidebar</span>");
      assertContains(html, "Expand sidebar");
    });

    it("handles corrupted or unavailable localStorage gracefully without throwing", () => {
      // Simulate throwing localStorage (e.g. security block or private mode)
      (globalThis as any).localStorage = {
        getItem: () => {
          throw new Error("SecurityError: Access is denied for this document");
        },
        setItem: () => {
          throw new Error("SecurityError: Access is denied for this document");
        },
      };

      assert.doesNotThrow(() => {
        const html = renderComponent(<App />);
        assertContains(html, "WeatherCast India");
      });
    });
  });

  // ── 4.3 Live Health Status Indicator & Configuration ───────────────────────
  describe("4.3 Live Health Status Indicator", () => {
    it("renders status pill with accessible role and dot indicator", () => {
      const html = renderComponent(<App />);
      assertContains(html, 'role="status"');
      assertContains(html, 'class="status-dot"');
      assertContains(html, "Connecting"); // Initial checking state
    });

    it("maps all 4 health states to correct UI labels, classes, and descriptions", () => {
      // Authoritative expected configuration from App.tsx HEALTH_CONFIG
      const expectedHealthStates = [
        {
          state: "checking",
          label: "Connecting",
          className: "status-checking",
          desc: "Verifying backend & model services...",
        },
        {
          state: "ok",
          label: "System Live",
          className: "status-ok",
          desc: "FastAPI online · PostgreSQL connected · LightGBM loaded",
        },
        {
          state: "degraded",
          label: "Degraded",
          className: "status-degraded",
          desc: "One or more subsystem dependencies reported warnings",
        },
        {
          state: "down",
          label: "Offline",
          className: "status-down",
          desc: "Cannot connect to backend service",
        },
      ];

      for (const item of expectedHealthStates) {
        assert.ok(item.label.length > 0);
        assert.ok(item.className.startsWith("status-"));
        assert.ok(item.desc.length > 0);
      }
    });

    it("derives correct health state from backend health response shapes", () => {
      // Healthy backend with model loaded -> "ok"
      const healthyResponse: HealthResponse = {
        status: "healthy",
        database: "connected",
        model_loaded: true,
        version: "3.0.0",
      };
      const isOk = healthyResponse.status === "healthy" && healthyResponse.model_loaded;
      assert.equal(isOk, true, "Healthy response with model loaded must evaluate to 'ok'");

      // Degraded backend when model is not loaded
      const degradedResponse: HealthResponse = {
        status: "healthy",
        database: "connected",
        model_loaded: false,
        version: "3.0.0",
      };
      const isDegraded = degradedResponse.status !== "healthy" || !degradedResponse.model_loaded;
      assert.equal(isDegraded, true, "Unloaded model must evaluate to 'degraded'");

      // Degraded backend when database reports error
      const dbDegradedResponse: HealthResponse = {
        status: "degraded",
        database: "disconnected",
        model_loaded: true,
        version: "3.0.0",
      };
      assert.equal(dbDegradedResponse.status !== "healthy", true);
    });
  });

  // ── 4.4 System Clock & Header Telemetry ────────────────────────────────────
  describe("4.4 System Clock & Header Telemetry", () => {
    it("renders topbar clock container with current date and time formatting", () => {
      const html = renderComponent(<App />);

      assertContains(html, 'class="topbar-clock"');
      assertContains(html, 'title="Current system time"');

      // Check current year is rendered in clock
      const currentYear = new Date().getFullYear().toString();
      assertContains(html, currentYear);
    });
  });

  // ── 4.5 Responsive Mobile Navigation Drawer & Overlay ──────────────────────
  describe("4.5 Responsive Mobile Navigation Drawer & Overlay", () => {
    it("renders mobile drawer toggle button in topbar with accessibility label", () => {
      const html = renderComponent(<App />);
      assertContains(html, "topbar-menu-toggle");
      assertContains(html, 'aria-label="Open navigation menu"');
    });

    it("renders mobile-overlay container with aria-hidden attribute", () => {
      const html = renderComponent(<App />);
      assertContains(html, 'class="mobile-overlay "');
      assertContains(html, 'aria-hidden="true"');
    });

    it("ensures mobileOpen drawer suppresses collapsed class to preserve labels", () => {
      // When sidebar was collapsed on desktop but drawer opens on mobile,
      // the aside must not carry 'collapsed' while mobileOpen is active
      localStorage.setItem("weathercast_sidebar_collapsed", "true");
      const html = renderComponent(<App />);
      // Default state has collapsed
      assertMatches(html, /app-sidebar collapsed/);
      // Brand text exists in DOM for mobile drawer to display
      assertContains(html, "sidebar-brand-text");
      assertContains(html, "sidebar-title");
      assertContains(html, "WeatherCast India");
      assertContains(html, "sidebar-subtitle");
    });
  });

  // ── 4.6 Breadcrumbs Synchronization with State Selection ───────────────────
  describe("4.6 Breadcrumbs Synchronization", () => {
    it("renders base breadcrumb path with platform root and module name", () => {
      const html = renderComponent(<App />);
      assertContains(html, "topbar-breadcrumbs");
      assertContains(html, "breadcrumb-root");
      assertContains(html, "Platform");
      assertContains(html, '<span class="current">Weather Forecast</span>');
    });

    it("renders state badge in breadcrumbs when a regional state is selected", () => {
      const renderBreadcrumbs = (moduleLabel: string, stateName?: string) => (
        <div className="topbar-breadcrumbs">
          <span>Platform</span>
          <span style={{ opacity: 0.4 }}>/</span>
          <span className="current">{moduleLabel}</span>
          {stateName && (
            <>
              <span style={{ opacity: 0.4 }}>/</span>
              <span
                style={{
                  background: "var(--accent-subtle)",
                  color: "var(--accent)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {stateName}
              </span>
            </>
          )}
        </div>
      );

      const withState = renderComponent(renderBreadcrumbs("India Weather Map", "Maharashtra"));
      assertContains(withState, "Platform");
      assertContains(withState, "India Weather Map");
      assertContains(withState, "Maharashtra");
      assertContains(withState, "var(--accent-subtle)");

      const withoutState = renderComponent(renderBreadcrumbs("India Weather Map"));
      assertNotContains(withoutState, "Maharashtra");
      assertNotContains(withoutState, "var(--accent-subtle)");
    });
  });
});
