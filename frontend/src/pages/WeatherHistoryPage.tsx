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
import { Card, EmptyNote, ErrorBanner, PageHead, Spinner, Skeleton, StatChip } from "../components/ui";
import { ChartIcon, DatabaseIcon, DropletIcon, RainIcon, ThermometerIcon } from "../components/icons";
import type { WeatherRecord } from "../types/api";

const PAGE_SIZE = 1000;

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function WeatherHistoryPage() {
  const states = useFetch(getStates, []);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [location, setLocation] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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

  // The API returns newest-first; reverse only for chronological chart order.
  const filteredRecords = records.filter((record) => (!fromDate || record.date >= fromDate) && (!toDate || record.date <= toDate));
  const filteredChronological = [...filteredRecords].reverse();
  const firstDate = filteredChronological[0]?.date;
  const lastDate = filteredChronological[filteredChronological.length - 1]?.date;
  const avgTempLoaded =
    filteredRecords.length > 0
      ? filteredRecords.reduce((sum, r) => sum + r.temp_avg, 0) / filteredRecords.length
      : null;
  const avgHumidityLoaded =
    filteredRecords.length > 0 ? filteredRecords.reduce((sum, r) => sum + r.humidity, 0) / filteredRecords.length : null;

  return (
    <div className="page">
      <PageHead
        title="Weather History"
        desc="Browse measured daily temperatures and weather conditions."
      />

      <Card title="Historical records" icon={<DatabaseIcon />}>
        <div className="toolbar">
          <label className="field inline">
            <span>State</span>
            {states.loading ? (
              <Spinner label="Loading states…" />
            ) : states.error ? (
              <ErrorBanner message={states.error.message} onRetry={states.retry} />
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
              ) : districtsFetch.error ? (
                <ErrorBanner message={districtsFetch.error.message} onRetry={districtsFetch.retry} />
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
              ) : locationsFetch.error ? (
                <ErrorBanner message={locationsFetch.error.message} onRetry={locationsFetch.retry} />
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
        </div>

        <div className="date-range-filter">
          <label className="field inline"><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label className="field inline"><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
          {(fromDate || toDate) && <button className="btn-secondary" onClick={() => { setFromDate(""); setToDate(""); }}>Clear dates</button>}
        </div>

        {loading && <Skeleton rows={5} />}
        {error && <ErrorBanner message={error} onRetry={() => void load(state, district, location, records.length === 0)} />}
        {!loading && !error && canLoad && records.length === 0 && (
          <EmptyNote
            title="No weather records"
            hint="The backend returned no records for this selection. Try a different region."
          />
        )}
        {!loading && !error && !canLoad && !state && (
          <EmptyNote
            title="Select a region"
            hint="Choose a state — and, where available, a district and location — to load its weather history."
          />
        )}

        {records.length > 0 && filteredRecords.length === 0 && (fromDate || toDate) && <EmptyNote title="No records in this date range" hint="Clear or widen the dates. Date filters apply to records loaded so far." />}
        {records.length > 0 && filteredRecords.length > 0 && (
          <>
            <div className="stat-chips" style={{ marginBottom: 16 }}>
              <StatChip
                icon={<DatabaseIcon />}
                label="Records available"
                value={total.toLocaleString()}
              />
              <StatChip
                icon={<ChartIcon />}
                label="Loaded (newest first)"
                value={filteredRecords.length.toLocaleString()}
              />
              <StatChip
                icon={<ThermometerIcon />}
                label="Avg temp (loaded set)"
                value={`${avgTempLoaded?.toFixed(1)} °C`}
              />
              <StatChip
                icon={<DropletIcon />}
                label="Avg humidity (loaded set)"
                value={`${avgHumidityLoaded?.toFixed(0)} %`}
              />
              {firstDate && lastDate && (
                <StatChip
                  icon={<RainIcon />}
                  label="Loaded date range"
                  value={`${prettyDate(firstDate)} → ${prettyDate(lastDate)}`}
                />
              )}
            </div>

            <div className="chart-box">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={filteredChronological} margin={{ top: 10, right: 20, bottom: 58, left: 0 }}>
                  <CartesianGrid stroke="#e7edf4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#b8c2d5" }}
                    tickFormatter={(value: string) => value}
                    interval="preserveStartEnd"
                    angle={-28}
                    textAnchor="end"
                    height={58}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#b8c2d5" }}
                    domain={["dataMin - 1", "dataMax + 1"]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    unit=" °C"
                  />
                  <Tooltip labelFormatter={prettyDate} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="temp_max"
                    name="Temp Max"
                    stroke="var(--series-max)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_avg"
                    name="Temp Avg"
                    stroke="var(--series-avg)"
                    strokeWidth={2.2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_min"
                    name="Temp Min"
                    stroke="var(--series-min)"
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
                    <th className="num">Temp Max (°C)</th>
                    <th className="num">Temp Avg (°C)</th>
                    <th className="num">Temp Min (°C)</th>
                    <th className="num">Humidity (%)</th>
                    <th className="num">Rainfall (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((r) => (
                    <tr key={`${r.date}-${r.state}-${r.district}-${r.location}`}>
                      <td title={r.date}>{prettyDate(r.date)}</td>
                      <td className="num">{r.temp_max.toFixed(1)}</td>
                      <td className="num strong">{r.temp_avg.toFixed(1)}</td>
                      <td className="num">{r.temp_min.toFixed(1)}</td>
                      <td className="num">{r.humidity.toFixed(1)}</td>
                      <td className="num">{r.rainfall.toFixed(1)}</td>
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
