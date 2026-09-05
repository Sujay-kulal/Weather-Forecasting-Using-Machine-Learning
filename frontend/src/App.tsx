import { useState } from "react";
import { ForecastPage } from "./pages/ForecastPage";
import { WeatherHistoryPage } from "./pages/WeatherHistoryPage";
import { ModelPerformancePage } from "./pages/ModelPerformancePage";
import { PredictionHistoryPage } from "./pages/PredictionHistoryPage";
import { useHealth, type HealthState } from "./hooks/useHealth";

const TABS = [
  { id: "forecast", label: "Forecast" },
  { id: "history", label: "Weather History" },
  { id: "model", label: "Model Performance" },
  { id: "predictions", label: "Prediction History" },
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
  const { health, detail } = useHealth();

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div>
            <h1>Weather Forecasting System</h1>
            <p className="subtitle">Machine Learning Based Temperature Forecasting</p>
          </div>
          <div className={`health health-${health}`} title={detail}>
            <span className="health-dot" aria-hidden="true" />
            {HEALTH_LABEL[health]}
          </div>
        </div>
        <nav className="nav" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {tab === "forecast" && <ForecastPage />}
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
