import { useState } from "react";
import { ForecastPage } from "./pages/ForecastPage";
import { WeatherHistoryPage } from "./pages/WeatherHistoryPage";
import { ModelPerformancePage } from "./pages/ModelPerformancePage";
import { PredictionHistoryPage } from "./pages/PredictionHistoryPage";
import { IndiaMapPage } from "./pages/IndiaMapPage";
import { useHealth, type HealthState } from "./hooks/useHealth";
import { ChartIcon, ChipIcon, CloudSunIcon, ListIcon } from "./components/icons";

const TABS = [
  { id: "forecast", label: "Forecast", Icon: CloudSunIcon },
  { id: "map", label: "India Map", Icon: ChartIcon },
  { id: "model", label: "Model", Icon: ChipIcon },
  { id: "history", label: "Weather History", Icon: ChartIcon },
  { id: "predictions", label: "Predictions", Icon: ListIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

const HEALTH_LABEL: Record<HealthState, string> = {
  checking: "Checking backend…",
  ok: "Backend online",
  degraded: "Backend degraded",
  down: "Backend offline",
};

export default function App() {
  const [tab, setTab] = useState<TabId>("forecast");
  const { health, detail, waking, retry } = useHealth();

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <CloudSunIcon />
            </span>
            <div className="brand-text">
              <h1>WeatherCast India</h1>
              <p className="subtitle">Machine Learning Temperature Forecasting</p>
            </div>
          </div>
          <div className={`health health-${health}`} title={detail}>
            <span className="health-dot" aria-hidden="true" />
            {HEALTH_LABEL[health]}
            {health === "down" && <button className="health-retry" onClick={retry}>Retry</button>}
          </div>
        </div>
        {waking && <div className="waking-banner" role="status">The weather server is waking up. First requests can take a little longer.</div>}
        <nav className="nav" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-tab ${tab === t.id ? "active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              <t.Icon />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {tab === "forecast" && <ForecastPage />}
        {tab === "map" && <IndiaMapPage />}
        {tab === "history" && <WeatherHistoryPage />}
        {tab === "model" && <ModelPerformancePage />}
        {tab === "predictions" && <PredictionHistoryPage />}
      </main>

      <footer className="footer">
        Final-year project · Next-day average temperature (Temp_Avg) forecasting for Indian
        states · Model served by FastAPI + PostgreSQL
      </footer>
    </div>
  );
}
