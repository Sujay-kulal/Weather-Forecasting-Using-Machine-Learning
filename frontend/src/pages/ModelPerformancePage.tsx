import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getModelInfo } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Badge, Card, ErrorBanner, PageHead, Spinner, StatChip } from "../components/ui";
import {
  ArrowUpIcon,
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  ChipIcon,
  SlidersIcon,
  TargetIcon,
} from "../components/icons";

function formatMetric(value: number | null | undefined, digits: number, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "—";
}

function formatSkill(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

interface FeatureGroup {
  label: string;
  count: number;
  description: string;
  items: string[];
}

function categorizeFeatures(features: string[]): FeatureGroup[] {
  const groups: FeatureGroup[] = [
    {
      label: "Temporal Lag Inputs",
      count: 0,
      description: "Auto-regressive measurements from preceding days (t-1, t-2, t-3) capturing inertia.",
      items: features.filter((f) => f.startsWith("lag")),
    },
    {
      label: "Rolling & Dynamics",
      count: 0,
      description: "Short and medium-term moving windows capturing thermal trends and diurnal temperature range.",
      items: features.filter((f) => f.startsWith("roll") || f.startsWith("rainfall_roll") || f === "temp_range"),
    },
    {
      label: "Seasonal & Cyclic",
      count: 0,
      description: "Sine and cosine trigonometric cyclic encodings for annual calendar and day-of-year solar progression.",
      items: features.filter((f) => /^(month|day_of_year)_/.test(f)),
    },
    {
      label: "Geographical & Meteorological Domain",
      count: 0,
      description: "One-hot state identity and bioclimatic season encodings capturing regional micro-climates.",
      items: features.filter((f) => ["Season", "State"].includes(f)),
    },
  ];

  return groups
    .map((g) => ({ ...g, count: g.items.length }))
    .filter((g) => g.count > 0);
}

export function ModelPerformancePage() {
  const info = useFetch(getModelInfo, []);
  const [metricTab, setMetricTab] = useState<"MAE" | "RMSE" | "R2">("MAE");

  if (info.loading) return <Spinner label="Loading model evaluation and benchmarking metadata…" />;
  if (info.error) return <ErrorBanner message={info.error.message} onRetry={info.retry} />;
  if (!info.data) return null;

  const { model_name, features, metrics, loaded_artifact_version } = info.data;
  const selected = metrics[model_name];
  const independentlyValidated = info.data.validated_for_artifact === true;
  const validationLabel = independentlyValidated
    ? "Independently validated"
    : selected ? "Diagnostic — Pending Independent Validation" : "Evaluation pending";
  const metricScope = independentlyValidated ? "Independent evaluation" : "Training-overlap evaluation";
  const artifactFile = loaded_artifact_version ? `${loaded_artifact_version}.joblib` : "Unavailable";

  const horizonData = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    const key = `day_${day}`;
    return {
      day,
      label: `Day ${day} (t+${day})`,
      ...selected?.by_horizon?.[key],
      skill: selected?.skill_vs_persistence_by_horizon?.[key],
    };
  });

  const benchmarks = [
    { name: "LightGBM Multi-Output", shortName: "LightGBM", type: "Deployed model", data: selected },
    { name: "Random Forest (Tuned)", shortName: "Random Forest", type: "Ensemble benchmark",
      data: metrics["Random Forest"] ?? metrics["RandomForest"] },
    { name: "Linear Regression", shortName: "Linear Reg", type: "Linear benchmark",
      data: metrics["Linear Regression"] ?? metrics["LinearRegression"] },
    { name: "Climatology Reference", shortName: "Climatology", type: "Historical temperature baseline",
      data: metrics["Climatology"] },
    { name: "Persistence Reference", shortName: "Persistence", type: "Latest available temperature",
      data: metrics["Persistence"] },
  ];
  const comparisonModels = benchmarks.map(({ data, ...benchmark }, i) => {
    const values = data?.overall ?? data;
    const baselineMae = metrics["Persistence"]?.MAE;
    const skill = data?.skill_vs_persistence ??
      (values?.MAE != null && baselineMae > 0 ? 1 - values.MAE / baselineMae : null);
    return {
      ...benchmark,
      MAE: values?.MAE,
      RMSE: values?.RMSE,
      R2: values?.R2,
      skill: formatSkill(skill),
      isProduction: i === 0,
      status: data ? metricScope : "Unavailable",
    };
  });

  const overall = selected?.overall ?? selected;
  const coverage = info.data.interval_status === "calibrated" ? info.data.coverage_90 : null;
  const q = coverage != null ? info.data.q : null;

  return (
    <div className="page">
      <PageHead
        title="Model Evaluation & Benchmarking"
        desc="Benchmark performance metrics and error decay analysis for the production LightGBM 7-day multi-output forecasting model."
        badge={
          <Badge variant={independentlyValidated ? "success" : "neutral"}>
            {validationLabel}
          </Badge>
        }
      >
        <Badge neutral>Artifact: {artifactFile}</Badge>
      </PageHead>

      {/* Hero Stat Chips */}
      <div className="stat-chips">
        <StatChip
          icon={<ChipIcon />}
          label="Production Model"
          value={`${model_name} Multi-Output`}
          sub="7-Day Joint Regressor"
        />
        <StatChip
          icon={<TargetIcon />}
          label="Diagnostic MAE"
          value={formatMetric(overall?.MAE, 2, "°C")}
          sub={metricScope}
        />
        <StatChip
          icon={<TargetIcon />}
          label="Diagnostic RMSE"
          value={formatMetric(overall?.RMSE, 2, "°C")}
          sub={metricScope}
        />
        <StatChip
          icon={<ChartIcon />}
          label="Diagnostic R²"
          value={formatMetric(overall?.R2, 4, "")}
          sub={metricScope}
        />
        <StatChip
          icon={<ArrowUpIcon />}
          label="Diagnostic Skill Score"
          value={formatSkill(selected?.skill_vs_persistence)}
          sub="Relative MAE change vs persistence"
        />
        <StatChip
          icon={<CheckIcon />}
          label="Conformal Coverage"
          value={coverage == null ? "Pending" : formatMetric(coverage * 100, 1, "%")}
          sub={q == null ? "Calibration pending for this artifact" : `Interval half-width ${formatMetric(q, 2, "°C")}`}
        />
      </div>



      {/* Horizon-by-Horizon Performance Breakdown */}
      <Card
        title="Horizon-by-Horizon Performance Breakdown (Day 1 through Day 7)"
        subtitle={`${metricScope} by forecast lead time`}
        icon={<CalendarIcon />}
      >
        {/* 7-Day Horizon Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10,
            marginBottom: 20,
          }}
        >
          {horizonData.map((h) => (
            <div
              key={h.day}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "12px 10px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                boxShadow: "var(--shadow-xs)",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                {h.label}
              </span>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.1,
                  margin: "2px 0 4px",
                }}
              >
                {formatMetric(h.MAE, 2, "°C")}
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                RMSE: <strong>{formatMetric(h.RMSE, 2, "°C")}</strong>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                R²: {formatMetric(h.R2, 3)}
              </div>
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border-subtle)", width: "100%" }}>
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 700,
                    color: "var(--success)",
                    background: "var(--success-bg)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    border: "1px solid var(--success-border)",
                    display: "inline-block",
                  }}
                >
                  {h.skill == null ? "Skill unavailable" : `${formatSkill(h.skill)} vs persistence`}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Horizon Error Growth Trend Chart */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
              Forecast Horizon Error Progression (MAE & RMSE in °C)
            </span>
          </div>

          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={horizonData} margin={{ top: 10, right: 25, bottom: 5, left: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis
                  domain={[0, "auto"]}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  unit="°C"
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <Tooltip
                  formatter={(val: number, name: string) => [`${val.toFixed(3)} °C`, name]}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "none",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#94a3b8", fontWeight: 600 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                  iconType="circle"
                />
                <Line
                  type="monotone"
                  dataKey="MAE"
                  name="MAE (°C)"
                  stroke="#ea580c"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#ea580c", strokeWidth: 1 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="RMSE"
                  name="RMSE (°C)"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#2563eb", strokeWidth: 1 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* Model Comparison Visuals: Recharts BarChart & Comparison Table */}
      <Card
        title="Model Architecture Benchmark Comparison"
        subtitle={`${metricScope} of the scores supplied by the API`}
        icon={<TargetIcon />}
        action={
          <div style={{ display: "inline-flex", background: "var(--bg-surface-subtle)", padding: 3, borderRadius: "var(--radius-md)" }}>
            <button
              type="button"
              className={metricTab === "MAE" ? "btn-primary" : "btn-outline"}
              aria-pressed={metricTab === "MAE"}
              onClick={() => setMetricTab("MAE")}
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              MAE (Lower is Better)
            </button>
            <button
              type="button"
              className={metricTab === "RMSE" ? "btn-primary" : "btn-outline"}
              aria-pressed={metricTab === "RMSE"}
              onClick={() => setMetricTab("RMSE")}
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              RMSE (Lower is Better)
            </button>
            <button
              type="button"
              className={metricTab === "R2" ? "btn-primary" : "btn-outline"}
              aria-pressed={metricTab === "R2"}
              onClick={() => setMetricTab("R2")}
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              R² Score (Higher is Better)
            </button>
          </div>
        }
      >
        <div style={{ width: "100%", height: 280, margin: "10px 0 20px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={comparisonModels}
              margin={{ top: 15, right: 20, bottom: 15, left: 0 }}
            >
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="shortName"
                tick={{ fontSize: 11.5, fill: "#475569", fontWeight: 500 }}
              />
              <YAxis
                domain={metricTab === "R2" ? ["auto", "auto"] : [0, "auto"]}
                tick={{ fontSize: 11, fill: "#64748b" }}
                unit={metricTab === "R2" ? "" : "°C"}
                tickFormatter={(v: number) => v.toFixed(metricTab === "R2" ? 3 : 2)}
              />
              <Tooltip
                formatter={(val: number) => [
                  metricTab === "R2" ? val.toFixed(4) : `${val.toFixed(4)} °C`,
                  metricTab,
                ]}
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "none",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey={metricTab} name={metricTab} radius={[6, 6, 0, 0]}>
                {comparisonModels.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.isProduction ? "#2563eb" : "#cbd5e1"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Structured Comparison Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model Architecture</th>
                <th>Model Type</th>
                <th className="num">MAE (°C)</th>
                <th className="num">RMSE (°C)</th>
                <th className="num">R² Score</th>
                <th>Skill vs Persistence</th>
                <th>Evaluation Status</th>
              </tr>
            </thead>
            <tbody>
              {comparisonModels.map((m) => (
                <tr key={m.name} className={m.isProduction ? "highlight-row" : ""}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {m.isProduction && <ChipIcon style={{ width: 14, height: 14, color: "var(--accent)" }} />}
                      <span>{m.name}</span>
                    </div>
                  </td>
                  <td>{m.type}</td>
                  <td className="num strong">{formatMetric(m.MAE, 4)}</td>
                  <td className="num">{formatMetric(m.RMSE, 4)}</td>
                  <td className="num">{formatMetric(m.R2, 4)}</td>
                  <td>
                    <span style={{ fontWeight: 600, color: m.isProduction ? "var(--success)" : "var(--text-secondary)" }}>
                      {m.skill}
                    </span>
                  </td>
                  <td>
                    <Badge neutral>{m.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Feature Engineering Summary */}
      <Card
        title="Feature Engineering Taxonomy (20 Inputs)"
        subtitle={`Exactly ${features.length} features engineered automatically server-side from recent historical weather observations prior to inference.`}
        icon={<SlidersIcon />}
      >
        <div className="feature-groups-grid">
          {categorizeFeatures(features).map((g) => (
            <div key={g.label} className="feature-card">
              <div className="feature-card-header">
                <span className="feature-card-title">{g.label}</span>
                <Badge neutral>{g.count} features</Badge>
              </div>
              <div className="feature-tag-list">
                {g.items.map((f) => (
                  <span key={f} className="feature-tag">
                    {f}
                  </span>
                ))}
              </div>
              <p className="feature-card-desc">{g.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
