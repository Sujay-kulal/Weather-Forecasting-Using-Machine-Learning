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
import type { DayForecast, PredictionResponse } from "../types/api";

function rainfallAmount(day: DayForecast) {
  return day.ml_rainfall_mm == null ? "Unavailable" : `${day.ml_rainfall_mm.toFixed(2)} mm`;
}

function rainChance(day: DayForecast) {
  return day.ml_rain_probability == null ? "Unavailable" : `${(100 * day.ml_rain_probability).toFixed(0)}%`;
}

const rainStatus = {
  available: "Rainfall amounts and available probabilities use the evaluated rainfall model.",
  amount_withheld: "Rainfall amounts are withheld because the model missed the release target.",
  research_preview: "Research preview · Rainfall amounts missed the release target on independent testing.",
  model_unavailable: "The rainfall model is unavailable.",
  inference_error: "The rainfall model could not calculate this forecast.",
};

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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

export interface ForecastPageProps {
  selectedState?: string;
  onSelectState?: (state: string) => void;
}

export function ForecastPage({ selectedState, onSelectState }: ForecastPageProps = {}) {
  const states = useFetch(getStates, []);
  const [state, setState] = useState(selectedState || "");
  const [date, setDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    if (selectedState && selectedState !== state) {
      setState(selectedState);
      setDateTouched(false);
      setResult(null);
      setPredictError(null);
      setSelectedDayIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState]);

  // Recent 30 records for the selected state
  const recent = useFetch(
    () => (state ? getRecentWeather(state, 30) : Promise.resolve(null)),
    [state]
  );

  const recentRecords = recent.data?.state === state ? recent.data.records : [];
  const latest = recentRecords.length > 0 ? recentRecords[recentRecords.length - 1] : null;

  const latestDate = latest?.date;
  useEffect(() => {
    if (!dateTouched) setDate(latestDate ? shiftDate(latestDate, 2) : "");
  }, [latestDate, dateTouched]);

  const canSubmit = Boolean(state && date);

  async function requestPrediction() {
    if (!canSubmit) return;
    setSubmitting(true);
    setPredictError(null);
    setResult(null);
    setSelectedDayIndex(0);
    try {
      const prediction = await predict(state, date, undefined, undefined, true);
      setResult(prediction);
    } catch (err) {
      setPredictError((err as ApiError).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await requestPrediction();
  }

  const locStr = state;
  const dailyForecasts = result?.daily_forecasts ?? [];
  const currentDay = dailyForecasts[selectedDayIndex] || dailyForecasts[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHead
        title="Weather Forecast Dashboard"
        desc="Seven-day temperature and rainfall forecasts for 33 Indian states and union territories."
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
                  id="forecast-state-select"
                  name="state"
                  disabled={submitting}
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    onSelectState?.(e.target.value);
                    setDate("");
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
                  {(states.data?.model_states ?? states.data?.states ?? []).filter((s) => s !== "Other").map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="field">
              <span>
                <span>2. Forecast Target Date</span>
                <span style={{ color: "var(--danger)" }}>*</span>
              </span>
              <input
                id="forecast-target-date"
                name="targetDate"
                type="date"
                disabled={submitting}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateTouched(true);
                  setResult(null);
                  setPredictError(null);
                }}
                required
              />
              <span className="hint">
                {latest
                  ? `Latest stored day is ${latest.date}. The forecast starts two days later so the model can use that record.`
                  : "Select a state to find the latest stored weather."}
              </span>
            </label>

            <button
              className="btn-primary"
              type="submit"
              disabled={submitting || !canSubmit}
              style={{ width: "100%", marginTop: 6 }}
            >
              <SparkIcon style={{ width: 16, height: 16, flexShrink: 0 }} />
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
              <strong>Operational Scope:</strong> Forecasts include ML average temperatures and a research preview of ML rainfall amounts. Highs, lows, humidity, conditions and advisories are rule-based estimates.
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
                <span>Computing temperature and rainfall forecasts…</span>
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

          {!submitting && result && !currentDay && (
            <div>
              <p>Rule-based estimates are unavailable for this forecast.</p>
              <ol>
                {result.predicted_temp_avg.map((temp, i) => (
                  <li key={i}>{prettyDate(shiftDate(result.forecast_date, i))} · {temp.toFixed(1)} °C</li>
                ))}
              </ol>
            </div>
          )}
          {!submitting && result && currentDay && (
            <div>
              <p role="status">{rainStatus[result.rainfall_ml_status ?? "model_unavailable"]}</p>
              {/* High-Impact Enterprise Hero */}
              <div className="forecast-hero-box">
                <div className="forecast-hero-left">
                  <div className="forecast-hero-condition">
                    <span style={{ fontSize: 18 }}>{getConditionEmoji(currentDay.condition, currentDay.condition_icon)}</span>
                    <span className="condition-tag">Rule-based · {currentDay.condition}</span>
                    <span>·</span>
                    <span>Horizon Day {currentDay.day} of 7</span>
                  </div>

                  <div className="forecast-hero-sub">ML average temperature</div>
                  <div className="forecast-hero-temp">
                    {currentDay.temp_avg.toFixed(1)}
                    <span className="unit">°C</span>
                  </div>

                  <div className="forecast-hero-sub">
                    ML rainfall {rainfallAmount(currentDay)} · ML chance of more than 0.1 mm {rainChance(currentDay)}
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
                      <button
                        key={df.day}
                        type="button"
                        className={`horizon-day-card ${isSelected ? "active" : ""}`}
                        onClick={() => setSelectedDayIndex(idx)}
                        aria-pressed={isSelected}
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
                          <span>ML rain · {rainfallAmount(df)}</span>
                          <span> · Humidity estimate {df.humidity.toFixed(0)}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detailed Meteorological Parameters for Selected Day */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 8 }}>
                  Day {currentDay.day} rule-based estimates ({prettyDate(currentDay.date)})
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
                    label="Rule-based precipitation"
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
                  <dd>{result.forecast_date} to {shiftDate(result.forecast_date, 6)}</dd>
                </div>
                <div className="meta-block">
                  <dt>Model Engine</dt>
                  <dd>{result.model}</dd>
                </div>
                {result.typical_error_mae != null && (
                  <div className="meta-block">
                    <dt>Validation MAE</dt>
                    <dd>{result.typical_error_mae.toFixed(3)} °C</dd>
                  </div>
                )}
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
                  <th>Rule-based condition</th>
                  <th className="num">ML average temperature</th>
                  <th className="num">ML rainfall{result.rainfall_ml_status === "research_preview" ? " (research preview)" : ""}</th>
                  <th className="num">ML rain chance (&gt;0.1 mm)</th>
                  <th className="num">Range (Min–Max)</th>
                  <th className="num">Humidity</th>
                  <th className="num">Rule-based rain estimate</th>
                  <th className="num">Feels Like</th>
                  <th>Rule-based advisory</th>
                </tr>
              </thead>
              <tbody>
                {dailyForecasts.map((d, i) => (
                  <tr
                    key={d.day}
                    className={i === selectedDayIndex ? "highlight-row" : ""}
                  >
                    <td>
                      <button type="button" className="btn-outline" aria-pressed={i === selectedDayIndex}
                        onClick={() => setSelectedDayIndex(i)}>
                        Day {d.day} {i === 0 ? "(Start)" : ""}
                      </button>
                    </td>
                    <td>{prettyDate(d.date)}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span>{getConditionEmoji(d.condition, d.condition_icon)}</span>
                        <span>{d.condition}</span>
                      </span>
                    </td>
                    <td className="num strong">{d.temp_avg.toFixed(1)} °C</td>
                    <td className="num">{rainfallAmount(d)}</td>
                    <td className="num">{rainChance(d)}</td>
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
            ? `Stored weather for ${locStr}, with the LightGBM forecast when available.`
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
                {recentRecords.length} stored daily records{result ? ` and ${result.predicted_temp_avg.length} model predictions` : ""}.
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
  const rows = new Map<string, ChartRow>();
  for (const record of records) rows.set(record.date, { ...record, predicted: null });
  result?.predicted_temp_avg.forEach((predicted, index) => {
    const date = shiftDate(result.forecast_date, index);
    const observed = rows.get(date);
    rows.set(date, {
      date,
      temp_max: observed?.temp_max ?? null,
      temp_min: observed?.temp_min ?? null,
      temp_avg: observed?.temp_avg ?? null,
      predicted,
    });
  });
  return [...rows.values()].sort((first, second) => first.date.localeCompare(second.date));
}
