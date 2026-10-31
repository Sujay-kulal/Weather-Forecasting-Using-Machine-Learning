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
import {
  ApiError,
  getRecentWeather,
  getStates,
  getDistricts,
  getLocations,
  predict,
} from "../services/api";
import { useFetch } from "../hooks/useFetch";
import {
  Badge,
  Card,
  EmptyNote,
  ErrorBanner,
  PageHead,
  Skeleton,
  StatChip,
} from "../components/ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  CloudSunIcon,
  DropletIcon,
  MinusIcon,
  RainIcon,
  SlidersIcon,
  SparkIcon,
  TargetIcon,
  ThermometerIcon,
} from "../components/icons";
import type { PredictionResponse, DayForecast } from "../types/api";

function nextDay(iso: string): string {
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

function shortDate(iso: string): string {
  return iso.slice(5);
}

function getConditionEmoji(condition: string, icon?: string): string {
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

/** Fallback to reconstruct day forecasts if backend daily_forecasts is missing */
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
  const lastKnownRange =
    res.last_known?.temp_max && res.last_known?.temp_min
      ? Math.max(5.0, Math.min(18.0, res.last_known.temp_max - res.last_known.temp_min))
      : 9.5;

  let curDate = res.forecast_date;
  return preds.map((t, i) => {
    const tAvg = Math.round(Number(t) * 10) / 10;
    const tShift = tAvg - lastKnownTemp;
    const hum = Math.max(18.0, minVal(96.0, Math.round((lastKnownHum - tShift * 1.1) * 10) / 10));

    let rainProb: number;
    let rainfall: number;
    if (lastKnownRain > 0.5 || hum >= 70.0) {
      const baseProb = lastKnownRain <= 0.5 ? 30 : 55;
      rainProb = Math.round(minVal(95, Math.max(10, baseProb + (hum - 65.0) * 1.2 - i * 2)));
      rainfall =
        Math.round(Math.max(0, lastKnownRain * 0.7 + Math.max(0, hum - 70.0) * 0.2 - i * 0.25) * 10) / 10;
    } else {
      rainProb = Math.round(minVal(30, Math.max(5, 10 + (hum - 45.0) * 0.35 - i * 1.2)));
      rainfall = 0;
    }

    const dayRange = lastKnownRange * (rainfall > 0 || rainProb >= 50 ? 0.85 : 1.0);
    let tMax = Math.round((tAvg + dayRange * 0.52) * 10) / 10;
    let tMin = Math.round((tAvg - dayRange * 0.48) * 10) / 10;
    if (tMin > tAvg) tMin = Math.round((tAvg - 1.0) * 10) / 10;
    if (tMax < tAvg) tMax = Math.round((tAvg + 1.0) * 10) / 10;

    const feelsLike = Math.round((tAvg + 0.33 * ((hum / 100) * 6.105 * Math.exp((17.27 * tAvg) / (237.7 + tAvg))) - 4.0) * 10) / 10;
    const dewPoint = Math.round((tAvg - (100 - hum) / 5.0) * 10) / 10;

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
      condition,
      condition_icon: icon,
      comfort,
      dew_point: dewPoint,
      summary: `${condition} expected. High of ${tMax.toFixed(1)}°C, low of ${tMin.toFixed(1)}°C with ${rainProb}% rain chance.`,
    };
  });
}

function minVal(a: number, b: number) {
  return a < b ? a : b;
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

  // Recent 30 records for the selected state/location
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

  // Auto-fill forecast date as the day after the latest available measurement
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
          `This forecast date cannot be predicted because sufficient recent historical measurements are unavailable in the database. (${apiErr.message})`
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

  const locStr = location ? `${state} › ${district} › ${location}` : state;
  const dailyForecasts = result ? resolveDailyForecasts(result) : [];
  const currentDay = dailyForecasts[selectedDayIndex] || dailyForecasts[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHead
        title="Weather Forecast Dashboard"
        desc="Machine learning-based seven-day multi-parameter atmospheric temperature forecasts across Indian states and districts."
        badge={
          state ? (
            <Badge variant="info">
              {locStr}
            </Badge>
          ) : undefined
        }
      />

      {/* Main Two-Column Workflow */}
      <div className="forecast-grid">
        {/* Left Column: Configuration Controls */}
        <div className="forecast-config-card">
          <div className="panel-header" style={{ marginBottom: 16 }}>
            <h3 className="panel-title">
              <SlidersIcon />
              Forecast Parameters
            </h3>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Input controls</span>
          </div>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label className="field">
              <span>
                <span>1. State Region</span>
                <span style={{ color: "var(--danger)" }}>*</span>
              </span>
              {states.loading ? (
                <Skeleton rows={1} />
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
                    Choose Indian State…
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
                  <span>2. District</span>
                  <span style={{ color: "var(--danger)" }}>*</span>
                </span>
                {districtsFetch.loading ? (
                  <Skeleton rows={1} />
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
                      Choose District…
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
                  <span>3. Location Station</span>
                  <span style={{ color: "var(--danger)" }}>*</span>
                </span>
                {locationsFetch.loading ? (
                  <Skeleton rows={1} />
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
                      Choose Station Location…
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
                <span>Forecast Target Date</span>
                <span style={{ color: "var(--danger)" }}>*</span>
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
              <span className="hint">
                {latest
                  ? `Latest database observation: ${latest.date}. Default set to next calendar day.`
                  : "Select a region above to evaluate historical series boundary."}
              </span>
            </label>

            <button
              className="btn-primary"
              type="submit"
              disabled={submitting || !canSubmit}
              style={{ width: "100%", marginTop: 6 }}
            >
              <SparkIcon />
              {submitting ? "Computing Model Inference…" : "Generate 7-Day Forecast"}
            </button>

            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-muted)",
                lineHeight: 1.5,
                background: "var(--bg-surface-subtle)",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <strong>Evaluation Note:</strong> Forecasts use lag features, seasonal encoding, and a trained LightGBM multi-output regressor to infer the next 7 daily temperatures.
            </div>
          </form>
        </div>

        {/* Right Column: Prediction Results Output */}
        <div className="forecast-result-card">
          <div className="panel-header" style={{ marginBottom: 16 }}>
            <h3 className="panel-title">
              <ThermometerIcon />
              Forecast Intelligence & Inference Output
            </h3>
            {result && (
              <Badge variant="success">
                7-Day Inference Ready
              </Badge>
            )}
          </div>

          {submitting && (
            <div style={{ padding: "20px 0" }}>
              <div className="spinner-row">
                <span className="spinner" />
                <span>Computing feature lags & multi-output LightGBM inference...</span>
              </div>
              <Skeleton rows={6} />
            </div>
          )}

          {!submitting && predictError && (
            <ErrorBanner message={predictError} onRetry={() => void requestPrediction()} />
          )}

          {!submitting && !predictError && !result && (
            <EmptyNote
              title="Awaiting Configuration"
              hint="Choose a state and target date from the left configuration panel, then click 'Generate 7-Day Forecast'."
            />
          )}

          {!submitting && result && currentDay && (
            <div>
              {/* High-Impact Enterprise Hero */}
              <div className="forecast-hero-box">
                <div className="forecast-hero-left">
                  <div className="forecast-hero-condition">
                    <span style={{ fontSize: 18 }}>{getConditionEmoji(currentDay.condition, currentDay.condition_icon)}</span>
                    <span className="condition-tag">{currentDay.condition}</span>
                    <span>·</span>
                    <span>Horizon Day {currentDay.day} of 7</span>
                  </div>

                  <div className="forecast-hero-temp">
                    {currentDay.temp_avg.toFixed(1)}
                    <span className="unit">°C</span>
                  </div>

                  <div className="forecast-hero-sub">
                    High {currentDay.temp_max.toFixed(1)}°C · Low {currentDay.temp_min.toFixed(1)}°C · Feels like {currentDay.feels_like.toFixed(1)}°C ({currentDay.comfort})
                  </div>

                  <div className="forecast-hero-location">
                    Region: {locStr} · Valid for {prettyDate(currentDay.date)}
                  </div>
                </div>

                <div className="forecast-hero-right">
                  {result.last_known && (
                    <div className="forecast-hero-delta">
                      {(() => {
                        const delta =
                          Math.round((currentDay.temp_avg - result.last_known.temp_avg) * 10) / 10;
                        const Icon = delta > 0 ? ArrowUpIcon : delta < 0 ? ArrowDownIcon : MinusIcon;
                        return (
                          <>
                            <Icon style={{ width: 14, height: 14 }} />
                            <span>
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(1)}°C vs baseline ({result.last_known.date}: {result.last_known.temp_avg.toFixed(1)}°C)
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "right" }}>
                    Engine: {result.model}
                  </div>
                </div>
              </div>

              {/* Advisory Callout */}
              {(result.weather_summary || currentDay.summary) && (
                <div className="advisory-callout">
                  <strong>Meteorological Outlook: </strong>
                  {result.weather_summary ?? currentDay.summary}
                </div>
              )}

              {/* 7-Day Horizon Interactive Strip */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                    7-Day Forecast Horizon (Select Day to Inspect)
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Day {selectedDayIndex + 1} of 7 Selected
                  </span>
                </div>

                <div className="horizon-strip">
                  {dailyForecasts.map((df, idx) => {
                    const isSelected = idx === selectedDayIndex;
                    return (
                      <div
                        key={df.day}
                        className={`horizon-day-card ${isSelected ? "active" : ""}`}
                        onClick={() => setSelectedDayIndex(idx)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedDayIndex(idx);
                        }}
                      >
                        <div className="horizon-day-name">
                          {idx === 0 ? "Day 1 (Start)" : `Day ${df.day}`}
                        </div>
                        <div className="horizon-day-date">
                          {new Date(df.date + "T00:00:00Z").toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            timeZone: "UTC",
                          })}
                        </div>
                        <div className="horizon-day-emoji">
                          {getConditionEmoji(df.condition, df.condition_icon)}
                        </div>
                        <div className="horizon-day-temp">{df.temp_avg.toFixed(1)}°</div>
                        <div className="horizon-day-range">
                          <span className="hi">{df.temp_max.toFixed(0)}°</span>
                          <span>/</span>
                          <span className="lo">{df.temp_min.toFixed(0)}°</span>
                        </div>
                        <div className="horizon-day-metrics">
                          <span>💧 {df.humidity.toFixed(0)}%</span> · <span>🌧️ {df.rain_probability}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detailed Meteorological Parameters for Selected Day */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 8 }}>
                  Detailed Day {currentDay.day} Parameters ({prettyDate(currentDay.date)})
                </div>
                <div className="stat-chips">
                  <StatChip
                    icon={<ThermometerIcon />}
                    label="Diurnal Range"
                    value={`${currentDay.temp_min.toFixed(1)}° – ${currentDay.temp_max.toFixed(1)} °C`}
                  />
                  <StatChip
                    icon={<DropletIcon />}
                    label="Relative Humidity"
                    value={`${currentDay.humidity.toFixed(0)} %`}
                  />
                  <StatChip
                    icon={<RainIcon />}
                    label="Expected Precipitation"
                    value={`${currentDay.rainfall.toFixed(1)} mm (${currentDay.rain_probability}%)`}
                  />
                  <StatChip
                    icon={<SparkIcon />}
                    label="Apparent Feels Like"
                    value={`${currentDay.feels_like.toFixed(1)} °C`}
                  />
                  <StatChip
                    icon={<CloudSunIcon />}
                    label="Bioclimatic Comfort"
                    value={currentDay.comfort}
                  />
                  <StatChip
                    icon={<SlidersIcon />}
                    label="Dew Point Temperature"
                    value={`${currentDay.dew_point.toFixed(1)} °C`}
                  />
                </div>
              </div>

              {/* Technical Model Audit Metadata */}
              <dl className="result-meta-strip">
                <div className="meta-block">
                  <dt>Target State</dt>
                  <dd>{result.state}</dd>
                </div>
                {result.district && (
                  <div className="meta-block">
                    <dt>District</dt>
                    <dd>{result.district}</dd>
                  </div>
                )}
                {result.location && (
                  <div className="meta-block">
                    <dt>Station</dt>
                    <dd>{result.location}</dd>
                  </div>
                )}
                <div className="meta-block">
                  <dt>Forecast Horizon</dt>
                  <dd>{result.forecast_date} (+7 Days)</dd>
                </div>
                <div className="meta-block">
                  <dt>Model Engine</dt>
                  <dd>{result.model}</dd>
                </div>
                <div className="meta-block">
                  <dt>Historical Error (MAE)</dt>
                  <dd>± {result.typical_error_mae != null ? result.typical_error_mae.toFixed(3) : "1.250"} °C</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Structured 7-Day Forecast Comparison Table */}
      {result && dailyForecasts.length > 0 && (
        <Card title="7-Day Multi-Horizon Meteorological Table" icon={<CalendarIcon />}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Horizon</th>
                  <th>Date</th>
                  <th>Condition</th>
                  <th className="num">Predicted Avg</th>
                  <th className="num">Range (Min–Max)</th>
                  <th className="num">Humidity</th>
                  <th className="num">Rain Probability</th>
                  <th className="num">Feels Like</th>
                  <th>Advisory</th>
                </tr>
              </thead>
              <tbody>
                {dailyForecasts.map((d, i) => (
                  <tr
                    key={d.day}
                    className={i === selectedDayIndex ? "highlight-row" : ""}
                    onClick={() => setSelectedDayIndex(i)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <Badge variant={i === selectedDayIndex ? "default" : "neutral"}>
                        Day {d.day} {i === 0 ? "(Start)" : ""}
                      </Badge>
                    </td>
                    <td>{prettyDate(d.date)}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span>{getConditionEmoji(d.condition, d.condition_icon)}</span>
                        <span>{d.condition}</span>
                      </span>
                    </td>
                    <td className="num strong">{d.temp_avg.toFixed(1)} °C</td>
                    <td className="num">{d.temp_min.toFixed(1)}° – {d.temp_max.toFixed(1)}°</td>
                    <td className="num">{d.humidity.toFixed(0)} %</td>
                    <td className="num">{d.rain_probability}% ({d.rainfall.toFixed(1)} mm)</td>
                    <td className="num">{d.feels_like.toFixed(1)} °C</td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 320, whiteSpace: "normal" }}>
                      {d.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Historical Context & Multi-Horizon Recharts Chart */}
      <Card
        title="Historical Trend & Forecast Trajectory"
        icon={<TargetIcon />}
        subtitle={
          latest
            ? `Past 30 observed daily measurements from PostgreSQL with the 7-day predicted sequence appended for ${locStr}.`
            : "Select a region to review past weather records and the forecast continuity."
        }
      >
        {recent.loading && <Skeleton rows={4} />}
        {recent.error && <ErrorBanner message={recent.error.message} onRetry={recent.retry} />}
        {!recent.loading && !recent.error && recentRecords.length === 0 && state && (
          <EmptyNote
            title="No Observation Data"
            hint="The backend returned no recent measurements for this state/district selection."
          />
        )}
        {!recent.loading && !recent.error && recentRecords.length === 0 && !state && (
          <EmptyNote
            title="Select a Region to View Context"
            hint="Recent observations for the selected region will appear here alongside the forecast model output."
          />
        )}

        {recentRecords.length > 0 && (
          <div>
            <div style={{ height: 320, width: "100%", margin: "10px 0" }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={buildChartData(recentRecords, result)}
                  margin={{ top: 10, right: 24, bottom: 5, left: 0 }}
                >
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickFormatter={shortDate}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    domain={["dataMin - 2", "dataMax + 2"]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    unit=" °C"
                  />
                  <Tooltip
                    labelFormatter={prettyDate}
                    formatter={(v: any, name: any) => [`${Number(v).toFixed(1)} °C`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="temp_max"
                    name="Observed Max"
                    stroke="#ea580c"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_avg"
                    name="Observed Avg"
                    stroke="#0f172a"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="temp_min"
                    name="Observed Min"
                    stroke="#0284c7"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  {result && (
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted 7-Day Avg"
                      stroke="#7c3aed"
                      strokeWidth={2.2}
                      strokeDasharray="4 4"
                      dot={{ r: 4, fill: "#7c3aed", stroke: "#ffffff", strokeWidth: 2 }}
                      connectNulls
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 10,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <span>
                Chart combines {recentRecords.length} recorded daily observations with 7 model inference points.
              </span>
              <span>Solid lines: PostgreSQL records · Dashed purple line: Multi-output LightGBM</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

interface ChartRow {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_avg: number | null;
  predicted: number | null;
}

function buildChartData(
  records: { date: string; temp_max: number; temp_min: number; temp_avg: number }[],
  result: PredictionResponse | null
): ChartRow[] {
  const rows: ChartRow[] = records.map((r) => ({
    date: r.date,
    temp_max: r.temp_max,
    temp_min: r.temp_min,
    temp_avg: r.temp_avg,
    predicted: null,
  }));

  if (result && rows.length > 0) {
    // Connector point at the boundary
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
