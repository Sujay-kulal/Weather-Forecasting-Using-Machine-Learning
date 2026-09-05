import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getStates, getWeatherHistory } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Card, EmptyNote, ErrorBanner, Spinner } from "../components/ui";
import type { WeatherRecord } from "../types/api";

const PAGE_SIZE = 60;

export function WeatherHistoryPage() {
  const states = useFetch(getStates, []);
  const [state, setState] = useState("");
  const [records, setRecords] = useState<WeatherRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  async function load(s: string, reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const offset = reset ? 0 : records.length;
      const resp = await getWeatherHistory(s, PAGE_SIZE, offset);
      setTotal(resp.count);
      setRecords((prev) => (reset ? resp.records : [...prev, ...resp.records]));
      if (resp.records.length < PAGE_SIZE) setExhausted(true);
      else setExhausted(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onStateChange(s: string) {
    setState(s);
    setRecords([]);
    setExhausted(false);
    if (s) void load(s, true);
  }

  // newest-first from API → oldest-first for chart + table
  const chronological = [...records].reverse();
  const firstDate = chronological[0]?.date;
  const lastDate = chronological[chronological.length - 1]?.date;

  return (
    <div className="page">
      <Card title="Weather history (real PostgreSQL data)">
        <div className="toolbar">
          <label className="field inline">
            <span>State</span>
            {states.loading ? (
              <Spinner label="Loading states…" />
            ) : states.error ? (
              <ErrorBanner message={states.error.message} />
            ) : (
              <select value={state} onChange={(e) => onStateChange(e.target.value)}>
                <option value="" disabled>
                  Select a state…
                </option>
                {states.data?.states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </label>

          {state && !loading && !error && (
            <div className="coverage">
              <div>
                <strong>{total}</strong> records available
              </div>
              <div>
                loaded: <strong>{records.length}</strong>
                {firstDate && lastDate && (
                  <>
                    {" "}
                    · {firstDate} → {lastDate}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {loading && <Spinner label="Loading weather history…" />}
        {error && <ErrorBanner message={error} />}
        {!loading && !error && state && records.length === 0 && (
          <EmptyNote text="No weather records found for this state." />
        )}

        {records.length > 0 && (
          <>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chronological} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid stroke="#eceef1" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    unit=" °C"
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="temp_max"
                    name="Temp Max"
                    stroke="#8fb3c7"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_avg"
                    name="Temp Avg"
                    stroke="#1e3a5f"
                    strokeWidth={2.2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_min"
                    name="Temp Min"
                    stroke="#c9ccd1"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Temp Max (°C)</th>
                    <th>Temp Avg (°C)</th>
                    <th>Temp Min (°C)</th>
                    <th>Humidity (%)</th>
                    <th>Rainfall (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...records].map((r) => (
                    <tr key={`${r.date}-${r.state}`}>
                      <td>{r.date}</td>
                      <td>{r.temp_max.toFixed(1)}</td>
                      <td>{r.temp_avg.toFixed(1)}</td>
                      <td>{r.temp_min.toFixed(1)}</td>
                      <td>{r.humidity.toFixed(1)}</td>
                      <td>{r.rainfall.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="load-more">
              <button
                className="btn-secondary"
                onClick={() => void load(state, false)}
                disabled={loading || exhausted}
              >
                {exhausted ? "All records loaded" : "Load older data"}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
