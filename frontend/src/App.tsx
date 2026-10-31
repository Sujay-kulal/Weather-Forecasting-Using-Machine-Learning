import { lazy, Suspense, useState, useEffect } from "react";
import { useHealth, type HealthState } from "./hooks/useHealth";
import {
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChipIcon,
  CloudSunIcon,
  DatabaseIcon,
  ListIcon,
  MapIcon,
  MenuIcon,
  SparkIcon,
  XIcon,
} from "./components/icons";

const ForecastPage = lazy(() =>
  import("./pages/ForecastPage").then((module) => ({ default: module.ForecastPage })),
);
const WeatherHistoryPage = lazy(() =>
  import("./pages/WeatherHistoryPage").then((module) => ({ default: module.WeatherHistoryPage })),
);
const ModelPerformancePage = lazy(() =>
  import("./pages/ModelPerformancePage").then((module) => ({ default: module.ModelPerformancePage })),
);
const PredictionHistoryPage = lazy(() =>
  import("./pages/PredictionHistoryPage").then((module) => ({ default: module.PredictionHistoryPage })),
);
const MLDashboardPage = lazy(() =>
  import("./pages/MLDashboardPage").then((module) => ({ default: module.MLDashboardPage })),
);
const IndiaMapPage = lazy(() =>
  import("./pages/IndiaMapPage").then((module) => ({ default: module.IndiaMapPage })),
);

export const NAVIGATION_MODULES = [
  { id: "forecast", label: "Weather Forecast", shortLabel: "Forecast", Icon: CloudSunIcon, desc: "Multi-parameter 7-day forecasts" },
  { id: "map", label: "India Weather Map", shortLabel: "India Map", Icon: MapIcon, desc: "Geographic spatial analytics" },
  { id: "ml", label: "ML Project Overview", shortLabel: "ML System", Icon: DatabaseIcon, desc: "Pipeline architecture & features" },
  { id: "history", label: "Weather History", shortLabel: "History", Icon: ChartIcon, desc: "Historical PostgreSQL records" },
  { id: "model", label: "Model Performance", shortLabel: "Performance", Icon: ChipIcon, desc: "Evaluation metrics & benchmarks" },
  { id: "predictions", label: "Prediction History", shortLabel: "Audit Log", Icon: ListIcon, desc: "Audit log of saved predictions" },
] as const;

export type TabId = (typeof NAVIGATION_MODULES)[number]["id"];

const HEALTH_CONFIG: Record<HealthState, { label: string; className: string; desc: string }> = {
  checking: { label: "Connecting", className: "status-checking", desc: "Verifying backend & model services..." },
  ok: { label: "System Live", className: "status-ok", desc: "FastAPI online · PostgreSQL connected · LightGBM loaded" },
  degraded: { label: "Degraded", className: "status-degraded", desc: "One or more subsystem dependencies reported warnings" },
  down: { label: "Offline", className: "status-down", desc: "Cannot connect to backend service" },
};

function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="topbar-clock" title="Current system time">
      <span>{time.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
      <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
      <span>{time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabId>("forecast");
  const [selectedState, setSelectedState] = useState<string>("");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("weathercast_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const { health, detail } = useHealth();

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("weathercast_sidebar_collapsed", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleSelectTab = (newTab: TabId) => {
    setTab(newTab);
    setMobileOpen(false);
  };

  const currentModule = NAVIGATION_MODULES.find((m) => m.id === tab) ?? NAVIGATION_MODULES[0];
  const healthInfo = HEALTH_CONFIG[health];

  return (
    <div className="app-layout">
      {/* Mobile Drawer Overlay */}
      <div
        className={`mobile-overlay ${mobileOpen ? "mobile-open" : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Fixed Left Sidebar */}
      <aside className={`app-sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo-icon">
            <SparkIcon />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-title">WeatherCast India</span>
            <span className="sidebar-subtitle">ML Weather Platform</span>
          </div>
          {mobileOpen && (
            <button
              type="button"
              className="btn-outline"
              onClick={() => setMobileOpen(false)}
              style={{ marginLeft: "auto", padding: "4px" }}
              aria-label="Close menu"
            >
              <XIcon style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Main Navigation">
          <div className="sidebar-section-title">Navigation Modules</div>
          {NAVIGATION_MODULES.map((m) => {
            const isActive = tab === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => handleSelectTab(m.id)}
                title={m.label}
              >
                <m.Icon />
                <span className="nav-item-label">{m.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status-box">
            <div className="sidebar-status-row">
              <span style={{ color: "var(--sidebar-text-muted)", fontSize: 11 }}>Model Engine</span>
              <span style={{ fontWeight: 600, color: "#60a5fa" }}>LightGBM v3</span>
            </div>
            <div className="sidebar-status-row" style={{ marginTop: 4 }}>
              <span style={{ color: "var(--sidebar-text-muted)", fontSize: 11 }}>Horizon</span>
              <span style={{ color: "#ffffff", fontWeight: 500 }}>7 Days Multi-Out</span>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRightIcon style={{ width: 16, height: 16 }} /> : <ChevronLeftIcon style={{ width: 16, height: 16 }} />}
            {!collapsed && <span>Collapse Sidebar</span>}
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="app-main">
        {/* Compact Top Navigation */}
        <header className="app-topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="topbar-menu-toggle"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <MenuIcon style={{ width: 20, height: 20 }} />
            </button>
            <div className="topbar-breadcrumbs">
              <span>Platform</span>
              <span style={{ opacity: 0.4 }}>/</span>
              <span className="current">{currentModule.label}</span>
              {selectedState && (
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
                    {selectedState}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="topbar-right">
            <LiveClock />
            <div
              className={`status-pill ${healthInfo.className}`}
              title={`${detail} · ${healthInfo.desc}`}
              role="status"
            >
              <span className="status-dot" aria-hidden="true" />
              <span>{healthInfo.label}</span>
            </div>
          </div>
        </header>

        {/* Content Workspace */}
        <main className="page-container">
          <Suspense fallback={<div className="spinner-row" role="status"><span className="spinner" /> Loading module workspace…</div>}>
            {tab === "forecast" && (
              <ForecastPage
                selectedState={selectedState}
                onSelectState={setSelectedState}
              />
            )}
            {tab === "map" && (
              <IndiaMapPage
                selectedState={selectedState}
                onSelectState={setSelectedState}
                onNavigateTab={(targetTab) => setTab(targetTab as TabId)}
              />
            )}
            {tab === "ml" && <MLDashboardPage />}
            {tab === "history" && <WeatherHistoryPage />}
            {tab === "model" && <ModelPerformancePage />}
            {tab === "predictions" && <PredictionHistoryPage />}
          </Suspense>
        </main>

        {/* Footer */}
        <footer className="app-footer">
          <div>
            <strong>WeatherCast India</strong> — Machine Learning-Based Weather Forecasting Platform
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 11.5 }}>
            <span>Architecture: React 18 · FastAPI · PostgreSQL · LightGBM</span>
            <span>Test-Set MAE: ±1.25°C</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
