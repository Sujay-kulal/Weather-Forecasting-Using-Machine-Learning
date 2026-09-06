import { useEffect, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError, getRecentWeather, getStates, getDistricts, getLocations, predict } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Card, EmptyNote, ErrorBanner, Spinner } from "../components/ui";
import type { PredictionResponse } from "../types/api";

function nextDay(iso: string): string {
  // Pure calendar arithmetic (UTC) — immune to the browser's timezone offset,
  // unlike new Date(iso) + toISOString() which can shift the date by a day.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function ForecastPage() {
  const states = useFetch(getStates, []);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);

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

  // Recent 30 records for the selected state/location (chart context + default date)
  const recent = useFetch(
    () => {
      if (!state) return Promise.resolve(null);
      if (hasDistricts) {
        if (!district || !location) return Promise.resolve(null);
        return getRecentWeather(state, 30, district, location);
      }
      return getRecentWeather(state, 30);
    },
    [state, district, location, hasDistricts]
  );

  const recentRecords = recent.data?.records ?? [];

  // Convenient default: the day after the latest available measurement.
  // Only applied while the user has not picked a date themselves.
  useEffect(() => {
    if (state && recentRecords.length > 0 && !dateTouched) {
      setDate(nextDay(recentRecords[recentRecords.length - 1].date));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, recent.loading]);

  const canSubmit = state && date && (!hasDistricts || location);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setPredictError(null);
    setResult(null);
    try {
      const prediction = await predict(state, date, district, location);
      setResult(prediction);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 422) {
        setPredictError(
          `This forecast date cannot currently be predicted because sufficient recent ` +
            `historical measurements are unavailable. (${apiErr.message})`
        );
      } else {
        setPredictError(apiErr.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const locStr = location ? `${state} → ${district} → ${location}` : state;

  return (
    <div className="page">
      <div className="forecast-grid">
        <Card title="Generate a forecast">
          <form onSubmit={onSubmit} className="forecast-form">
            <label className="field">
              <span>State</span>
              {states.loading ? (
                <Spinner label="Loading states…" />
              ) : states.error ? (
                <ErrorBanner message={states.error.message} />
              ) : (
                <select
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    setDistrict("");
                    setLocation("");
                    setDateTouched(false);
                    setResult(null);
                    setPredictError(null);
                  }}
                  required
                >
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
              <label className="field">
                <span>District</span>
                {districtsFetch.loading ? (
                  <Spinner label="Loading districts…" />
                ) : districtsFetch.error ? (
                  <ErrorBanner message={districtsFetch.error.message} />
                ) : (
                  <select
                    value={district}
                    onChange={(e) => {
                      setDistrict(e.target.value);
                      setLocation("");
                      setDateTouched(false);
                      setResult(null);
                      setPredictError(null);
                    }}
                    required
                  >
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
              <label className="field">
                <span>Location</span>
                {locationsFetch.loading ? (
                  <Spinner label="Loading locations…" />
                ) : locationsFetch.error ? (
                  <ErrorBanner message={locationsFetch.error.message} />
                ) : (
                  <select
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      setDateTouched(false);
                      setResult(null);
                      setPredictError(null);
                    }}
                    required
                  >
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

            <label className="field">
              <span>Forecast date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateTouched(true);
                }}
                required
              />
              <small className="hint">
                {recentRecords.length > 0
                  ? `Latest available measurement: ${recentRecords[recentRecords.length - 1].date}. Default forecast: day after latest measurement.`
                  : "Select a location to see available history."}{" "}
                The backend validates the date and rejects dates without sufficient history.
              </small>
            </label>

            <button className="btn-primary" type="submit" disabled={submitting || !canSubmit}>
              {submitting ? "Generating forecast…" : "Generate Forecast"}
            </button>
            <small className="hint">
              Forecasts the next-day average temperature using historical weather data.
            </small>
          </form>
        </Card>

        <Card title="Prediction result">
          {submitting && <Spinner label="Generating forecast…" />}

          {!submitting && predictError && <ErrorBanner message={predictError} />}

          {!submitting && !predictError && !result && (
            <EmptyNote text="Select a location and a forecast date, then generate a forecast. The result will appear here." />
          )}

          {!submitting && result && (
            <div className="result">
              <div className="result-hero">
                <div className="result-label">Predicted Average Temperature</div>
                <div className="result-value">
                  {result.predicted_temp_avg.toFixed(2)} <span className="unit">°C</span>
                </div>
              </div>
              <dl className="result-meta">
                <div>
                  <dt>State</dt>
                  <dd>{result.state}</dd>
                </div>
                {result.district && (
                  <div>
                    <dt>District</dt>
                    <dd>{result.district}</dd>
                  </div>
                )}
                {result.location && (
                  <div>
                    <dt>Location</dt>
                    <dd>{result.location}</dd>
                  </div>
                )}
                <div>
                  <dt>Forecast date</dt>
                  <dd>{result.forecast_date}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{result.model}</dd>
                </div>
                <div>
                  <dt>Typical MAE</dt>
                  <dd>{result.typical_error_mae.toFixed(3)} °C</dd>
                </div>
                <div>
                  <dt>Last known temperature</dt>
                  <dd>
                    {result.last_known.temp_avg.toFixed(2)} °C ({result.last_known.date})
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </Card>
      </div>

      <Card title="Historical Temperature + Forecast">
        {recent.loading && <Spinner label="Loading weather history…" />}
        {recent.error && <ErrorBanner message={recent.error.message} />}
        {!recent.loading && !recent.error && recentRecords.length === 0 && canSubmit && (
          <EmptyNote text="No recent weather records available." />
        )}
        {recentRecords.length > 0 && (
          <>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={chartData(recentRecords, result)}
                  margin={{ top: 10, right: 20, bottom: 5, left: 0 }}
                >
                  <CartesianGrid stroke="#eceef1" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={shortDate} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    domain={["dataMin - 2", "dataMax + 2"]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    unit=" °C"
                  />
                  <Tooltip labelFormatter={fullDate} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="temp_max"
                    name="Temp Max"
                    stroke="#8fb3c7"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_avg"
                    name="Temp Avg"
                    stroke="#1e3a5f"
                    strokeWidth={2.2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_min"
                    name="Temp Min"
                    stroke="#c9ccd1"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  {result && (
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted"
                      stroke="#0e7490"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      connectNulls
                    />
                  )}
                  {result && (
                    <ReferenceDot
                      x={result.forecast_date}
                      y={result.predicted_temp_avg}
                      r={6}
                      fill="#0e7490"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-note">
              The most recent {recentRecords.length} daily measurements for {locStr} (real
              PostgreSQL data), {result ? "with the generated forecast appended." : "from the backend."}
            </p>
            <p className="chart-note subtle">
              Note: the model does not read this chart. The backend performs the actual feature
              engineering (lag features, rolling averages, seasonal encoding) on recent
              measurements before every prediction.
            </p>
          </>
        )}
      </Card>

      <Card title="How the prediction works">
        <div className="pipeline" aria-label="prediction pipeline">
          <span>Historical Weather</span>
          <span className="arrow">→</span>
          <span>Feature Engineering</span>
          <span className="arrow">→</span>
          <span>Gradient Boosting</span>
          <span className="arrow">→</span>
          <span>Next-day Avg Temperature</span>
        </div>
        <p className="chart-note">
          For each prediction the backend builds the same input the model was trained on:
          lag features (temperature of the previous days), 3-day and 7-day rolling averages,
          seasonal/monthly encoding, and the state and season identifiers. You never enter
          weather values manually — only a location and a date.
        </p>
      </Card>
    </div>
  );
}

/** Chart rows: historical records oldest→newest, plus the predicted point. */
interface ChartRow {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_avg: number | null;
  predicted: number | null;
}

function chartData(
  records: { date: string; temp_max: number; temp_min: number; temp_avg: number }[],
  result: PredictionResponse | null,
): ChartRow[] {
  const rows: ChartRow[] = records.map((r) => ({
    date: r.date,
    temp_max: r.temp_max,
    temp_min: r.temp_min,
    temp_avg: r.temp_avg,
    predicted: null,
  }));
  if (result && rows.length > 0) {
    // dashed connector starts at the last known temperature
    rows[rows.length - 1].predicted = rows[rows.length - 1].temp_avg;
    rows.push({
      date: result.forecast_date,
      temp_max: null,
      temp_min: null,
      temp_avg: null,
      predicted: result.predicted_temp_avg,
    });
  }
  return rows;
}

function shortDate(iso: string): string {
  return iso.slice(5); // MM-DD
}
function fullDate(iso: string): string {
  return iso;
}
