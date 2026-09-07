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
    { label: "Rolling Features", items: features.filter((f) => f.startsWith("roll")) },
    { label: "Seasonal Features", items: features.filter((f) => f.startsWith("month_")) },
    { label: "Categorical Features", items: features.filter((f) => ["Season", "State"].includes(f)) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

export function ModelPerformancePage() {
  const info = useFetch(getModelInfo, []);

  if (info.loading) return <Spinner label="Loading model information…" />;
  if (info.error) return <ErrorBanner message={info.error.message} />;
  if (!info.data) return null;

  const { model_name, target, features, metrics, train_period, test_period } = info.data;
  const selected = metrics[model_name];
  const comparison = Object.entries(metrics)
    .map(([name, m]) => ({ name, RMSE: m.RMSE, MAE: m.MAE, R2: m.R2 }))
    .sort((a, b) => a.RMSE - b.RMSE);

  return (
    <div className="page">
      <PageHead
        title="Model Performance"
        desc="Evaluation of the trained model on the held-out test period. Every number below comes from the backend's /model-info endpoint — nothing is hardcoded."
      />

      <div className="stat-chips">
        <StatChip icon={<ChipIcon />} label="Model type" value={model_name} />
        <StatChip icon={<TargetIcon />} label="Prediction target" value={target} />
        <StatChip icon={<SlidersIcon />} label="Engineered features" value={features.length} />
        <StatChip
          icon={<CalendarIcon />}
          label="Test period"
          value={`${test_period[0]} → ${test_period[1]}`}
        />
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
              <dd>{target} (next-day average temperature, °C)</dd>
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
            The split is <strong>temporal</strong>: the model is trained on the earlier period and
            evaluated on the later one, so the test metrics reflect performance on dates the
            model has never seen.
          </p>
        </Card>

        <Card title={`Metrics — ${model_name} (test set)`} icon={<TargetIcon />}>
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
          </div>
          <ul className="explanations">
            <li>
              <strong>MAE</strong> — average absolute prediction error: on a typical day the
              forecast is off by about {selected.MAE.toFixed(2)} °C.
            </li>
            <li>
              <strong>RMSE</strong> — like MAE but penalizes larger errors more strongly
              (squared errors before averaging).
            </li>
            <li>
              <strong>R²</strong> — proportion of the target&apos;s variation explained by the
              model (1.0 = perfect).
            </li>
          </ul>
        </Card>
      </div>

      <Card
        title="Model comparison (all candidates evaluated in Phase 1)"
        icon={<ChipIcon />}
        subtitle="Lower RMSE is better. The highlighted bar is the model currently deployed in the backend (selected by lowest RMSE during training)."
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
          The naive baseline &ldquo;tomorrow&nbsp;=&nbsp;today&rdquo; is included to show the
          improvement over a no-ML approach.
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
