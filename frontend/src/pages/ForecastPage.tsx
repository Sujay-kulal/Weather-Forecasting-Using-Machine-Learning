import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ApiError,
  getLocationWeather,
  searchLocations,
} from "../services/api";
import { Card, EmptyNote, ErrorBanner, PageHead, Spinner, StatChip } from "../components/ui";
import {
  ChipIcon,
  CloudSunIcon,
  DatabaseIcon,
  DropletIcon,
  GaugeIcon,
  LocationPinIcon,
  MapIcon,
  RainIcon,
  SlidersIcon,
  SparkIcon,
  SunIcon,
  ThermometerIcon,
} from "../components/icons";
import type { IndiaMapProps } from "../components/IndiaMap";
import type { LocationOption, LocationWeatherResponse } from "../types/api";

const IndiaMap = lazy(() =>
  import("../components/IndiaMap").then((module) => ({ default: module.IndiaMap })),
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

function indiaToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function indiaTomorrow(): string {
  const [year, month, day] = indiaToday().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDayName(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
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

function locationLabel(location: LocationOption): string {
  return [location.name, location.district, location.state, location.country]
    .filter(Boolean)
    .join(", ");
}

export function ForecastPage({
  selectedState,
  onSelectState,
}: {
  selectedState?: string;
  onSelectState?: (state: string) => void;
} = {}) {
  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [forecastDate, setForecastDate] = useState(indiaTomorrow);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LocationWeatherResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const resultCardRef = useRef<HTMLDivElement>(null);

  // A state selected from the map is placed into the real geocoder search;
  // it is never converted into guessed coordinates in the browser.
  useEffect(() => {
    if (
      selectedState
      && selectedState !== selectedLocation?.state
      && selectedState !== locationQuery
    ) {
      setLocationQuery(selectedState);
      setSelectedLocation(null);
      setResult(null);
      setLookupError(null);
    }
  }, [selectedState, selectedLocation?.state, locationQuery]);

  // Debounce autocomplete and ignore stale responses while the person types.
  useEffect(() => {
    const query = locationQuery.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      searchLocations(query)
        .then((response) => {
          if (!cancelled) setSuggestions(response.locations);
        })
        .catch((error: ApiError) => {
          if (!cancelled) {
            setSuggestions([]);
            setSearchError(error.message);
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [locationQuery]);

  const canSubmit = Boolean(selectedLocation && forecastDate);

  useEffect(() => {
    if (!submitting && (result || lookupError)) {
      resultCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result, lookupError, submitting]);

  function chooseLocation(location: LocationOption) {
    setSelectedLocation(location);
    setLocationQuery(location.name);
    setSuggestions([]);
    setSearchError(null);
    setResult(null);
    setLookupError(null);
    onSelectState?.(location.state);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedLocation || !forecastDate) return;
    setSubmitting(true);
    setLookupError(null);
    setResult(null);
    try {
      setResult(await getLocationWeather(selectedLocation, forecastDate));
    } catch (error) {
      const apiError = error as ApiError;
      setLookupError(apiError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const sourceClass = result?.source === "ML Prediction" ? "ml" : "provider";
  const shownState = selectedLocation?.state || selectedState;

  return (
    <div className="page">
      <PageHead
        title="Weather Search"
        desc="Search any Indian city, town, district, or state. Future forecasts use the saved ML model with fresh matching history, then the state's recent history when location data is incomplete; Open-Meteo is used when the model cannot forecast."
      />

      <div className="forecast-grid">
        <Card title="Find Weather" icon={<LocationPinIcon />}>
          <form onSubmit={onSubmit} className="forecast-form">
            <label className="field">
              <span>
                <span className="step-number" aria-hidden="true">1</span> Search location in India
              </span>
              <div className="location-autocomplete">
                <input
                  type="text"
                  value={locationQuery}
                  onChange={(event) => {
                    setLocationQuery(event.target.value);
                    setSelectedLocation(null);
                    setResult(null);
                    setLookupError(null);
                  }}
                  placeholder="Try Bengaluru, Udupi, Kerala, or Pune"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={suggestions.length > 0}
                  aria-controls="location-suggestions"
                  aria-autocomplete="list"
                />
                {searching && <div className="autocomplete-loading"><Spinner label="Searching locations…" /></div>}
                {!searching && locationQuery.trim().length >= 2 && !searchError && suggestions.length === 0 && (
                  <small className="hint">No matching Indian locations. Try a city, district, or state name.</small>
                )}
                {!searching && suggestions.length > 0 && (
                  <ul id="location-suggestions" className="location-suggestions" role="listbox">
                    {suggestions.map((location) => (
                      <li key={`${location.name}-${location.district}-${location.state}-${location.latitude}-${location.longitude}`} role="option" aria-selected={false}>
                        <button type="button" onClick={() => chooseLocation(location)}>
                          <strong>{location.name}</strong>
                          <span>{[location.district, location.state, location.country].filter(Boolean).join(" · ")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <small className="hint">Choose one result so duplicate names retain their district, state, and exact coordinates.</small>
            </label>

            {searchError && <ErrorBanner message={searchError} />}

            {selectedLocation && (
              <div className="selected-location" role="status">
                <LocationPinIcon />
                <div>
                  <strong>{locationLabel(selectedLocation)}</strong>
                  <span>
                    Selected coordinates: {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}
                  </span>
                </div>
              </div>
            )}

            <label className="field">
              <span>
                <span className="step-number" aria-hidden="true">2</span> Date
              </span>
              <input
                type="date"
                value={forecastDate}
                onChange={(event) => setForecastDate(event.target.value)}
                required
              />
              <small className="hint">Past dates return historical data; today returns current conditions; future dates use the saved ML model when recent history is available, then fall back to Open-Meteo.</small>
            </label>

            <button className="btn-primary" type="submit" disabled={submitting || !canSubmit}>
              <SparkIcon />
              {submitting ? "Getting weather…" : "Get Weather"}
            </button>
          </form>
        </Card>

        <div ref={resultCardRef} className="weather-result-anchor">
        <Card title="Weather Result" icon={<ThermometerIcon />}>
          {submitting && <Spinner label="Getting weather from the best available source…" />}
          {!submitting && lookupError && <ErrorBanner message={lookupError} />}
          {!submitting && !lookupError && !result && (
            <EmptyNote
              title="No weather result yet"
              hint="Search for a location, choose a specific result, select a date, then get weather."
            />
          )}
          {!submitting && result && (
            <div className="result">
              <div className="result-hero">
                <CloudSunIcon className="hero-icon" />
                <div className="result-label">{result.source}</div>
                <span className={`weather-source-badge ${sourceClass}`}>{result.source}</span>
                <div className="result-value">{result.temperature.toFixed(1)}°</div>
                <div className="result-sub">
                  for {locationLabel(result.location)} on {prettyDate(result.forecast_date)}
                </div>
                {result.weather_description && <div className="result-delta">{result.weather_description}</div>}
                {result.last_known && (
                  <div className="result-delta">
                    Latest ML input: {result.last_known.date} · {result.last_known.temp_avg.toFixed(1)} °C
                  </div>
                )}

                {result.forecast.length > 1 && (
                  <div className="day-forecast-grid" style={{ margin: "16px 0 0" }}>
                    {result.forecast.map((day) => (
                      <div key={day.date} className="day-forecast-card" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}>
                        <div className="day-label" style={{ color: "rgba(255,255,255,0.7)" }}>{shortDayName(day.date)}</div>
                        <div style={{ fontSize: 22, lineHeight: 1 }}>{getWeatherEmoji(day.temperature)}</div>
                        <div className="day-temp" style={{ color: "#fff" }}>{day.temperature.toFixed(1)}°</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(result.temperature_min != null || result.temperature_max != null || result.humidity != null || result.rainfall != null || result.wind_speed != null) && (
                <div className="stat-chips" style={{ marginTop: 16 }}>
                  {result.temperature_min != null && result.temperature_max != null && (
                    <StatChip icon={<GaugeIcon />} label="Temperature range" value={`${result.temperature_min.toFixed(1)}° – ${result.temperature_max.toFixed(1)}°`} />
                  )}
                  {result.humidity != null && <StatChip icon={<DropletIcon />} label="Humidity" value={`${result.humidity.toFixed(0)}%`} />}
                  {result.rainfall != null && <StatChip icon={<RainIcon />} label="Rainfall" value={`${result.rainfall.toFixed(1)} mm`} />}
                  {result.wind_speed != null && <StatChip icon={<SunIcon />} label="Wind speed" value={`${result.wind_speed.toFixed(1)} km/h`} />}
                </div>
              )}

              <dl className="result-meta" style={{ marginTop: 16 }}>
                <div><dt>Location</dt><dd>{result.location.name}</dd></div>
                {result.location.district && <div><dt>District</dt><dd>{result.location.district}</dd></div>}
                <div><dt>State / UT</dt><dd>{result.location.state}</dd></div>
                <div><dt>Date</dt><dd>{result.forecast_date}</dd></div>
                <div><dt>Data source</dt><dd>{result.source}</dd></div>
                {result.model && <div><dt>Model</dt><dd>{result.model}</dd></div>}
              </dl>
              {result.message && <p className="chart-note">{result.message}</p>}
            </div>
          )}
        </Card>
        </div>
      </div>

      <Card
        title="India Temperature Forecast Map"
        icon={<MapIcon />}
        subtitle="The map remains a separate state/UT-level ML layer. Selecting a state puts its name into the location search; choose a geocoded result before requesting weather."
      >
        <DeferredIndiaMap
          selectedState={shownState}
          forecastDate={forecastDate}
          onSelectState={(state) => {
            setLocationQuery(state);
            setSelectedLocation(null);
            setResult(null);
            setLookupError(null);
            onSelectState?.(state);
          }}
          height="540px"
        />
      </Card>

      <Card title="How the Result Is Chosen" icon={<ChipIcon />}>
        <div className="pipeline" aria-label="weather source selection">
          <span className="pipeline-step"><LocationPinIcon /> Selected India location</span>
          <span className="arrow" aria-hidden="true">→</span>
          <span className="pipeline-step"><DatabaseIcon /> Exact matching history</span>
          <span className="arrow" aria-hidden="true">→</span>
          <span className="pipeline-step"><SlidersIcon /> ML when supported</span>
          <span className="arrow" aria-hidden="true">→</span>
          <span className="pipeline-step"><CloudSunIcon /> Open-Meteo fallback</span>
        </div>
        <p className="chart-note">
          The backend keeps the saved model’s existing feature contract unchanged. It never turns a city search into a state-average ML result: without an exact matching history, it calls Open-Meteo with the coordinates you selected and labels that result as API weather.
        </p>
        <p className="chart-note">
          Historical location catalog: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (CC BY 3.0). Historical reanalysis data: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0).
        </p>
      </Card>
    </div>
  );
}
