import { useState } from "react";
import { ForecastPage } from "./pages/ForecastPage";
import { WeatherHistoryPage } from "./pages/WeatherHistoryPage";
import { ModelPerformancePage } from "./pages/ModelPerformancePage";
import { PredictionHistoryPage } from "./pages/PredictionHistoryPage";
import { useHealth, type HealthState } from "./hooks/useHealth";
import { ChartIcon, ChipIcon, CloudSunIcon, ListIcon, MapIcon } from "./components/icons";
import { Card, PageHead } from "./components/ui";
import { IndiaMap } from "./components/IndiaMap";

const TABS = [
  { id: "forecast", label: "Forecast", Icon: CloudSunIcon },
  { id: "map", label: "India Map", Icon: MapIcon },
  { id: "history", label: "Weather History", Icon: ChartIcon },
  { id: "model", label: "Model Performance", Icon: ChipIcon },
  { id: "predictions", label: "Prediction History", Icon: ListIcon },
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
  const [selectedState, setSelectedState] = useState<string>("");
  const { health, detail } = useHealth();

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <CloudSunIcon />
            </span>
            <div className="brand-text">
              <h1>Weather Forecasting System</h1>
              <p className="subtitle">Machine Learning Based Temperature Forecasting</p>
            </div>
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
        {tab === "forecast" && (
          <ForecastPage
            selectedState={selectedState}
            onSelectState={setSelectedState}
          />
        )}
        {tab === "map" && (
          <div className="page">
            <PageHead
              title="India Weather Map"
              desc="Interactive choropleth map showing predicted next-day average temperatures across Indian states and union territories. Click any state to select it and switch to its detailed forecast."
            />
            <Card title="Interactive Temperature Map" icon={<MapIcon />}>
              <IndiaMap
                selectedState={selectedState}
                onSelectState={(s) => {
                  setSelectedState(s);
                  setTab("forecast");
                }}
                height="620px"
              />
            </Card>
          </div>
        )}
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
