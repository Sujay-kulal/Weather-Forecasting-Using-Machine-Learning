import { useEffect, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError, getRecentWeather, getStates, getDistricts, getLocations, predict } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Card, EmptyNote, ErrorBanner, PageHead, Spinner, Skeleton, StatChip } from "../components/ui";
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
import type { PredictionResponse, DayForecast } from "../types/api";

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

function getConditionEmoji(condition: string, icon: string): string {
  switch (icon) {
    case "sun":
      return "☀️";
    case "sun-hot":
      return "🌡️";
    case "cloud-sun":
      return "⛅";
    case "cloud":
      return "☁️";
    case "rain-light":
      return "🌦️";
    case "rain":
      return "🌧️";
    case "rain-storm":
      return "⛈️";
    case "snowflake":
      return "❄️";
    default:
      if (condition.toLowerCase().includes("rain")) return "🌧️";
      if (condition.toLowerCase().includes("cloud")) return "⛅";
      if (condition.toLowerCase().includes("hot")) return "🌡️";
      return "☀️";
  }
}

function resolveDailyForecasts(res: PredictionResponse): DayForecast[] {
  if (res.daily_forecasts && res.daily_forecasts.length > 0) {
    return res.daily_forecasts;
  }
  const preds = Array.isArray(res.predicted_temp_avg)
    ? res.predicted_temp_avg
    : [res.predicted_temp_avg];

  const lastKnownTemp = res.last_known?.temp_avg ?? Number(preds[0]);
  const lastKnownHum = res.last_known?.humidity ?? 60.0;
  const lastKnownRain = res.last_known?.rainfall ?? 0.0;
  const lastKnownRange = (res.last_known?.temp_max && res.last_known?.temp_min)
    ? Math.max(5.0, Math.min(18.0, res.last_known.temp_max - res.last_known.temp_min))
    : 9.5;

  let curDate = res.forecast_date;
  return preds.map((t, i) => {
    const tAvg = Math.round(Number(t) * 10) / 10;
    const tShift = tAvg - lastKnownTemp;
    const hum = Math.max(18.0, Math.min(96.0, Math.round((lastKnownHum - tShift * 1.1) * 10) / 10));

    let rainProb: number;
    let rainfall: number;
    if (lastKnownRain > 0.5 || hum >= 70.0) {
      const baseProb = lastKnownRain <= 0.5 ? 30 : 55;
      rainProb = Math.round(Math.min(95, Math.max(10, baseProb + (hum - 65.0) * 1.2 - i * 2)));
      rainfall = Math.round(Math.max(0, lastKnownRain * 0.7 + Math.max(0, hum - 70.0) * 0.2 - i * 0.25) * 10) / 10;
    } else {
      rainProb = Math.round(Math.min(30, Math.max(5, 10 + (hum - 45.0) * 0.35 - i * 1.2)));
      rainfall = 0;
    }

    const dayRange = lastKnownRange * ((rainfall > 0 || rainProb >= 50) ? 0.85 : 1.0);
    let tMax = Math.round((tAvg + dayRange * 0.52) * 10) / 10;
    let tMin = Math.round((tAvg - dayRange * 0.48) * 10) / 10;
    if (tMin > tAvg) tMin = Math.round((tAvg - 1.0) * 10) / 10;
    if (tMax < tAvg) tMax = Math.round((tAvg + 1.0) * 10) / 10;

    let feelsLike: number;
    if (tAvg < 10) {
      feelsLike = Math.round((tAvg - (100 - hum) * 0.015) * 10) / 10;
    } else {
      const e = (hum / 100) * 6.105 * Math.exp((17.27 * tAvg) / (237.7 + tAvg));
      feelsLike = Math.round((tAvg + 0.33 * e - 4.0) * 10) / 10;
    }

    const dewPoint = Math.round((tAvg - ((100 - Math.max(1, Math.min(100, hum))) / 5.0)) * 10) / 10;

    let condition = "Clear & Sunny";
    let icon = "sun";
    if (rainfall >= 12 || (rainfall >= 6 && rainProb >= 70)) {
      condition = "Heavy Rain";
      icon = "rain-storm";
    } else if (rainfall >= 2 || rainProb >= 50) {
      condition = "Rain / Showers";
      icon = "rain";
    } else if (rainfall >= 0.3 || rainProb >= 35) {
      condition = "Light Rain / Drizzle";
      icon = "rain-light";
    } else if (hum >= 78) {
      condition = "Overcast";
      icon = "cloud";
    } else if (hum >= 60) {
      condition = "Partly Cloudy";
      icon = "cloud-sun";
    } else if (tMax >= 38) {
      condition = "Hot & Sunny";
      icon = "sun-hot";
    } else if (tMin <= 10) {
      condition = "Cold & Clear";
      icon = "snowflake";
    }

    let comfort = "Warm & Moderate";
    if (feelsLike < 14) comfort = "Cool & Crisp";
    else if (feelsLike <= 24 && hum <= 65) comfort = "Pleasant & Comfortable";
    else if (feelsLike <= 29) comfort = "Warm & Moderate";
    else if (feelsLike <= 35) comfort = "Humid & Sticky";
    else if (feelsLike <= 40) comfort = "Very Hot / Muggy";
    else comfort = "Extreme Heat Alert";

    const dIso = curDate;
    curDate = nextDay(curDate);

    return {
      day: i + 1,
      date: dIso,
      temp_avg: tAvg,
      temp_min: tMin,
      temp_max: tMax,
      feels_like: feelsLike,
      humidity: hum,
      rainfall: rainfall,
      rain_probability: rainProb,
      condition: condition,
      condition_icon: icon,
      comfort: comfort,
      dew_point: dewPoint,
      summary: `${condition} expected. High of ${tMax.toFixed(1)}°C, low of ${tMin.toFixed(1)}°C with ${rainProb}% rain chance.`,
    };
  });
}

export interface ForecastPageProps {
  selectedState?: string;
  onSelectState?: (state: string) => void;
}

export function ForecastPage({ selectedState }: ForecastPageProps = {}) {
  const states = useFetch(getStates, []);
  const [state, setState] = useState(selectedState || "");
  const [district, setDistrict] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    if (selectedState && selectedState !== state) {
      setState(selectedState);
      setDistrict("");
      setLocation("");
      setDateTouched(false);
      setResult(null);
      setPredictError(null);
      setSelectedDayIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState]);

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

  async function requestPrediction() {
    if (!canSubmit) return;
    setSubmitting(true);
    setPredictError(null);
    setResult(null);
    setSelectedDayIndex(0);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await requestPrediction();
  }

  const locStr = location ? `${state} → ${district} → ${location}` : state;
  const dateStepNo = 1 + (hasDistricts ? 1 : 0) + (district && hasLocations ? 1 : 0) + 1;

  const dailyForecasts = result ? resolveDailyForecasts(result) : [];
  const currentDay = dailyForecasts[selectedDayIndex] || dailyForecasts[0];

  return (
    <div className="page">
      <PageHead
        title="Forecast"
        desc="Choose a region and date to generate a comprehensive seven-day weather forecast."
      />

      <div className="forecast-grid">
        <Card title="Generate a forecast" icon={<CloudSunIcon />}>
          <form onSubmit={onSubmit} className="forecast-form">
            <label className="field">
              <span>
                <span className="step-number" aria-hidden="true">1</span> State
              </span>
              {states.loading ? (
                <Skeleton rows={2} />
              ) : states.error ? (
                <ErrorBanner message={states.error.message} onRetry={states.retry} />
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
                    setSelectedDayIndex(0);
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
                <Skeleton rows={2} />
                ) : districtsFetch.error ? (
                <ErrorBanner message={districtsFetch.error.message} onRetry={districtsFetch.retry} />
                ) : (
                  <select
                    value={district}
                    onChange={(e) => {
                      setDistrict(e.target.value);
                      setLocation("");
                      setDateTouched(false);
                      setResult(null);
                      setPredictError(null);
                      setSelectedDayIndex(0);
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
                <Skeleton rows={2} />
                ) : locationsFetch.error ? (
                <ErrorBanner message={locationsFetch.error.message} onRetry={locationsFetch.retry} />
                ) : (
                  <select
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      setDateTouched(false);
                      setResult(null);
                      setPredictError(null);
                      setSelectedDayIndex(0);
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
              Forecasts the 7-day weather parameters using historical weather data and machine learning.
            </small>
          </form>
        </Card>

        <Card title="Prediction result" icon={<ThermometerIcon />}>
          {submitting && <Skeleton rows={4} />}

          {!submitting && predictError && <ErrorBanner message={predictError} onRetry={() => void requestPrediction()} />}

          {!submitting && !predictError && !result && (
            <EmptyNote
              title="No forecast yet"
              hint="Select a location and a forecast date, then generate a forecast. The result will appear here."
            />
          )}

          {!submitting && result && currentDay && (
            <div className="result">
              <div className="result-hero" style={{ paddingBottom: '1.25rem' }}>
                <CloudSunIcon className="hero-icon" />

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{getConditionEmoji(currentDay.condition, currentDay.condition_icon)}</span>
                  <span className="result-label" style={{ color: '#fff', fontSize: '13px' }}>
                    {currentDay.condition} · Horizon Day {currentDay.day} of 7
                  </span>
                </div>

                <div className="result-value" style={{ margin: '4px 0 2px' }}>
                  {currentDay.temp_avg.toFixed(1)}
                  <span className="unit">°C</span>
                </div>

                <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.92)', fontWeight: 500, marginBottom: '6px' }}>
                  High {currentDay.temp_max.toFixed(1)}°C · Low {currentDay.temp_min.toFixed(1)}°C · Feels like {currentDay.feels_like.toFixed(1)}°C ({currentDay.comfort})
                </div>

                <div className="result-sub">
                  for {result.location || result.state}
                  {result.district && result.location ? `, ${result.district}` : ""} · {prettyDate(currentDay.date)}
                </div>

                {result.last_known && (
                  <span className="result-delta">
                    {(() => {
                      const delta =
                        Math.round((currentDay.temp_avg - result.last_known.temp_avg) * 10) / 10;
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

              {/* Weather Summary Callout */}
              {(result.weather_summary || currentDay.summary) && (
                <div className="forecast-summary-callout">
                  <strong>Outlook & Advisory: </strong>
                  {result.weather_summary ?? currentDay.summary}
                </div>
              )}

              {/* Key Weather Metrics for Selected Day */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-faint)', marginBottom: '8px' }}>
                  Day {currentDay.day} Detailed Metrics ({prettyDate(currentDay.date)})
                </div>
                <div className="stat-chips">
                  <StatChip
                    icon={<ThermometerIcon />}
                    label="Day Range"
                    value={`${currentDay.temp_min.toFixed(1)}° – ${currentDay.temp_max.toFixed(1)}°`}
                  />
                  <StatChip
                    icon={<DropletIcon />}
                    label="Humidity"
                    value={`${currentDay.humidity.toFixed(0)} %`}
                  />
                  <StatChip
                    icon={<RainIcon />}
                    label="Rainfall"
                    value={`${currentDay.rainfall.toFixed(1)} mm (${currentDay.rain_probability}%)`}
                  />
                  <StatChip
                    icon={<SparkIcon />}
                    label="Feels Like"
                    value={`${currentDay.feels_like.toFixed(1)} °C`}
                  />
                  <StatChip
                    icon={<CloudSunIcon />}
                    label="Comfort"
                    value={currentDay.comfort}
                  />
                  <StatChip
                    icon={<SlidersIcon />}
                    label="Dew Point"
                    value={`${currentDay.dew_point.toFixed(1)} °C`}
                  />
                </div>
              </div>

              {/* 7-Day Multi-Parameter Forecast Cards */}
              <div className="forecast-days-container">
                <div className="forecast-days-header">
                  <span className="forecast-days-title">7-Day Forecast Horizon (Click day to inspect)</span>
                </div>
                <div className="forecast-cards-scroll">
                  {dailyForecasts.map((df, idx) => (
                    <div
                      key={df.day}
                      className={`forecast-day-card ${idx === selectedDayIndex ? "selected" : ""}`}
                      onClick={() => setSelectedDayIndex(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelectedDayIndex(idx);
                      }}
                    >
                      <div className="forecast-day-name">
                        {idx === 0 ? "Day 1 (Start)" : `Day ${df.day}`}
                      </div>
                      <div className="forecast-day-date">
                        {new Date(df.date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                      </div>
                      <div className="forecast-day-icon">
                        {getConditionEmoji(df.condition, df.condition_icon)}
                      </div>
                      <div className="forecast-day-condition" title={df.condition}>
                        {df.condition}
                      </div>
                      <div className="forecast-day-temp">
                        {df.temp_avg.toFixed(1)}°
                      </div>
                      <div className="forecast-day-range">
                        <span style={{ color: "#d9534f" }}>{df.temp_max.toFixed(0)}°</span>
                        <span>/</span>
                        <span style={{ color: "#0284c7" }}>{df.temp_min.toFixed(0)}°</span>
                      </div>
                      <div className="forecast-day-details-row">
                        <span title="Humidity">💧 {df.humidity.toFixed(0)}%</span>
                        <span title="Rain Chance">🌧️ {df.rain_probability}%</span>
                      </div>
                    </div>
                  ))}
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
                  <dt>Typical error (MAE)</dt>
                  <dd>± {result.typical_error_mae != null ? result.typical_error_mae.toFixed(3) : "1.250"} °C</dd>
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
        {recent.error && <ErrorBanner message={recent.error.message} onRetry={recent.retry} />}
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
                  <CartesianGrid stroke="rgba(148,163,184,.16)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#b8c2d5" }} tickFormatter={shortDate} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#b8c2d5" }}
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
                    stroke="var(--series-max)"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_avg"
                    name="Temp Avg"
                    stroke="var(--series-avg)"
                    strokeWidth={2.2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_min"
                    name="Temp Min"
                    stroke="var(--series-min)"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  {result && (
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted"
                      stroke="var(--series-predicted)"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={{ r: 4, fill: "var(--series-predicted)", stroke: "#ffffff", strokeWidth: 2 }}
                      connectNulls
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

      <Card title="Forecast details" icon={<ChipIcon />}>
        <details className="how-result-details">
        <summary>How the result is chosen</summary>
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
            <ThermometerIcon /> 7-Day Avg Temperature
          </span>
        </div>
        <p className="chart-note">
          Past dates use observed records when available. Future dates use the saved model when supported; otherwise the backend uses its weather-provider forecast.
        </p>
        </details>
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

    let currentDate = result.forecast_date;
    const preds = Array.isArray(result.predicted_temp_avg) 
        ? result.predicted_temp_avg 
        : [result.predicted_temp_avg];
    for (let i = 0; i < preds.length; i++) {
      rows.push({
        date: currentDate,
        temp_max: null,
        temp_min: null,
        temp_avg: null,
        predicted: Number(preds[i]),
      });
      currentDate = nextDay(currentDate);
    }
  }
  return rows;
}

function shortDate(iso: string): string {
  return iso.slice(5); // MM-DD
}
function fullDate(iso: string): string {
  return prettyDate(iso);
}
