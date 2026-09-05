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
import { Card, ErrorBanner, Spinner } from "../components/ui";

/** Groups the 13 model input features for display (names come from the API). */
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
      <div className="model-grid">
        <Card title="Selected model">
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
        </Card>

        <Card title={`Metrics — ${model_name} (test set)`}>
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

      <Card title="Model comparison (all candidates evaluated in Phase 1)">
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={comparison} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid stroke="#eceef1" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 11 }} unit=" °C" />
              <Tooltip formatter={(v: number) => v.toFixed(3)} />
              <Bar dataKey="RMSE" name="RMSE (°C)" radius={[3, 3, 0, 0]}>
                {comparison.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.name === model_name ? "#0e7490" : "#b9c6d3"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-note">
          Lower RMSE is better. The highlighted bar is the model currently deployed in the
          backend (selected by lowest RMSE during training). The naive baseline
          &ldquo;tomorrow&nbsp;=&nbsp;today&rdquo; is included to show the improvement over a
          no-ML approach.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>MAE (°C)</th>
                <th>RMSE (°C)</th>
                <th>R²</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((m) => (
                <tr key={m.name} className={m.name === model_name ? "highlight-row" : ""}>
                  <td>{m.name}</td>
                  <td>{m.MAE.toFixed(4)}</td>
                  <td>{m.RMSE.toFixed(4)}</td>
                  <td>{m.R2.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Model input features (built automatically by the backend)">
        <div className="feature-groups">
          {groupFeatures(features).map((g) => (
            <div key={g.label} className="feature-group">
              <h4>{g.label}</h4>
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
