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
import { Card, EmptyNote, ErrorBanner, PageHead, Spinner, StatChip } from "../components/ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ChipIcon,
  CloudSunIcon,
  DatabaseIcon,
  DropletIcon,
  MinusIcon,
  RainIcon,
  SlidersIcon,
  SparkIcon,
  ThermometerIcon,
} from "../components/icons";
import type { PredictionResponse } from "../types/api";

function nextDay(iso: string): string {
  // Pure calendar arithmetic (UTC) — immune to the browser's timezone offset,
  // unlike new Date(iso) + toISOString() which can shift the date by a day.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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
  const latest = recentRecords.length > 0 ? recentRecords[recentRecords.length - 1] : null;

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
  const dateStepNo = 1 + (hasDistricts ? 1 : 0) + (district && hasLocations ? 1 : 0) + 1;

  return (
    <div className="page">
      <PageHead
        title="Forecast"
        desc="Select a region and a date — the backend engineers the same 13 features used in training and the Gradient Boosting model predicts the average temperature for that day."
      />

      <div className="forecast-grid">
        <Card title="Generate a forecast" icon={<CloudSunIcon />}>
          <form onSubmit={onSubmit} className="forecast-form">
            <label className="field">
              <span>
                <span className="step-number" aria-hidden="true">1</span> State
              </span>
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
                <span>
                  <span className="step-number" aria-hidden="true">2</span> District
                </span>
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
                <span>
                  <span className="step-number" aria-hidden="true">3</span> Location
                </span>
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
              <span>
                <span className="step-number" aria-hidden="true">{dateStepNo}</span> Forecast date
              </span>
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
                {latest
                  ? `Latest available measurement: ${latest.date}. Default: the day after the latest measurement.`
                  : "Select a location to see available history."}{" "}
                The backend validates the date and rejects dates without sufficient history.
              </small>
            </label>

            <button className="btn-primary" type="submit" disabled={submitting || !canSubmit}>
              <SparkIcon />
              {submitting ? "Generating forecast…" : "Generate Forecast"}
            </button>
            <small className="hint">
              Forecasts the next-day average temperature using historical weather data.
            </small>
          </form>
        </Card>

        <Card title="Prediction result" icon={<ThermometerIcon />}>
          {submitting && <Spinner label="Generating forecast…" />}

          {!submitting && predictError && <ErrorBanner message={predictError} />}

          {!submitting && !predictError && !result && (
            <EmptyNote
              title="No forecast yet"
              hint="Select a location and a forecast date, then generate a forecast. The result will appear here."
            />
          )}

          {!submitting && result && (
            <div className="result">
              <div className="result-hero">
                <CloudSunIcon className="hero-icon" />
                <div className="result-label">Predicted Average Temperature</div>
                <div className="result-value">
                  {result.predicted_temp_avg.toFixed(2)}
                  <span className="unit">°C</span>
                </div>
                <div className="result-sub">
                  for {result.location || result.state}
                  {result.district && result.location ? `, ${result.district}` : ""} on{" "}
                  {prettyDate(result.forecast_date)}
                </div>
                {result.last_known && (
                  <span className="result-delta">
                    {(() => {
                      const delta =
                        Math.round((result.predicted_temp_avg - result.last_known.temp_avg) * 10) /
                        10;
                      const Icon =
                        delta > 0 ? ArrowUpIcon : delta < 0 ? ArrowDownIcon : MinusIcon;
                      return (
                        <>
                          <Icon />
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(1)} °C vs last known ({result.last_known.date}:{" "}
                          {result.last_known.temp_avg.toFixed(1)} °C)
                        </>
                      );
                    })()}
                  </span>
                )}
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
                  <dt>Typical error (MAE)</dt>
                  <dd>± {result.typical_error_mae.toFixed(3)} °C</dd>
                </div>
              </dl>
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Recent weather context"
        icon={<DropletIcon />}
        subtitle={
          latest
            ? `Latest measurements recorded for ${locStr} — loaded from the backend (real PostgreSQL data).`
            : undefined
        }
      >
        {recent.loading && <Spinner label="Loading weather history…" />}
        {recent.error && <ErrorBanner message={recent.error.message} />}
        {!recent.loading && !recent.error && recentRecords.length === 0 && state && (
          <EmptyNote
            title="No recent weather records"
            hint="The backend returned no recent measurements for this selection."
          />
        )}
        {!recent.loading && !recent.error && recentRecords.length === 0 && !state && (
          <EmptyNote
            title="Select a region first"
            hint="Recent measurements for the selected region will appear here."
          />
        )}
        {latest && (
          <div className="stat-chips" style={{ marginBottom: 16 }}>
            <StatChip
              icon={<ThermometerIcon />}
              label={`Latest temp avg · ${latest.date}`}
              value={`${latest.temp_avg.toFixed(1)} °C`}
            />
            <StatChip
              icon={<CalendarIcon />}
              label="Day range"
              value={`${latest.temp_min.toFixed(0)}–${latest.temp_max.toFixed(0)} °C`}
            />
            <StatChip
              icon={<DropletIcon />}
              label="Humidity (latest)"
              value={`${latest.humidity.toFixed(0)} %`}
            />
            <StatChip
              icon={<RainIcon />}
              label="Rainfall (latest)"
              value={`${latest.rainfall.toFixed(1)} mm`}
            />
          </div>
        )}
        {recentRecords.length > 0 && (
          <>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={chartData(recentRecords, result)}
                  margin={{ top: 10, right: 20, bottom: 5, left: 0 }}
                >
                  <CartesianGrid stroke="#e7edf4" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5a6b82" }} tickFormatter={shortDate} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#5a6b82" }}
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
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_avg"
                    name="Temp Avg"
                    stroke="#0f4c81"
                    strokeWidth={2.2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_min"
                    name="Temp Min"
                    stroke="#93c5fd"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  {result && (
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted"
                      stroke="#0284c7"
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
                      fill="#0284c7"
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

      <Card title="How the prediction works" icon={<ChipIcon />}>
        <div className="pipeline" aria-label="prediction pipeline">
          <span className="pipeline-step">
            <DatabaseIcon /> Historical Weather
          </span>
          <span className="arrow" aria-hidden="true">→</span>
          <span className="pipeline-step">
            <SlidersIcon /> Feature Engineering
          </span>
          <span className="arrow" aria-hidden="true">→</span>
          <span className="pipeline-step">
            <ChipIcon /> Gradient Boosting
          </span>
          <span className="arrow" aria-hidden="true">→</span>
          <span className="pipeline-step">
            <ThermometerIcon /> Next-day Avg Temperature
          </span>
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
  return prettyDate(iso);
}
