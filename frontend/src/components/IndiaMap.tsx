import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  GeoJSON,
  TileLayer,
  LayersControl,
  ZoomControl,
  AttributionControl,
  Marker,
  Popup,
  FeatureGroup,
  useMap,
} from "react-leaflet";
import type { GeoJSON as LeafletGeoJSON, PathOptions, Layer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getForecastAll } from "../services/api";
import { fetchAllCityWeather, searchIndianCityWeather, type CityWeather } from "../services/cityWeather";
import { ErrorBanner } from "./ui";

export type OverlayMetric = "temperature" | "humidity" | "rainfall" | "wind";

export interface IndiaMapProps {
  onSelectState?: (state: string) => void;
  selectedState?: string;
  overlayMetric?: OverlayMetric;
  onOverlayMetricChange?: (metric: OverlayMetric) => void;
  forecastDay?: number;
  onForecastDayChange?: (day: number) => void;
  height?: string | number;
}

export function normalizeStateName(raw: string): string {
  const s = raw.trim();
  if (s === "Dadra & Nagar Haveli" || s === "Daman & Diu") {
    return "Dadra And Nagar Haveli And Daman And Diu";
  }
  if (s === "Jammu & Kashmir") return "Jammu And Kashmir";
  if (s === "Andaman & Nicobar") return "Andaman And Nicobar";
  return s.replace("&", "And");
}

/* ── Meteorological Color Scale Functions ── */

export function getTempColor(temp: number | undefined): string {
  if (temp === undefined) return "#94a3b8";
  if (temp < 15) return "#3b82f6";
  if (temp < 20) return "#06b6d4";
  if (temp < 25) return "#10b981";
  if (temp < 30) return "#f59e0b";
  if (temp < 35) return "#f97316";
  return "#ef4444";
}

export function getHumidityColor(humidity: number | undefined): string {
  if (humidity === undefined) return "#94a3b8";
  if (humidity < 40) return "#f59e0b";
  if (humidity < 60) return "#10b981";
  if (humidity < 75) return "#06b6d4";
  if (humidity < 85) return "#3b82f6";
  return "#6366f1";
}

export function getRainfallEstimate(weatherCode: number): number {
  if ([51, 53].includes(weatherCode)) return 1.2;
  if ([55, 56, 57].includes(weatherCode)) return 3.5;
  if ([61, 80].includes(weatherCode)) return 4.0;
  if ([63, 81].includes(weatherCode)) return 9.5;
  if ([65, 82].includes(weatherCode)) return 18.0;
  if ([95, 96, 99].includes(weatherCode)) return 28.0;
  return 0.0;
}

export function getRainfallColor(rainfall: number | undefined): string {
  if (rainfall === undefined || rainfall === 0) return "#94a3b8";
  if (rainfall <= 2.5) return "#38bdf8";
  if (rainfall <= 10.0) return "#0284c7";
  if (rainfall <= 25.0) return "#2563eb";
  return "#7c3aed";
}

export function getWindColor(windSpeed: number | undefined): string {
  if (windSpeed === undefined) return "#94a3b8";
  if (windSpeed < 10) return "#10b981";
  if (windSpeed < 20) return "#06b6d4";
  if (windSpeed < 35) return "#f59e0b";
  if (windSpeed < 50) return "#f97316";
  return "#ef4444";
}

/* ── Tile layer definitions ── */
const TILE_LAYERS = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17,
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
};

export const METRIC_CONFIGS: Record<
  OverlayMetric,
  { label: string; unit: string; icon: string; bands: { color: string; label: string }[] }
> = {
  temperature: {
    label: "Temperature",
    unit: "°C",
    icon: "🌡️",
    bands: [
      { color: "#3b82f6", label: "< 15°C" },
      { color: "#06b6d4", label: "15–20°C" },
      { color: "#10b981", label: "20–25°C" },
      { color: "#f59e0b", label: "25–30°C" },
      { color: "#f97316", label: "30–35°C" },
      { color: "#ef4444", label: "> 35°C" },
    ],
  },
  humidity: {
    label: "Relative Humidity",
    unit: "%",
    icon: "💧",
    bands: [
      { color: "#f59e0b", label: "< 40%" },
      { color: "#10b981", label: "40–60%" },
      { color: "#06b6d4", label: "60–75%" },
      { color: "#3b82f6", label: "75–85%" },
      { color: "#6366f1", label: "> 85%" },
    ],
  },
  rainfall: {
    label: "Rainfall",
    unit: "mm",
    icon: "🌧️",
    bands: [
      { color: "#94a3b8", label: "0 mm" },
      { color: "#38bdf8", label: "0.1–2.5 mm" },
      { color: "#0284c7", label: "2.5–10 mm" },
      { color: "#2563eb", label: "10–25 mm" },
      { color: "#7c3aed", label: "> 25 mm" },
    ],
  },
  wind: {
    label: "Wind Speed",
    unit: "km/h",
    icon: "💨",
    bands: [
      { color: "#10b981", label: "< 10 km/h" },
      { color: "#06b6d4", label: "10–20 km/h" },
      { color: "#f59e0b", label: "20–35 km/h" },
      { color: "#f97316", label: "35–50 km/h" },
      { color: "#ef4444", label: "> 50 km/h" },
    ],
  },
};

/** Creates a Leaflet DivIcon showing active overlay metric + emoji for a city */
function createCityIcon(weather: CityWeather, metric: OverlayMetric): L.DivIcon {
  let displayVal = `${weather.temperature.toFixed(0)}°C`;
  let metricColor = getTempColor(weather.temperature);

  if (metric === "humidity") {
    displayVal = `${weather.humidity.toFixed(0)}%`;
    metricColor = getHumidityColor(weather.humidity);
  } else if (metric === "rainfall") {
    const rain = getRainfallEstimate(weather.weatherCode);
    displayVal = `${rain.toFixed(1)}mm`;
    metricColor = getRainfallColor(rain);
  } else if (metric === "wind") {
    displayVal = `${weather.windSpeed.toFixed(0)}km/h`;
    metricColor = getWindColor(weather.windSpeed);
  }

  return L.divIcon({
    className: "city-weather-marker",
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
        pointer-events: auto;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25));
      ">
        <div style="
          background: #ffffff;
          border: 2px solid ${metricColor};
          border-radius: 10px;
          padding: 3px 7px;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ">
          <span style="font-size: 13px;">${weather.emoji}</span>
          <span style="
            font-size: 11.5px;
            font-weight: 800;
            color: ${metricColor};
            line-height: 1;
            font-variant-numeric: tabular-nums;
          ">${displayVal}</span>
        </div>
        <div style="
          width: 0; height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid ${metricColor};
          margin-top: -1px;
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -36],
  });
}

/** Helper component to fly the map smoothly to searched city */
function MapFlyToController({ flyTarget }: { flyTarget: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (flyTarget) {
      map.flyTo(flyTarget, 8, { duration: 1.2 });
    }
  }, [flyTarget, map]);
  return null;
}

export function IndiaMap({
  onSelectState,
  selectedState,
  overlayMetric = "temperature",
  onOverlayMetricChange,
  forecastDay = 1,
  onForecastDayChange,
  height,
}: IndiaMapProps) {
  const [geoData, setGeoData] = useState<any>(null);
  const [forecasts, setForecasts] = useState<Record<string, number>>({});
  const [cityWeather, setCityWeather] = useState<CityWeather[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [cityLoading, setCityLoading] = useState<boolean>(true);
  const [cityLoadMessage, setCityLoadMessage] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [citySearchMessage, setCitySearchMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);

  const geoJsonRef = useRef<LeafletGeoJSON | null>(null);

  // Fetch GeoJSON boundaries
  useEffect(() => {
    fetch("/india_states.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load India boundaries GeoJSON");
        return res.json();
      })
      .then((data) => setGeoData(data))
      .catch((err) => setError(err.message));
  }, []);

  // Fetch forecasts for all states for the chosen horizon day
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function loadForecasts() {
      try {
        const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";
        const res = await fetch(`${BASE_URL}/forecast/all?day=${forecastDay}`);
        if (res.ok) {
          const data = (await res.json()) as Record<string, number>;
          if (!cancelled) {
            setForecasts(data);
            setError(null);
          }
          return;
        }
      } catch {
        // Fall back to central API client
      }

      try {
        const fallbackData = await getForecastAll(forecastDay);
        if (!cancelled) {
          setForecasts(fallbackData);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load forecast data for map:", err);
          setError("Failed to load all-state forecasts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadForecasts();
    return () => {
      cancelled = true;
    };
  }, [forecastDay]);

  // Fetch live city weather from Open-Meteo
  useEffect(() => {
    setCityLoading(true);
    fetchAllCityWeather()
      .then(({ cities, failedChunks, totalChunks }) => {
        setCityWeather(cities);
        setCityLoadMessage(
          failedChunks > 0
            ? `Live weather unavailable for ${failedChunks} of ${totalChunks} city batches; showing ${cities.length} cities.`
            : null
        );
        setLastUpdated(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
      })
      .catch((err: unknown) => {
        setCityWeather([]);
        setCityLoadMessage(
          err instanceof Error
            ? err.message
            : "Live city weather is temporarily unavailable from Open-Meteo."
        );
      })
      .finally(() => setCityLoading(false));
  }, []);

  // Compute state-level aggregate averages for non-temperature overlays
  const stateAverages = useMemo(() => {
    const map: Record<string, { humidity: number; rainfall: number; wind: number; count: number }> = {};
    for (const cw of cityWeather) {
      const stateName = normalizeStateName(cw.city.state);
      if (!map[stateName]) {
        map[stateName] = { humidity: 0, rainfall: 0, wind: 0, count: 0 };
      }
      map[stateName].humidity += cw.humidity;
      map[stateName].rainfall += getRainfallEstimate(cw.weatherCode);
      map[stateName].wind += cw.windSpeed;
      map[stateName].count += 1;
    }
    const result: Record<string, { humidity: number; rainfall: number; wind: number }> = {};
    for (const [st, agg] of Object.entries(map)) {
      if (agg.count > 0) {
        result[st] = {
          humidity: agg.humidity / agg.count,
          rainfall: agg.rainfall / agg.count,
          wind: agg.wind / agg.count,
        };
      }
    }
    return result;
  }, [cityWeather]);

  async function searchCity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = cityQuery.trim().toLowerCase();
    if (!query) return;

    setCitySearchLoading(true);
    setCitySearchMessage(null);

    // 1. Check local loaded cities first
    const localMatch = cityWeather.find(
      (c) => c.city.name.toLowerCase() === query || c.city.name.toLowerCase().includes(query)
    );

    if (localMatch) {
      setFlyTarget([localMatch.city.lat, localMatch.city.lng]);
      if (onSelectState) onSelectState(localMatch.city.state);
      setCitySearchMessage(`Centered on ${localMatch.city.name}, ${localMatch.city.state}`);
      setCitySearchLoading(false);
      return;
    }

    // 2. Query Open-Meteo Indian geocoding
    try {
      const matches = await searchIndianCityWeather(cityQuery);
      if (matches.length === 0) {
        setCitySearchMessage("No Indian city found for that search query.");
        return;
      }

      setCityWeather((existing) => {
        const byLocation = new Map(existing.map((item) => [`${item.city.name}|${item.city.state}`, item]));
        matches.forEach((item) => byLocation.set(`${item.city.name}|${item.city.state}`, item));
        return [...byLocation.values()];
      });

      const first = matches[0];
      setFlyTarget([first.city.lat, first.city.lng]);
      if (onSelectState) onSelectState(first.city.state);
      setCitySearchMessage(`Found ${first.city.name}, ${first.city.state} — centered on map.`);
    } catch (searchError) {
      setCitySearchMessage(searchError instanceof Error ? searchError.message : "City search failed. Please try again.");
    } finally {
      setCitySearchLoading(false);
    }
  }

  function getFeatureMetricDetails(stateName: string): { valueDisplay: string; color: string; label: string } {
    if (overlayMetric === "temperature") {
      const temp = forecasts[stateName];
      return {
        valueDisplay: temp !== undefined ? `${temp.toFixed(1)} °C` : "No data",
        color: getTempColor(temp),
        label: `Day ${forecastDay} Forecast`,
      };
    }
    if (overlayMetric === "humidity") {
      const hum = stateAverages[stateName]?.humidity;
      return {
        valueDisplay: hum !== undefined ? `${hum.toFixed(0)} %` : "No data",
        color: getHumidityColor(hum),
        label: "Regional Avg Humidity",
      };
    }
    if (overlayMetric === "rainfall") {
      const rain = stateAverages[stateName]?.rainfall;
      return {
        valueDisplay: rain !== undefined ? `${rain.toFixed(1)} mm` : "No data",
        color: getRainfallColor(rain),
        label: "Regional Avg Rainfall",
      };
    }
    // wind
    const wind = stateAverages[stateName]?.wind;
    return {
      valueDisplay: wind !== undefined ? `${wind.toFixed(0)} km/h` : "No data",
      color: getWindColor(wind),
      label: "Regional Avg Wind Speed",
    };
  }

  function styleFeature(feature: any): PathOptions {
    if (!feature) return {};
    const rawName = feature.properties?.STNAME_SH || feature.properties?.STNAME || "";
    const stateName = normalizeStateName(rawName);
    const details = getFeatureMetricDetails(stateName);
    const isSelected = selectedState && selectedState.toLowerCase() === stateName.toLowerCase();

    return {
      fillColor: details.color,
      weight: isSelected ? 3 : 1.5,
      opacity: 1,
      color: isSelected ? "#2563eb" : "rgba(255,255,255,0.85)",
      fillOpacity: isSelected ? 0.75 : 0.45,
    };
  }

  function onEachFeature(feature: any, layer: Layer) {
    const rawName = feature.properties?.STNAME_SH || feature.properties?.STNAME || "";
    const stateName = normalizeStateName(rawName);
    const details = getFeatureMetricDetails(stateName);

    layer.bindTooltip(
      `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.5; min-width: 150px;">
        <div style="font-weight: 800; color: #0f172a; font-size: 14px; margin-bottom: 2px;">${stateName}</div>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">${details.label}</div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: 800; font-size: 16px; color: ${details.color};">${details.valueDisplay}</span>
        </div>
        <div style="font-size: 11px; color: #2563eb; margin-top: 4px; font-weight: 600;">Click to inspect state telemetry →</div>
      </div>`,
      { sticky: true, direction: "auto", className: "map-tooltip" }
    );

    layer.on({
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({
          weight: 3,
          color: "#3b82f6",
          fillOpacity: 0.72,
        });
        target.bringToFront();
      },
      mouseout: (e) => {
        if (geoJsonRef.current) {
          geoJsonRef.current.resetStyle(e.target);
        }
      },
      click: () => {
        if (onSelectState && stateName) {
          onSelectState(stateName);
        }
      },
    });
  }

  const activeMetricConfig = METRIC_CONFIGS[overlayMetric];

  return (
    <div className="map-shell-container" style={{ position: "relative", width: "100%" }}>
      {/* Loading overlay badge */}
      {(loading || cityLoading) && (
        <div
          style={{
            position: "absolute",
            zIndex: 1000,
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(15, 23, 42, 0.94)",
            borderRadius: 8,
            padding: "8px 16px",
            boxShadow: "var(--shadow-md)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#ffffff",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <span className="spinner" style={{ borderTopColor: "#38bdf8", width: 14, height: 14 }} />
          {cityLoading ? "Syncing live city telemetry…" : `Loading Day ${forecastDay} state forecasts…`}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* Top Map Toolbar */}
      <div className="map-toolbar-bar">
        {/* Metric overlay selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Overlay:
          </span>
          {(["temperature", "humidity", "rainfall", "wind"] as OverlayMetric[]).map((m) => {
            const conf = METRIC_CONFIGS[m];
            const isActive = overlayMetric === m;
            return (
              <button
                key={m}
                type="button"
                className={isActive ? "btn-primary" : "btn-secondary"}
                onClick={() => onOverlayMetricChange?.(m)}
                style={{ padding: "4px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <span>{conf.icon}</span>
                <span>{conf.label}</span>
                <span style={{ opacity: 0.75, fontSize: 11 }}>({conf.unit})</span>
              </button>
            );
          })}
        </div>

        {/* Day horizon selector (1 to 7) for multi-output forecast */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Horizon:
          </span>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const isActive = forecastDay === d;
            return (
              <button
                key={d}
                type="button"
                className={isActive ? "btn-primary" : "btn-secondary"}
                onClick={() => onForecastDayChange?.(d)}
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  minWidth: 32,
                  textAlign: "center",
                }}
                title={`Forecast Day ${d}`}
              >
                D{d}
              </button>
            );
          })}
        </div>

        {/* City search input */}
        <form onSubmit={searchCity} className="field inline" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="search"
            value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder="Search city (e.g. Pune)..."
            style={{
              padding: "5px 10px",
              fontSize: 12,
              width: 175,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-strong)",
            }}
          />
          <button
            type="submit"
            className="btn-secondary"
            disabled={citySearchLoading || !cityQuery.trim()}
            style={{ padding: "5px 10px", fontSize: 12 }}
          >
            {citySearchLoading ? "..." : "Find"}
          </button>
        </form>
      </div>

      {citySearchMessage && (
        <div
          role="status"
          style={{
            padding: "4px 14px",
            fontSize: 11.5,
            background: "var(--accent-subtle)",
            color: "var(--accent)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {citySearchMessage}
        </div>
      )}

      {/* Leaflet Map Canvas */}
      {geoData && (
        <MapContainer
          center={[22.5, 82.0]}
          zoom={5}
          minZoom={4}
          maxZoom={14}
          maxBounds={[
            [4.0, 65.0],
            [38.0, 100.0],
          ]}
          scrollWheelZoom={true}
          zoomControl={false}
          attributionControl={false}
          style={{
            height: height || "640px",
            width: "100%",
            background: "#0c1322",
          }}
        >
          <MapFlyToController flyTarget={flyTarget} />
          <ZoomControl position="topright" />
          <AttributionControl position="bottomright" />

          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="🗺️ Street Map">
              <TileLayer
                url={TILE_LAYERS.street.url}
                attribution={TILE_LAYERS.street.attribution}
                maxZoom={TILE_LAYERS.street.maxZoom}
              />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer name="🛰️ Satellite">
              <TileLayer
                url={TILE_LAYERS.satellite.url}
                attribution={TILE_LAYERS.satellite.attribution}
                maxZoom={TILE_LAYERS.satellite.maxZoom}
              />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer name="🏔️ Terrain">
              <TileLayer
                url={TILE_LAYERS.terrain.url}
                attribution={TILE_LAYERS.terrain.attribution}
                maxZoom={TILE_LAYERS.terrain.maxZoom}
              />
            </LayersControl.BaseLayer>

            <LayersControl.BaseLayer name="🌙 Dark Mode">
              <TileLayer
                url={TILE_LAYERS.dark.url}
                attribution={TILE_LAYERS.dark.attribution}
                maxZoom={TILE_LAYERS.dark.maxZoom}
              />
            </LayersControl.BaseLayer>

            {/* State boundary choropleth */}
            <LayersControl.Overlay checked name="🗺️ State Boundary Choropleth">
              <GeoJSON
                ref={geoJsonRef}
                key={`${overlayMetric}-${forecastDay}-${JSON.stringify(forecasts).length}-${selectedState || ""}`}
                data={geoData}
                style={styleFeature}
                onEachFeature={onEachFeature}
              />
            </LayersControl.Overlay>

            {/* Live city markers */}
            <LayersControl.Overlay checked name="🏙️ Live City Telemetry Markers">
              <CityMarkers
                cities={cityWeather}
                metric={overlayMetric}
                onSelectState={onSelectState}
              />
            </LayersControl.Overlay>
          </LayersControl>
        </MapContainer>
      )}

      {/* Dynamic Legend Bar */}
      <div className="map-legend-bar">
        <span style={{ fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 11 }}>
          {activeMetricConfig.label} Legend ({activeMetricConfig.unit}):
        </span>

        {activeMetricConfig.bands.map((band) => (
          <span key={band.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span className="legend-swatch" style={{ background: band.color, boxShadow: "0 0 0 1px rgba(0,0,0,0.12)" }} />
            <span>{band.label}</span>
          </span>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, color: "var(--text-muted)", fontSize: 11.5 }}>
          {lastUpdated && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              🔴 Live Sync · {lastUpdated}
            </span>
          )}
          <span>
            {cityLoadMessage ?? `${cityWeather.length} Monitored Cities`} ·{" "}
            {overlayMetric === "temperature"
              ? `Choropleth: Day ${forecastDay} LightGBM Multi-Output Forecast`
              : "Choropleth: Regional Aggregated Observations"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Renders city markers with overlay metric adaptation and rich popups */
function CityMarkers({
  cities,
  metric,
  onSelectState,
}: {
  cities: CityWeather[];
  metric: OverlayMetric;
  onSelectState?: (state: string) => void;
}) {
  if (cities.length === 0) return null;

  return (
    <FeatureGroup>
      {cities.map((cw) => {
        const rainEst = getRainfallEstimate(cw.weatherCode);
        return (
          <Marker
            key={`${cw.city.name}|${cw.city.state}`}
            position={[cw.city.lat, cw.city.lng]}
            icon={createCityIcon(cw, metric)}
          >
            <Popup>
              <div
                style={{
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  minWidth: 230,
                  padding: "4px 2px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", lineHeight: 1.2 }}>
                      {cw.city.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                      {cw.city.state}
                    </div>
                  </div>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{cw.emoji}</div>
                </div>

                <div
                  style={{
                    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    color: "#ffffff",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>
                    {metric === "temperature"
                      ? `${cw.temperature.toFixed(1)}°C`
                      : metric === "humidity"
                      ? `${cw.humidity.toFixed(0)}%`
                      : metric === "rainfall"
                      ? `${rainEst.toFixed(1)} mm`
                      : `${cw.windSpeed.toFixed(0)} km/h`}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#38bdf8", fontWeight: 600, marginTop: 4 }}>
                    {cw.description}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px" }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>Temp</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{cw.temperature.toFixed(1)}°C</div>
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px" }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>Humidity</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{cw.humidity}%</div>
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px" }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>Wind</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{cw.windSpeed.toFixed(0)} km/h</div>
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px" }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>Rain Est.</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{rainEst.toFixed(1)} mm</div>
                  </div>
                </div>

                {onSelectState && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onSelectState(cw.city.state)}
                    style={{ width: "100%", padding: "5px 8px", fontSize: 11.5, fontWeight: 600 }}
                  >
                    Select {cw.city.state} Telemetry →
                  </button>
                )}

                <div style={{ marginTop: 6, fontSize: 10, color: "#94a3b8", textAlign: "center" }}>
                  Live Open-Meteo observation · {cw.isDay ? "☀️ Daytime" : "🌙 Nighttime"}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </FeatureGroup>
  );
}
