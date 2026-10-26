import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ApiError, getRecentWeather, getStates, getDistricts, getLocations, predict } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Card, EmptyNote, ErrorBanner, PageHead, Spinner, StatChip } from "../components/ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChipIcon,
  CloudSunIcon,
  DatabaseIcon,
  DropletIcon,
  MapIcon,
  MinusIcon,
  RainIcon,
  SlidersIcon,
  SparkIcon,
  ThermometerIcon,
  SunIcon,
  GaugeIcon,
  LocationPinIcon,
} from "../components/icons";
import type { PredictionResponse } from "../types/api";
import type { IndiaMapProps } from "../components/IndiaMap";

const IndiaMap = lazy(() =>
  import("../components/IndiaMap").then((module) => ({ default: module.IndiaMap })),
);
const ForecastWeatherChart = lazy(() =>
  import("../components/ForecastWeatherChart").then((module) => ({ default: module.ForecastWeatherChart })),
);

function DeferredIndiaMap(props: IndiaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const height = props.height ?? 540;

  useEffect(() => {
    const node = containerRef.current;
    if (shouldLoad || !node) return;
    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "280px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} style={{ minHeight: height }}>
      {shouldLoad ? (
        <Suspense fallback={<div className="deferred-map-placeholder" style={{ height }} role="status">Loading the interactive map…</div>}>
          <IndiaMap {...props} />
        </Suspense>
      ) : (
        <div className="deferred-map-placeholder" style={{ height }} role="status">
          The interactive map loads as you scroll to it.
        </div>
      )}
    </div>
  );
}

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

function shortDayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
}

function getWeatherEmoji(temp: number): string {
  if (temp < 15) return "❄️";
  if (temp < 20) return "🌤";
  if (temp < 25) return "⛅";
  if (temp < 30) return "☀️";
  if (temp < 35) return "🔥";
  return "🌡️";
}

export function ForecastPage({
  selectedState,
  onSelectState,
}: {
  selectedState?: string;
  onSelectState?: (s: string) => void;
} = {}) {
  const states = useFetch(getStates, []);
  const [state, setState] = useState(selectedState || "");
  const [district, setDistrict] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [predictError, setPredictError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedState && selectedState !== state) {
      setState(selectedState);
      setDistrict("");
      setLocation("");
      setDateTouched(false);
      setResult(null);
      setPredictError(null);
    }
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

  // The latest measurement usable by this model is forecast date - 2 days.
  // Keep the default at or after today when the data feed is behind, so the
  // untouched form never proposes a forecast for a day that has passed.
  useEffect(() => {
    if (state && recentRecords.length > 0 && !dateTouched) {
      const latestUsableDate = nextDay(nextDay(recentRecords[recentRecords.length - 1].date));
      const now = new Date();
      const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      setDate(latestUsableDate < today ? today : latestUsableDate);
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
        title="Temperature Forecast"
        desc="Select a state or UT and target date. The saved LightGBM model returns seven consecutive daily average-temperature estimates from past weather observations."
      />

      <div className="forecast-grid">
        <Card title="Generate Forecast" icon={<LocationPinIcon />}>
          <form onSubmit={onSubmit} className="forecast-form">
            <label className="field">
              <span>
                <span className="step-number" aria-hidden="true">1</span> State / UT (ML forecast)
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
                  ? `Latest available measurement: ${latest.date}. Default: today or two days later, whichever is later, so the model can use this measurement.`
                  : "Select a location to see available history."}{" "}
                The backend validates the date and rejects dates without sufficient history.
              </small>
            </label>

            <button className="btn-primary" type="submit" disabled={submitting || !canSubmit}>
              <SparkIcon />
              {submitting ? "Generating forecast…" : "Generate Forecast"}
            </button>
            <small className="hint">
              Forecasts the 7-day average temperature using historical weather data.
              District and location choices appear only when that location has ML-ready historical data.
            </small>
          </form>
        </Card>

        <Card title="Prediction Result" icon={<ThermometerIcon />}>
          {submitting && <Spinner label="Generating forecast…" />}

          {!submitting && predictError && <ErrorBanner message={predictError} />}

          {!submitting && !predictError && !result && (
            <EmptyNote
              title="No forecast yet"
              hint="Select a location and a forecast date, then generate a forecast. The result will appear here with a 7-day outlook."
            />
          )}

          {!submitting && result && (
            <div className="result">
              {/* Hero temperature display */}
              <div className="result-hero">
                <CloudSunIcon className="hero-icon" />
                <div className="result-label">7-Day Predicted Average Temperature</div>

                {/* AccuWeather-style day cards */}
                <div className="day-forecast-grid" style={{ margin: '16px 0' }}>
                  {(Array.isArray(result.predicted_temp_avg) ? result.predicted_temp_avg : [result.predicted_temp_avg]).map((temp, i) => {
                    const lo = result.temp_lo && result.temp_lo[i] !== undefined ? result.temp_lo[i].toFixed(1) : null;
                    const hi = result.temp_hi && result.temp_hi[i] !== undefined ? result.temp_hi[i].toFixed(1) : null;
                    let dayDate = result.forecast_date;
                    for (let j = 0; j < i; j++) dayDate = nextDay(dayDate);
                    return (
                      <div key={i} className="day-forecast-card" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
                        <div className="day-label" style={{ color: 'rgba(255,255,255,0.7)' }}>
                          {shortDayName(dayDate)}
                        </div>
                        <div style={{ fontSize: 22, lineHeight: 1 }}>
                          {getWeatherEmoji(Number(temp))}
                        </div>
                        <div className="day-temp" style={{ color: '#fff' }}>
                          {Number(temp).toFixed(1)}°
                        </div>
                        {lo !== null && hi !== null && (
                          <div className="day-range" style={{ color: 'rgba(255,255,255,0.5)' }}>
                            {lo}° – {hi}°
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="result-sub">
                  for {result.location || result.state}
                  {result.district && result.location ? `, ${result.district}` : ""} starting on{" "}
                  {prettyDate(result.forecast_date)}
                </div>
                {result.last_known && (
                  <span className="result-delta">
                    {(() => {
                      const first_pred = Array.isArray(result.predicted_temp_avg) 
                        ? result.predicted_temp_avg[0] 
                        : result.predicted_temp_avg;
                      const delta =
                        Math.round((Number(first_pred) - result.last_known.temp_avg) * 10) /
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
                  <dd>
                    {result.typical_error_mae == null
                      ? "Not validated for this model"
                      : `± ${result.typical_error_mae.toFixed(3)} °C`}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </Card>
      </div>

      {/* Current conditions panel — AccuWeather style */}
      <Card
        title="Current Weather Context"
        icon={<SunIcon />}
        subtitle={
          latest
            ? `Latest measurements for ${locStr} — real-time data from PostgreSQL.`
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
              label={`Avg Temperature · ${latest.date}`}
              value={`${latest.temp_avg.toFixed(1)} °C`}
            />
            <StatChip
              icon={<GaugeIcon />}
              label="Day Range"
              value={`${latest.temp_min.toFixed(0)}° – ${latest.temp_max.toFixed(0)}°`}
            />
            <StatChip
              icon={<DropletIcon />}
              label="Humidity"
              value={`${latest.humidity.toFixed(0)}%`}
            />
            <StatChip
              icon={<RainIcon />}
              label="Rainfall"
              value={`${latest.rainfall.toFixed(1)} mm`}
            />
          </div>
        )}
        {recentRecords.length > 0 && (
          <Suspense fallback={<div className="chart-box chart-loading" role="status">Loading the weather chart…</div>}>
            <ForecastWeatherChart records={recentRecords} result={result} locationLabel={locStr} />
          </Suspense>
        )}
      </Card>

      <Card
        title="India Temperature Forecast Map"
        icon={<MapIcon />}
        subtitle="State/UT ML forecast overlay with a separate live-weather city layer. Click a state to view its 7-day ML forecast."
      >
        <DeferredIndiaMap
          selectedState={state}
          forecastDate={date}
          onSelectState={(s) => {
            setState(s);
            setDistrict("");
            setLocation("");
            setDateTouched(false);
            setResult(null);
            setPredictError(null);
            if (onSelectState) onSelectState(s);
          }}
          height="540px"
        />
      </Card>

      <Card title="How the Prediction Works" icon={<ChipIcon />}>
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
            <ChipIcon /> LightGBM
          </span>
          <span className="arrow" aria-hidden="true">→</span>
          <span className="pipeline-step">
            <ThermometerIcon /> 7-Day Avg Temperature
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
