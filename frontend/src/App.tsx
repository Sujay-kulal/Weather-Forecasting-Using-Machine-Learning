import { useState, useEffect } from "react";
import { ForecastPage } from "./pages/ForecastPage";
import { WeatherHistoryPage } from "./pages/WeatherHistoryPage";
import { ModelPerformancePage } from "./pages/ModelPerformancePage";
import { PredictionHistoryPage } from "./pages/PredictionHistoryPage";
import { MLDashboardPage } from "./pages/MLDashboardPage";
import { useHealth, type HealthState } from "./hooks/useHealth";
import {
  ChartIcon,
  ChipIcon,
  CloudSunIcon,
  DatabaseIcon,
  ListIcon,
  MapIcon,
} from "./components/icons";
import { Card, PageHead } from "./components/ui";
import { IndiaMap } from "./components/IndiaMap";

const TABS = [
  { id: "forecast", label: "Forecast", Icon: CloudSunIcon },
  { id: "map", label: "India Map", Icon: MapIcon },
  { id: "ml", label: "ML Project", Icon: DatabaseIcon },
  { id: "history", label: "Weather History", Icon: ChartIcon },
  { id: "model", label: "Model Metrics", Icon: ChipIcon },
  { id: "predictions", label: "Predictions", Icon: ListIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

const HEALTH_LABEL: Record<HealthState, string> = {
  checking: "Connecting…",
  ok: "Live",
  degraded: "Degraded",
  down: "Offline",
};

function CurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{
      fontSize: 12,
      color: 'rgba(255,255,255,0.5)',
      fontWeight: 500,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '0.02em'
    }}>
      {time.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
      {' · '}
      {time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

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
              <h1>WeatherCast India</h1>
              <p className="subtitle">ML-Powered Temperature Forecasting</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <CurrentTime />
            <div className={`health health-${health}`} title={detail}>
              <span className="health-dot" aria-hidden="true" />
              {HEALTH_LABEL[health]}
            </div>
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
        {tab === "ml" && <MLDashboardPage />}
        {tab === "history" && <WeatherHistoryPage />}
        {tab === "model" && <ModelPerformancePage />}
        {tab === "predictions" && <PredictionHistoryPage />}
      </main>

      <footer className="footer">
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>Final-year project · ML-based temperature forecasting for Indian states</span>
          <span style={{ opacity: 0.7 }}>FastAPI + PostgreSQL + Gradient Boosting</span>
        </div>
      </footer>
    </div>
  );
}
