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
import { Card, ErrorBanner, PageHead, Spinner, StatChip } from "../components/ui";
import { CalendarIcon, ChipIcon, SlidersIcon, TargetIcon } from "../components/icons";

/** Groups the model input features for display (names come from the API). */
function groupFeatures(features: string[]) {
  const groups: { label: string; items: string[] }[] = [
    { label: "Lag Features", items: features.filter((f) => f.startsWith("lag")) },
    {
      label: "Rolling / Derived Features",
      items: features.filter((f) => f.startsWith("roll") || f.startsWith("rainfall_roll") || f === "temp_range"),
    },
    {
      label: "Seasonal Features",
      items: features.filter((f) => /^(month|day_of_year)_/.test(f)),
    },
    { label: "Categorical Features", items: features.filter((f) => ["Season", "State"].includes(f)) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

export function ModelPerformancePage() {
  const info = useFetch(getModelInfo, []);

  if (info.loading) return <Spinner label="Loading model information…" />;
  if (info.error) return <ErrorBanner message={info.error.message} />;
  if (!info.data) return null;

  const {
    model_name, target, features, metrics, train_period, test_period,
    metrics_status, interval_status, evaluation_note,
  } = info.data;
  const selected = metrics[model_name];
  if (!selected) {
    return (
      <div className="page">
        <PageHead title="Model Performance" desc="Evaluation metadata reported by the backend." />
        <Card title="Evaluation not available" icon={<TargetIcon />}>
          <p className="chart-note">
            {evaluation_note ?? "No evaluation metrics are validated for the current model artifact."}
          </p>
          <p className="chart-note">
            Metrics status: <strong>{metrics_status ?? "unknown"}</strong>. Interval status:{" "}
            <strong>{interval_status ?? "unknown"}</strong>.
          </p>
        </Card>
        <Card title="Model input features" icon={<SlidersIcon />}>
          <p>{features.length} features are built automatically from historical measurements.</p>
          <div className="feature-groups">
            {groupFeatures(features).map((group) => (
              <div key={group.label} className="feature-group">
                <h4>{group.label}<span className="count-badge">{group.items.length}</span></h4>
                <ul>{group.items.map((feature) => <li key={feature}><code>{feature}</code></li>)}</ul>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }
  const comparison = Object.entries(metrics)
    .map(([name, m]) => ({ name, RMSE: m.RMSE, MAE: m.MAE, R2: m.R2 }))
    .sort((a, b) => a.RMSE - b.RMSE);

  return (
    <div className="page">
      <PageHead
        title="Model Performance"
        desc="Evaluation metadata returned by the backend. The status below tells you whether the reported scores apply to the current artifact."
      />

      <p className="chart-note subtle" role="status">
        {metrics_status === "validated_for_current_artifact"
          ? "Metrics are marked as validated for the current model artifact."
          : evaluation_note ?? "These are historical metrics and are not validated for the current model artifact."}
      </p>

      <div className="stat-chips">
        <StatChip icon={<ChipIcon />} label="Model type" value={model_name} />
        <StatChip icon={<TargetIcon />} label="Prediction target" value={target} />
        <StatChip icon={<SlidersIcon />} label="Engineered features" value={features.length} />
        <StatChip
          icon={<CalendarIcon />}
          label="Test period"
          value={`${test_period[0]} → ${test_period[1]}`}
        />
        {info.data.coverage_90 !== undefined && (
          <StatChip
            icon={<TargetIcon />}
            label="Historical empirical coverage"
            value={`${(info.data.coverage_90 * 100).toFixed(1)}%`}
          />
        )}
      </div>

      <div className="model-grid">
        <Card title="Model & training setup" icon={<ChipIcon />}>
          <dl className="meta-list">
            <div>
              <dt>Model</dt>
              <dd>{model_name}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{target}</dd>
            </div>
            <div>
              <dt>Input features</dt>
              <dd>{features.length} engineered features (grouped below)</dd>
            </div>
            <div>
              <dt>Training period</dt>
              <dd>
                {train_period[0]} → {train_period[1]}
              </dd>
            </div>
            <div>
              <dt>Testing period</dt>
              <dd>
                {test_period[0]} → {test_period[1]}
              </dd>
            </div>
          </dl>
          <p className="chart-note" style={{ marginTop: 12 }}>
            This is a <strong>seven-day multi-output</strong> target. Treat the scores as current
            only when the status above confirms validation for this artifact.
          </p>
        </Card>

        <Card
          title={
            metrics_status === "validated_for_current_artifact"
              ? `Metrics — ${model_name} (validated test set)`
              : `Historical metrics — ${model_name} (unvalidated)`
          }
          icon={<TargetIcon />}
        >
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
              <div className="metric-value">{selected.R2.toFixed(3)}</div>
              <div className="metric-name">R²</div>
            </div>
            {info.data.coverage_90 !== undefined && (
              <div className="metric">
                <div className="metric-value">{(info.data.coverage_90 * 100).toFixed(1)}%</div>
                <div className="metric-name">Historical coverage (q = ±{info.data.q?.toFixed(2)} °C)</div>
              </div>
            )}
          </div>
          <ul className="explanations">
            <li>
              <strong>MAE</strong> — average absolute error across the evaluated output cells:
              <strong> {selected.MAE.toFixed(2)} °C</strong>.
            </li>
            <li>
              <strong>RMSE</strong> — like MAE but penalizes larger errors more strongly
              (squared errors before averaging).
            </li>
            <li>
              <strong>R²</strong> — proportion of the target&apos;s variation explained by the
              model (1.0 = perfect).
            </li>
            {info.data.coverage_90 !== undefined && (
              <li>
                <strong>Historical empirical coverage</strong> — the older metadata reports{" "}
                {(info.data.coverage_90 * 100).toFixed(1)}% with q = ±{info.data.q?.toFixed(2)} °C.
                This value is not validated for the current artifact.
              </li>
            )}
          </ul>
        </Card>
      </div>

      <Card
        title="Historical model comparison"
        icon={<ChipIcon />}
        subtitle="Lower RMSE is better. These historical scores are not validated for the current artifact unless the status above says so."
      >
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={comparison} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
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
              <Tooltip formatter={(v: number) => v.toFixed(3)} />
              <Bar dataKey="RMSE" name="RMSE (°C)" radius={[4, 4, 0, 0]}>
                {comparison.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.name === model_name ? "#0284c7" : "#c3d3e4"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-note">
          The persistence baseline repeats the most recent input temperature across all seven
          forecast horizons.
        </p>

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
                    {m.name === model_name
                      ? metrics_status === "validated_for_current_artifact"
                        ? " · validated current artifact"
                        : " · historical scores"
                      : ""}
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

      <Card
        title="Model input features (built automatically by the backend)"
        icon={<SlidersIcon />}
        subtitle={`Exactly ${features.length} features are engineered server-side from recent measurements before every prediction.`}
      >
        <div className="feature-groups">
          {groupFeatures(features).map((g) => (
            <div key={g.label} className="feature-group">
              <h4>
                {g.label}
                <span className="count-badge">{g.items.length}</span>
              </h4>
              <ul>
                {g.items.map((f) => (
                  <li key={f}>
                    <code>{f}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
