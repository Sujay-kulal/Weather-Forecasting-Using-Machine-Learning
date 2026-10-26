import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getLiveMetrics, getModelInfo } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Card, ErrorBanner, PageHead, Skeleton, StatChip } from "../components/ui";
import { CalendarIcon, ChipIcon, TargetIcon } from "../components/icons";

const SERIES = [
  { key: "model", label: "LightGBM", color: "#ff6b35" },
  { key: "persistence", label: "Persistence", color: "#55b8a6" },
  { key: "climatology", label: "Climatology", color: "#8b9bb4" },
] as const;

export function ModelPerformancePage() {
  const info = useFetch(getModelInfo, []);
  const live = useFetch(getLiveMetrics, []);

  if (info.loading && !info.data) return <div className="page"><PageHead title="Model" /><Skeleton rows={6} /></div>;
  if (info.error && !info.data) return <div className="page"><PageHead title="Model" /><ErrorBanner message={info.error.message} onRetry={info.retry} /></div>;
  if (!info.data) return null;

  const { model_name, target, features, metrics, train_period, test_period } = info.data;
  const lightgbm = metrics.LightGBM ?? metrics[model_name];
  const skill = lightgbm?.skill_vs_persistence;
  const chartData = Array.from({ length: 7 }, (_, index) => {
    const day = `day_${index + 1}`;
    return {
      day: `Day ${index + 1}`,
      model: metrics.LightGBM?.by_horizon?.[day]?.MAE ?? lightgbm?.by_horizon?.[day]?.MAE,
      persistence: metrics.Persistence?.by_horizon?.[day]?.MAE,
      climatology: metrics.Climatology?.by_horizon?.[day]?.MAE,
    };
  });
  const availableVersions = live.data?.models ?? [];

  return (
    <div className="page">
      <PageHead title="Model" desc="Per-horizon test performance, current live accuracy, and the model’s input features." />
      {info.error && <ErrorBanner message={info.error.message} onRetry={info.retry} />}
      <div className="stat-chips">
        <StatChip icon={<TargetIcon />} label="Skill vs persistence" value={skill == null ? "Unavailable" : `${(skill * 100).toFixed(1)}% lower MAE`} />
        <StatChip icon={<CalendarIcon />} label="Test period" value={test_period?.length === 2 ? `${test_period[0]} – ${test_period[1]}` : "Not available"} />
        <StatChip icon={<ChipIcon />} label="Model version" value={info.data.loaded_artifact_version || model_name} />
        <div className={`validation-badge ${info.data.validated_for_artifact ? "is-valid" : "is-unvalidated"}`} role="status">
          {info.data.validated_for_artifact ? "Validated for loaded artifact" : "Not independently validated"}
        </div>
      </div>

      {!info.data.validated_for_artifact && info.data.evaluation?.note && (
        <p className="integrity-note">{info.data.evaluation.note}</p>
      )}

      <Card title="MAE by forecast horizon" icon={<TargetIcon />} subtitle="Lower is better. Values come from /model-info and use the same date split for each baseline.">
        {chartData.every((row) => row.model == null) ? (
          <p className="empty-hint">Per-horizon metrics are not available from this backend response.</p>
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 26, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,.16)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#b8c2d5" }} />
                <YAxis tick={{ fontSize: 11, fill: "#b8c2d5" }} unit="°" width={42} />
                <Tooltip formatter={(value: number) => `${value.toFixed(3)} °C`} />
                <Legend />
                {SERIES.map((series) => (
                  <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey={series.key} position="top" formatter={(value: number) => value == null ? "" : value.toFixed(2)} fill="#e8edf5" fontSize={10} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Live accuracy · rolling 30 days" icon={<ChipIcon />} subtitle={live.data ? `${live.data.period_start} – ${live.data.period_end} · ${live.data.rolling_days} days` : undefined}>
        {live.loading && !live.data && <Skeleton rows={3} />}
        {live.error && !live.data && <ErrorBanner message={live.error.message} onRetry={live.retry} />}
        {live.data && availableVersions.length === 0 && <p className="empty-hint">No forecasts have matched observed weather in this period yet.</p>}
        {availableVersions.map((entry) => (
          <div className="live-metric-row" key={entry.model_version}>
            <strong>{entry.model_version}</strong>
            <span>{entry.sample_count} matched observations</span>
            <span>Model MAE: {entry.model_mae == null ? "—" : `${entry.model_mae.toFixed(2)} °C`}</span>
            <span>Persistence MAE: {entry.persistence_mae == null ? "—" : `${entry.persistence_mae.toFixed(2)} °C`}</span>
          </div>
        ))}
      </Card>

      <Card title="Model setup" icon={<ChipIcon />}>
        <p className="model-summary"><strong>{model_name}</strong> · {target} · train period {train_period?.[0] ?? "—"} to {train_period?.[1] ?? "—"}</p>
        <details className="feature-details">
          <summary>Show {features.length} model features</summary>
          <ul className="feature-list">{features.map((feature) => <li key={feature}><code>{feature}</code></li>)}</ul>
        </details>
      </Card>
    </div>
  );
}
