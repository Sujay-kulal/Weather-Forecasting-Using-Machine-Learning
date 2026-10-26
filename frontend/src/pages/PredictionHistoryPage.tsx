import { useCallback, useEffect, useState } from "react";
import { Line, LineChart, YAxis } from "recharts";
import { getModelInfo, getPredictions, getStates } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Badge, Card, EmptyNote, ErrorBanner, PageHead, Skeleton, StatChip } from "../components/ui";
import { DatabaseIcon, ListIcon, RefreshIcon, ThermometerIcon } from "../components/icons";
import type { PredictionRecord } from "../types/api";

const LIMIT_OPTIONS = [25, 50, 100];

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function Sparkline(props: { values: number[] }) {
  const rows = props.values.map((temp, index) => ({ day: index + 1, temp }));
  return (
    <div className="prediction-spark" aria-label={`7-day temperatures ${props.values.map((value) => `${value.toFixed(1)} degrees`).join(", ")}`}>
      <LineChart width={112} height={38} data={rows}>
        <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
        <Line type="monotone" dataKey="temp" stroke="var(--series-predicted)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </div>
  );
}

export function PredictionHistoryPage() {
  const states = useFetch(getStates, []);
  const modelInfo = useFetch(getModelInfo, []);
  const [limit, setLimit] = useState(25);
  const [stateFilter, setStateFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<PredictionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getPredictions(limit, page * limit, stateFilter || undefined, modelFilter || undefined);
      setRows(response.predictions);
      setTotal(response.total);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [limit, modelFilter, page, stateFilter, attempt]);

  useEffect(() => { void load(); }, [load]);

  const versions = Array.from(new Set([
    ...(modelInfo.data?.loaded_artifact_version ? [modelInfo.data.loaded_artifact_version] : []),
    ...rows.map((row) => row.model_version).filter((version): version is string => Boolean(version)),
  ]));
  const showDistrict = rows.some((row) => Boolean(row.district));
  const showLocation = rows.some((row) => Boolean(row.location));
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="page">
      <PageHead title="Predictions" desc="Browse saved forecasts with server-side filters and paging." />
      <Card title="Stored predictions" icon={<ListIcon />}>
        <div className="toolbar">
          <label className="field inline"><span>State</span>
            <select value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setPage(0); }}>
              <option value="">All states</option>
              {states.data?.states.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label className="field inline"><span>Model version</span>
            <select value={modelFilter} onChange={(event) => { setModelFilter(event.target.value); setPage(0); }}>
              <option value="">All versions</option>
              {versions.map((version) => <option key={version} value={version}>{version}</option>)}
            </select>
          </label>
          <label className="field inline"><span>Rows per page</span>
            <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(0); }}>
              {LIMIT_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <button className="btn-secondary" onClick={() => setAttempt((value) => value + 1)} disabled={loading}>
            <RefreshIcon /> Retry / refresh
          </button>
        </div>

        {states.error && <ErrorBanner message={states.error.message} onRetry={states.retry} />}
        {modelInfo.error && <ErrorBanner message={modelInfo.error.message} onRetry={modelInfo.retry} />}
        {error && <ErrorBanner message={error} onRetry={() => setAttempt((value) => value + 1)} />}
        {loading && <Skeleton rows={5} />}
        {!loading && !error && rows.length === 0 && <EmptyNote title="No predictions found" hint="Try another filter or create a forecast on the Forecast page." />}

        {!loading && rows.length > 0 && <>
          <div className="stat-chips">
            <StatChip icon={<DatabaseIcon />} label="Matching predictions" value={total.toLocaleString()} />
            <StatChip icon={<ThermometerIcon />} label="Rows on this page" value={rows.length} />
            <StatChip icon={<ListIcon />} label="Page" value={`${page + 1} / ${pageCount}`} />
          </div>
          <div className="table-wrap">
            <table className="prediction-table">
              <thead><tr>
                <th className="num">ID</th><th>State</th>
                {showDistrict && <th>District</th>}{showLocation && <th>Location</th>}
                <th>Forecast date</th><th>7-day forecast</th><th>Model version</th><th>Created</th>
              </tr></thead>
              <tbody>{rows.map((row) => {
                const values = Array.isArray(row.predicted_temp_avg) ? row.predicted_temp_avg : [Number(row.predicted_temp_avg)];
                return <tr key={row.id}>
                  <td className="num">{row.id}</td>
                  <td><Badge>{row.state}</Badge></td>
                  {showDistrict && <td>{row.district || <span className="muted-cell">—</span>}</td>}
                  {showLocation && <td>{row.location || <span className="muted-cell">—</span>}</td>}
                  <td>{prettyDate(row.forecast_date)}</td>
                  <td><div className="forecast-cell"><Sparkline values={values} /><details className="forecast-values"><summary>View values</summary><div className="day-values">{values.map((value, index) => <span key={index}>D{index + 1}: {value.toFixed(1)}°</span>)}</div></details></div></td>
                  <td>{row.model_version || <span className="muted-cell">—</span>}</td>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="pagination-controls">
            <span>Showing {page * limit + 1}–{page * limit + rows.length} of {total.toLocaleString()}</span>
            <div><button className="btn-secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || loading}>Previous</button>
              <button className="btn-secondary" onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * limit >= total || loading}>Next</button></div>
          </div>
        </>}
      </Card>
    </div>
  );
}
