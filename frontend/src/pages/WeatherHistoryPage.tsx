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
import { getStates, getDistricts, getLocations, getWeatherHistory } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Card, EmptyNote, ErrorBanner, Spinner } from "../components/ui";
import type { WeatherRecord } from "../types/api";

const PAGE_SIZE = 60;

export function WeatherHistoryPage() {
  const states = useFetch(getStates, []);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [location, setLocation] = useState("");

  const [records, setRecords] = useState<WeatherRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  const districtsFetch = useFetch(
    () => (state ? getDistricts(state) : Promise.resolve(null)),
    [state]
  );

  const locationsFetch = useFetch(
    () => (state && district ? getLocations(state, district) : Promise.resolve(null)),
    [state, district]
  );

  const hasDistricts = (districtsFetch.data?.districts.length ?? 0) > 0;
  const hasLocations = (locationsFetch.data?.locations.length ?? 0) > 0;

  async function load(s: string, d: string, l: string, reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const offset = reset ? 0 : records.length;
      const resp = await getWeatherHistory(s, PAGE_SIZE, offset, d, l);
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
    setDistrict("");
    setLocation("");
    setRecords([]);
    setExhausted(false);

    // We don't auto-load here if there are districts.
    // Actually we can't cleanly know synchronously if there are districts.
    // The user should click a "Load" button or we auto-load when dependencies are met.
  }

  function onDistrictChange(d: string) {
    setDistrict(d);
    setLocation("");
    setRecords([]);
    setExhausted(false);
  }

  function onLocationChange(l: string) {
    setLocation(l);
    setRecords([]);
    setExhausted(false);
    if (state && district && l) void load(state, district, l, true);
  }

  // Auto load state-level if no districts
  if (state && !loading && !error && records.length === 0 && !hasDistricts && districtsFetch.data) {
    // hacky way to auto-load state-level when district fetch completes and is empty
    if (!exhausted) void load(state, "", "", true);
  }

  const canLoad = state && (!hasDistricts || location);

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

          {hasDistricts && (
            <label className="field inline">
              <span>District</span>
              {districtsFetch.loading ? (
                <Spinner label="Loading districts…" />
              ) : (
                <select value={district} onChange={(e) => onDistrictChange(e.target.value)}>
                  <option value="" disabled>
                    Select a district…
                  </option>
                  {districtsFetch.data?.districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {district && hasLocations && (
            <label className="field inline">
              <span>Location</span>
              {locationsFetch.loading ? (
                <Spinner label="Loading locations…" />
              ) : (
                <select value={location} onChange={(e) => onLocationChange(e.target.value)}>
                  <option value="" disabled>
                    Select a location…
                  </option>
                  {locationsFetch.data?.locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {canLoad && !loading && !error && records.length > 0 && (
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
        {!loading && !error && canLoad && records.length === 0 && (
          <EmptyNote text="No weather records found for this selection." />
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
                    <tr key={`${r.date}-${r.state}-${r.district}-${r.location}`}>
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
                onClick={() => void load(state, district, location, false)}
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
