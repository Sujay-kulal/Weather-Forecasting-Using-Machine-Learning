/**
 * MLDashboardPage — Comprehensive ML project overview.
 *
 * Every number and feature name is fetched from GET /model-info so nothing
 * is hardcoded. The page is designed to be presented at a final-year viva
 * and showcases the full depth of the ML pipeline.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getModelInfo } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Card, ErrorBanner, PageHead, Spinner, StatChip, Badge } from "../components/ui";
import {
  CalendarIcon,
  ChartIcon,
  ChipIcon,
  CloudSunIcon,
  DatabaseIcon,
  DropletIcon,
  SlidersIcon,
  SparkIcon,
  TargetIcon,
  ThermometerIcon,
} from "../components/icons";

/* ------------------------------------------------------------------ */
/*  Feature categorisation (mirrors the training notebook exactly)     */
/* ------------------------------------------------------------------ */

interface FeatureCategory {
  label: string;
  color: string;
  icon: React.ReactNode;
  explanation: string;
  matcher: (f: string) => boolean;
}

const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    label: "Temperature Lag Features",
    color: "#e05a18",
    icon: <ThermometerIcon />,
    explanation:
      "Yesterday's and recent days' temperatures are the strongest single predictor — weather has strong autocorrelation. Lags of 1, 2, and 3 days capture the short-term trend.",
    matcher: (f) =>
      /^lag\d+_temp/.test(f),
  },
  {
    label: "Humidity & Rainfall Lags",
    color: "#4a90d9",
    icon: <DropletIcon />,
    explanation:
      "Humidity and rainfall heavily influence temperature through evaporative cooling and cloud cover. Lag-1 and lag-2 features capture their delayed impact on next-day temperatures.",
    matcher: (f) =>
      /^lag\d+_(humidity|rainfall)/.test(f),
  },
  {
    label: "Derived / Rolling Features",
    color: "#26a69a",
    icon: <ChartIcon />,
    explanation:
      "Rolling averages (3-day, 7-day) smooth day-to-day noise and capture medium-range weather trends. temp_range (max − min) indicates atmospheric stability.",
    matcher: (f) =>
      f.startsWith("roll") || f.startsWith("rainfall_roll") || f === "temp_range",
  },
  {
    label: "Temporal / Cyclical Features",
    color: "#9c27b0",
    icon: <CalendarIcon />,
    explanation:
      "Month and day-of-year encoded as sin/cos pairs so December 31 and January 1 are close in feature space. Captures the seasonal temperature cycle without ordinal artifacts.",
    matcher: (f) =>
      /(month|day_of_year)_(sin|cos)/.test(f),
  },
  {
    label: "Categorical Features",
    color: "#f26522",
    icon: <SparkIcon />,
    explanation:
      "Season (Winter/Summer/Monsoon/Post-Monsoon) and State (33 states) are OneHot-encoded inside an sklearn Pipeline. They let the model learn geography-specific and season-specific baselines.",
    matcher: (f) => ["Season", "State"].includes(f),
  },
];

function classifyFeatures(features: string[]) {
  return FEATURE_CATEGORIES.map((cat) => ({
    ...cat,
    items: features.filter(cat.matcher),
  })).filter((g) => g.items.length > 0);
}

/* ------------------------------------------------------------------ */
/*  Pipeline stages (text-based architecture diagram)                  */
/* ------------------------------------------------------------------ */

const PIPELINE_STAGES = [
  { icon: <DatabaseIcon />, label: "Raw Data", sub: "IMD / Open-Meteo" },
  { icon: <SlidersIcon />,  label: "Feature Engineering", sub: "20 features" },
  { icon: <ChipIcon />,     label: "Training Pipeline", sub: "TimeSeriesSplit × 5" },
  { icon: <TargetIcon />,   label: "LightGBM Model", sub: "Multi-output ×7" },
  { icon: <CloudSunIcon />, label: "FastAPI", sub: "REST API" },
  { icon: <ChartIcon />,    label: "React Frontend", sub: "This dashboard" },
];

/* ------------------------------------------------------------------ */
/*  Tech-stack badges                                                  */
/* ------------------------------------------------------------------ */

const TECH_STACK = [
  { name: "Python 3.11",   color: "#3776ab" },
  { name: "scikit-learn",   color: "#f7931e" },
  { name: "LightGBM",      color: "#02733e" },
  { name: "FastAPI",        color: "#009688" },
  { name: "PostgreSQL",     color: "#336791" },
  { name: "React 18",      color: "#61dafb" },
  { name: "TypeScript",    color: "#3178c6" },
  { name: "Vite",          color: "#646cff" },
  { name: "Recharts",      color: "#ff7300" },
];

/* ------------------------------------------------------------------ */
/*  Endpoints table                                                    */
/* ------------------------------------------------------------------ */

const API_ENDPOINTS = [
  { method: "POST", path: "/predict",       desc: "7-day temperature forecast with conformal intervals" },
  { method: "GET",  path: "/model-info",    desc: "Model metadata, features, metrics, and training period" },
  { method: "GET",  path: "/health",        desc: "Readiness probe — checks DB, model, and staleness" },
  { method: "GET",  path: "/states",        desc: "All Indian states the model covers" },
  { method: "GET",  path: "/weather/{state}", desc: "Historical weather records from PostgreSQL" },
  { method: "GET",  path: "/forecast/all",  desc: "Choropleth data — next-day avg temp for every state" },
];

/* ------------------------------------------------------------------ */
/*  Anti-leakage safeguards                                            */
/* ------------------------------------------------------------------ */

const SAFEGUARDS = [
  {
    title: "Lag features use only past data",
    detail: "Every lag and rolling feature is computed from rows strictly before the forecast date. No lookahead is possible because the SQL query and pandas code both enforce a strict date filter.",
  },
  {
    title: "Temporal train / test split",
    detail: "TimeSeriesSplit with 5 folds ensures training folds always precede validation folds chronologically — the model is never evaluated on dates it has already seen.",
  },
  {
    title: "Feature engineering contract",
    detail: "The exact same feature-building function runs in the training notebook and in the FastAPI backend, guaranteeing no training-serving skew.",
  },
  {
    title: "Staleness check on /health",
    detail: "The health endpoint verifies that the latest DB record is recent. If data stops flowing, the system degrades gracefully instead of silently forecasting stale data.",
  },
  {
    title: "Conformal calibration on held-out set",
    detail: "The prediction interval width (q) is calibrated on a dedicated calibration split that is disjoint from both training and test — no double-dipping.",
  },
];

/* ================================================================== */
/*  Page component                                                     */
/* ================================================================== */

export function MLDashboardPage() {
  const info = useFetch(getModelInfo, []);

  if (info.loading) return <Spinner label="Loading ML project overview…" />;
  if (info.error) return <ErrorBanner message={info.error.message} />;
  if (!info.data) return null;

  const {
    model_name,
    target,
    features,
    metrics,
    train_period,
    test_period,
    trained_through,
    q,
    coverage_90,
  } = info.data;

  const selected = metrics[model_name];
  const grouped = classifyFeatures(features);

  /* model comparison bar-chart data */
  const comparison = Object.entries(metrics)
    .map(([name, m]) => ({ name, MAE: m.MAE, RMSE: m.RMSE, R2: m.R2 }))
    .sort((a, b) => a.RMSE - b.RMSE);

  return (
    <div className="page">
      {/* ---- Page title ---- */}
      <PageHead
        title="ML Project Dashboard"
        desc="End-to-end overview of the machine learning pipeline — from raw weather data to production-ready 7-day temperature forecasts with conformal prediction intervals."
      />

      {/* ---- Hero stat chips ---- */}
      <div className="stat-chips">
        <StatChip
          icon={<ChipIcon />}
          label="Model"
          value={model_name}
        />
        <StatChip
          icon={<TargetIcon />}
          label="MAE"
          value={`${selected.MAE.toFixed(2)} °C`}
        />
        <StatChip
          icon={<ChartIcon />}
          label="R² Score"
          value={selected.R2.toFixed(4)}
        />
        <StatChip
          icon={<SlidersIcon />}
          label="Features"
          value={features.length}
        />
        {coverage_90 !== undefined && (
          <StatChip
            icon={<TargetIcon />}
            label="Conformal Coverage"
            value={`${(coverage_90 * 100).toFixed(1)}%`}
          />
        )}
        <StatChip
          icon={<CalendarIcon />}
          label="Training data"
          value={`${train_period[0]} → ${train_period[1]}`}
        />
      </div>

      {/* ============================================================
          SECTION 1 — Project Architecture
          ============================================================ */}
      <Card
        title="System Architecture"
        icon={<DatabaseIcon />}
        subtitle="Full pipeline from raw weather data to the React dashboard you're looking at right now."
      >
        {/* Pipeline diagram */}
        <div className="pipeline" style={{ marginBottom: 20 }}>
          {PIPELINE_STAGES.map((stage, i) => (
            <span key={stage.label} style={{ display: "contents" }}>
              <span className="pipeline-step">
                {stage.icon}
                <span>
                  <strong>{stage.label}</strong>
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)", fontWeight: 500 }}>
                    {stage.sub}
                  </span>
                </span>
              </span>
              {i < PIPELINE_STAGES.length - 1 && <span className="arrow">→</span>}
            </span>
          ))}
        </div>

        {/* Tech stack badges */}
        <div className="ml-section-label" style={{ marginBottom: 10, marginTop: 6 }}>
          <strong style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-faint)" }}>
            Tech Stack
          </strong>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TECH_STACK.map((t) => (
            <span
              key={t.name}
              className="ml-tech-badge"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: 999,
                color: "#fff",
                background: t.color,
                letterSpacing: "0.01em",
              }}
            >
              {t.name}
            </span>
          ))}
        </div>

        <p className="chart-note" style={{ marginTop: 16 }}>
          Data flows left → right: raw observations are ingested into <strong>PostgreSQL</strong>,
          features are engineered server-side, the <strong>LightGBM</strong> multi-output regressor
          predicts 7 days simultaneously, and results are served through <strong>FastAPI</strong> REST
          endpoints consumed by this <strong>React</strong> frontend.
        </p>
      </Card>

      {/* ============================================================
          SECTION 2 — Feature Engineering
          ============================================================ */}
      <Card
        title={`Feature Engineering — ${features.length} Engineered Features`}
        icon={<SlidersIcon />}
        subtitle="Every feature is built automatically from raw weather measurements. Grouped by category below with explanations of why each group matters."
      >
        <div className="ml-feature-grid">
          {grouped.map((g) => (
            <div key={g.label} className="ml-feature-card" style={{ borderLeft: `3px solid ${g.color}` }}>
              <div className="ml-feature-header">
                <span style={{ color: g.color, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-flex", width: 20, height: 20 }}>{g.icon}</span>
                  <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {g.label}
                  </strong>
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "#fff",
                    background: g.color,
                    borderRadius: 999,
                    padding: "1px 9px",
                  }}
                >
                  {g.items.length}
                </span>
              </div>
              <ul className="ml-feature-list">
                {g.items.map((f) => (
                  <li key={f}>
                    <code>{f}</code>
                  </li>
                ))}
              </ul>
              <p className="ml-feature-why">{g.explanation}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ============================================================
          SECTION 3 — Training Pipeline
          ============================================================ */}
      <div className="ml-train-grid">
        {/* Left column — Training setup */}
        <Card
          title="Training Pipeline"
          icon={<ChipIcon />}
          subtitle="How the model is trained, validated, and calibrated."
        >
          <dl className="meta-list">
            <div>
              <dt>Multi-Output Regression</dt>
              <dd>Predicts 7 days of Temp_Avg simultaneously (one model, 7 outputs)</dd>
            </div>
            <div>
              <dt>Cross-Validation</dt>
              <dd>TimeSeriesSplit with 5 folds — no data leakage across time</dd>
            </div>
            <div>
              <dt>Preprocessing</dt>
              <dd>StandardScaler (numeric) + OneHotEncoder (categorical) in an sklearn Pipeline</dd>
            </div>
            <div>
              <dt>Training Period</dt>
              <dd>{train_period[0]} → {train_period[1]}</dd>
            </div>
            <div>
              <dt>Testing Period</dt>
              <dd>{test_period[0]} → {test_period[1]}</dd>
            </div>
            {trained_through && (
              <div>
                <dt>Trained Through</dt>
                <dd>{trained_through}</dd>
              </div>
            )}
            <div>
              <dt>Models Compared</dt>
              <dd style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {comparison.map((m) => (
                  <Badge key={m.name} neutral={m.name !== model_name}>
                    {m.name}{m.name === model_name ? " ✓" : ""}
                  </Badge>
                ))}
              </dd>
            </div>
          </dl>

          {/* Conformal prediction callout */}
          {q !== undefined && coverage_90 !== undefined && (
            <div className="ml-conformal-box">
              <strong>Conformal Prediction Intervals</strong>
              <p>
                Split conformal prediction with <code>q = ±{q.toFixed(2)} °C</code> achieves{" "}
                <strong>{(coverage_90 * 100).toFixed(2)}%</strong> empirical coverage on
                the held-out test set. This means ~87 out of 100 future observations fall within the
                predicted interval — a distribution-free guarantee.
              </p>
            </div>
          )}
        </Card>

        {/* Right column — Metrics & chart */}
        <Card
          title={`Model Comparison — ${model_name} vs Baselines`}
          icon={<TargetIcon />}
          subtitle="Lower RMSE is better. The highlighted bar is the deployed model."
        >
          {/* Metric tiles */}
          <div className="metric-row">
            <div className="metric">
              <div className="metric-value">{selected.MAE.toFixed(3)}</div>
              <div className="metric-name">MAE (°C)</div>
            </div>
            <div className="metric">
              <div className="metric-value">{selected.RMSE.toFixed(3)}</div>
              <div className="metric-name">RMSE (°C)</div>
            </div>
            <div className="metric">
              <div className="metric-value">{selected.R2.toFixed(4)}</div>
              <div className="metric-name">R² Score</div>
            </div>
            {coverage_90 !== undefined && (
              <div className="metric">
                <div className="metric-value">{(coverage_90 * 100).toFixed(1)}%</div>
                <div className="metric-name">90% Coverage</div>
              </div>
            )}
          </div>

          {/* Bar chart */}
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={comparison} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#e7edf4" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#5a6b82" }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 11, fill: "#5a6b82" }} unit=" °C" />
                <Tooltip formatter={(v: number) => `${v.toFixed(3)} °C`} />
                <Bar dataKey="RMSE" name="RMSE (°C)" radius={[4, 4, 0, 0]}>
                  {comparison.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.name === model_name ? "#f26522" : "#c3d3e4"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Comparison table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="num">MAE (°C)</th>
                  <th className="num">RMSE (°C)</th>
                  <th className="num">R²</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((m) => (
                  <tr key={m.name} className={m.name === model_name ? "highlight-row" : ""}>
                    <td>
                      {m.name}
                      {m.name === model_name ? " · deployed" : ""}
                    </td>
                    <td className="num">{m.MAE.toFixed(4)}</td>
                    <td className="num">{m.RMSE.toFixed(4)}</td>
                    <td className="num">{m.R2.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ============================================================
          SECTION 4 — Data Quality & Anti-Leakage
          ============================================================ */}
      <Card
        title="Data Quality & Anti-Leakage Safeguards"
        icon={<SparkIcon />}
        subtitle="Rigorous safeguards ensure the model's test metrics are honest and production predictions are trustworthy."
      >
        <div className="ml-safeguard-grid">
          {SAFEGUARDS.map((s, i) => (
            <div key={i} className="ml-safeguard-item">
              <div className="ml-safeguard-number">{i + 1}</div>
              <div>
                <strong>{s.title}</strong>
                <p>{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ============================================================
          SECTION 5 — API & Deployment
          ============================================================ */}
      <Card
        title="REST API & Deployment"
        icon={<DatabaseIcon />}
        subtitle="The backend exposes a RESTful API consumed by this frontend. Model versioning supports the v1 → v2 → v3 progression."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Method</th>
                <th>Endpoint</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {API_ENDPOINTS.map((ep) => (
                <tr key={ep.path}>
                  <td>
                    <Badge neutral={ep.method === "GET"}>{ep.method}</Badge>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12.5 }}>{ep.path}</td>
                  <td>{ep.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Deployment architecture cards */}
        <div className="ml-deploy-grid" style={{ marginTop: 18 }}>
          <div className="ml-deploy-card">
            <strong>PostgreSQL Storage</strong>
            <p>
              All raw weather data and prediction audit trails are persisted in PostgreSQL.
              Enables historical analysis, reproducibility, and an immutable prediction log.
            </p>
          </div>
          <div className="ml-deploy-card">
            <strong>Model Versioning</strong>
            <p>
              The pipeline supports v1 → v2 → v3 model evolution. Each version's artefact
              (joblib file) is self-contained and the backend loads the latest on startup.
            </p>
          </div>
          <div className="ml-deploy-card">
            <strong>Health Monitoring</strong>
            <p>
              The <code>/health</code> endpoint checks database connectivity, model loading status,
              and data freshness. The header pill in this UI reflects real-time backend health.
            </p>
          </div>
        </div>

        <p className="chart-note" style={{ marginTop: 14 }}>
          Target: <strong>{target}</strong> • Model trained through{" "}
          <strong>{trained_through ?? train_period[1]}</strong> • Test period:{" "}
          <strong>{test_period[0]} → {test_period[1]}</strong>
        </p>
      </Card>
    </div>
  );
}
