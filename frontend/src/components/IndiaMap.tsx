import { useEffect, useRef, useState } from "react";
import { MapContainer, GeoJSON, TileLayer, LayersControl, ZoomControl, AttributionControl, Marker, Popup } from "react-leaflet";
import type { GeoJSON as LeafletGeoJSON, PathOptions, Layer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getForecastAll } from "../services/api";
import { fetchAllCityWeather, searchIndianCityWeather, type CityWeather } from "../services/cityWeather";
import { ErrorBanner } from "./ui";

export interface IndiaMapProps {
  onSelectState?: (state: string) => void;
  selectedState?: string;
  forecastDate?: string;
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

function getTempColor(temp: number | undefined): string {
  if (temp === undefined) return "#94a3b8";
  if (temp < 15) return "#3b82f6";
  if (temp < 20) return "#06b6d4";
  if (temp < 25) return "#10b981";
  if (temp < 30) return "#f59e0b";
  if (temp < 35) return "#f97316";
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

/** Creates a Leaflet DivIcon showing temperature + emoji for a city */
function createCityIcon(weather: CityWeather): L.DivIcon {
  const tempColor = getTempColor(weather.temperature);

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
          background: #fff;
          border: 2px solid ${tempColor};
          border-radius: 10px;
          padding: 3px 7px;
          display: flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
          font-family: 'Inter', system-ui, sans-serif;
        ">
          <span style="font-size: 13px;">${weather.emoji}</span>
          <span style="
            font-size: 12px;
            font-weight: 800;
            color: ${tempColor};
            line-height: 1;
          ">${weather.temperature.toFixed(0)}°</span>
        </div>
        <div style="
          width: 0; height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid ${tempColor};
          margin-top: -1px;
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -36],
  });
}

export function IndiaMap({ onSelectState, selectedState, forecastDate, height }: IndiaMapProps) {
  const [geoData, setGeoData] = useState<any>(null);
  const [forecasts, setForecasts] = useState<Record<string, number>>({});
  const [cityWeather, setCityWeather] = useState<CityWeather[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [cityLoading, setCityLoading] = useState<boolean>(true);
  const [cityQuery, setCityQuery] = useState("");
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [citySearchMessage, setCitySearchMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

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

  // Fetch forecasts for all states
  useEffect(() => {
    setLoading(true);
    getForecastAll(forecastDate)
      .then((data) => {
        setForecasts(data);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load forecast data for map:", err);
        setError("Failed to load all-state forecasts");
      })
      .finally(() => setLoading(false));
  }, [forecastDate]);

  // Fetch live city weather from Open-Meteo
  useEffect(() => {
    setCityLoading(true);
    fetchAllCityWeather()
      .then((data) => {
        setCityWeather(data);
        setLastUpdated(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
      })
      .catch((err) => {
        console.error("Failed to fetch city weather:", err);
      })
      .finally(() => setCityLoading(false));
  }, []);

  async function searchCity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cityQuery.trim()) return;

    setCitySearchLoading(true);
    setCitySearchMessage(null);
    try {
      const matches = await searchIndianCityWeather(cityQuery);
      if (matches.length === 0) {
        setCitySearchMessage("No Indian city found for that search.");
        return;
      }

      setCityWeather((existing) => {
        const byLocation = new Map(existing.map((item) => [`${item.city.name}|${item.city.state}`, item]));
        matches.forEach((item) => byLocation.set(`${item.city.name}|${item.city.state}`, item));
        return [...byLocation.values()];
      });
      setCitySearchMessage(`${matches.length} matching ${matches.length === 1 ? "city was" : "cities were"} added to the map.`);
    } catch (searchError) {
      setCitySearchMessage(searchError instanceof Error ? searchError.message : "City search failed. Please try again.");
    } finally {
      setCitySearchLoading(false);
    }
  }

  function styleFeature(feature: any): PathOptions {
    if (!feature) return {};
    const rawName = feature.properties?.STNAME_SH || feature.properties?.STNAME || "";
    const stateName = normalizeStateName(rawName);
    const temp = forecasts[stateName];
    const isSelected = selectedState && selectedState.toLowerCase() === stateName.toLowerCase();

    return {
      fillColor: getTempColor(temp),
      weight: isSelected ? 3 : 1.5,
      opacity: 1,
      color: isSelected ? "#f26522" : "rgba(255,255,255,0.8)",
      fillOpacity: isSelected ? 0.7 : 0.45,
    };
  }

  function onEachFeature(feature: any, layer: Layer) {
    const rawName = feature.properties?.STNAME_SH || feature.properties?.STNAME || "";
    const stateName = normalizeStateName(rawName);
    const temp = forecasts[stateName];
    const tempDisplay = temp !== undefined ? `${temp.toFixed(1)} °C` : "No data";
    const emoji = temp !== undefined
      ? temp < 15 ? "❄️" : temp < 20 ? "🌤" : temp < 25 ? "⛅" : temp < 30 ? "☀️" : temp < 35 ? "🔥" : "🌡️"
      : "—";

    layer.bindTooltip(
      `<div style="font-family: 'Inter', system-ui, sans-serif; font-size: 13px; line-height: 1.5; min-width: 140px;">
        <div style="font-weight: 800; color: #1b1b2f; font-size: 14px; margin-bottom: 4px;">${stateName}</div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 18px;">${emoji}</span>
          <span style="font-weight: 700; font-size: 16px; color: ${temp !== undefined ? '#f26522' : '#94a3b8'};">${tempDisplay}</span>
        </div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 3px;">Click to view forecast →</div>
      </div>`,
      { sticky: true, direction: "auto", className: "map-tooltip" }
    );

    layer.on({
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({
          weight: 3,
          color: "#f26522",
          fillOpacity: 0.75,
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

  return (
    <div className="india-map-container" style={{ position: "relative", width: "100%" }}>
      {/* Loading overlays */}
      {(loading || cityLoading) && (
        <div style={{
          position: "absolute",
          zIndex: 1000,
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(27,27,47,0.92)",
          borderRadius: 12,
          padding: "10px 20px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
        }}>
          <span className="spinner" style={{ borderTopColor: "#f26522", width: 16, height: 16 }} />
          {cityLoading ? "Fetching live weather for featured cities…" : "Loading state/UT ML forecasts…"}
        </div>
      )}
      {error && <ErrorBanner message={error} />}

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
            height: height || "620px",
            width: "100%",
            borderRadius: "12px",
            border: "1px solid #e2e4ea",
            overflow: "hidden",
          }}
        >
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

            {/* ML forecast overlay — state boundaries */}
            <LayersControl.Overlay checked name="🌡️ State Forecast Overlay">
              <GeoJSON
                ref={geoJsonRef}
                key={JSON.stringify(forecasts) + (selectedState || "")}
                data={geoData}
                style={styleFeature}
                onEachFeature={onEachFeature}
              />
            </LayersControl.Overlay>

            {/* This layer is deliberately separate from the state/UT ML forecast. */}
            <LayersControl.Overlay checked name="🏙️ Live City Weather (not ML forecast)">
              <CityMarkers cities={cityWeather} />
            </LayersControl.Overlay>
          </LayersControl>
        </MapContainer>
      )}

      <form
        onSubmit={searchCity}
        style={{
          marginTop: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: "10px 12px",
        }}
      >
        <label htmlFor="city-search" style={{ fontWeight: 700, color: "#1b1b2f", fontSize: 13 }}>
          Find live weather for any Indian city
        </label>
        <input
          id="city-search"
          type="search"
          value={cityQuery}
          onChange={(event) => setCityQuery(event.target.value)}
          placeholder="e.g. Madurai, Aligarh, Puri"
          style={{ flex: "1 1 220px", minWidth: 0, border: "1px solid #cbd5e1", borderRadius: 7, padding: "8px 10px", font: "inherit" }}
        />
        <button className="btn-primary" type="submit" disabled={citySearchLoading || !cityQuery.trim()} style={{ padding: "8px 14px" }}>
          {citySearchLoading ? "Searching…" : "Add city"}
        </button>
        <span style={{ color: "#64748b", fontSize: 12 }}>
          City readings are live weather observations, not ML temperature forecasts.
        </span>
        {citySearchMessage && <span role="status" style={{ color: "#475569", fontSize: 12 }}>{citySearchMessage}</span>}
      </form>

      {/* Bottom info bar */}
      <div style={{
        marginTop: 12,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        color: "#475569",
        background: "#ffffff",
        padding: "10px 16px",
        borderRadius: 10,
        border: "1px solid #e2e4ea",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <span style={{ fontWeight: 700, color: "#1b1b2f", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11 }}>
          Temperature Legend:
        </span>
        {[
          { color: "#3b82f6", label: "< 15°" },
          { color: "#06b6d4", label: "15–20°" },
          { color: "#10b981", label: "20–25°" },
          { color: "#f59e0b", label: "25–30°" },
          { color: "#f97316", label: "30–35°" },
          { color: "#ef4444", label: "> 35°" },
        ].map((item) => (
          <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, background: item.color, borderRadius: 3, boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }} />
            {item.label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, color: "#9494b0", fontSize: 11 }}>
          {lastUpdated && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              🔴 Live · Updated {lastUpdated}
            </span>
          )}
          <span>
            {cityWeather.length} live-weather cities · State overlay uses the ML model
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * Renders city weather markers as a Leaflet FeatureGroup (for layer toggling).
 * Using a FeatureGroup wrapper so LayersControl can toggle it.
 */
import { FeatureGroup } from "react-leaflet";

function CityMarkers({ cities }: { cities: CityWeather[] }) {
  if (cities.length === 0) return null;

  return (
    <FeatureGroup>
      {cities.map((cw) => (
        <Marker
          key={`${cw.city.name}|${cw.city.state}`}
          position={[cw.city.lat, cw.city.lng]}
          icon={createCityIcon(cw)}
        >
          <Popup>
            <div style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              minWidth: 220,
              padding: "2px 0",
            }}>
              {/* City header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#1b1b2f", lineHeight: 1.2 }}>
                    {cw.city.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>
                    {cw.city.state}
                  </div>
                </div>
                <div style={{ fontSize: 32, lineHeight: 1 }}>
                  {cw.emoji}
                </div>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                marginBottom: 10,
              }}>
                <div style={{
                  background: "#f8f9fb",
                  border: "1px solid #e2e4ea",
                  borderRadius: 8,
                  padding: "7px 9px",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9494b0", letterSpacing: "0.05em" }}>
                    District
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1b1b2f", marginTop: 2 }}>
                    {cw.city.district ?? "Not available"}
                  </div>
                </div>
                <div style={{
                  background: "#f8f9fb",
                  border: "1px solid #e2e4ea",
                  borderRadius: 8,
                  padding: "7px 9px",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9494b0", letterSpacing: "0.05em" }}>
                    Location
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1b1b2f", marginTop: 2 }}>
                    {cw.city.location ?? cw.city.name}
                  </div>
                </div>
              </div>

              {/* Temperature hero */}
              <div style={{
                background: `linear-gradient(135deg, #1b1b2f 0%, #252540 100%)`,
                borderRadius: 10,
                padding: "12px 14px",
                color: "#fff",
                marginBottom: 10,
              }}>
                <div style={{
                  fontSize: 36,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}>
                  {cw.temperature.toFixed(1)}
                  <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginLeft: 2 }}>°C</span>
                </div>
                <div style={{
                  fontSize: 12,
                  color: "#f26522",
                  fontWeight: 600,
                  marginTop: 4,
                }}>
                  {cw.description}
                </div>
              </div>

              {/* Weather details grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}>
                <div style={{
                  background: "#f8f9fb",
                  border: "1px solid #e2e4ea",
                  borderRadius: 8,
                  padding: "8px 10px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9494b0", letterSpacing: "0.05em" }}>
                    Humidity
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1b1b2f" }}>
                    {cw.humidity}<span style={{ fontSize: 11, color: "#6b7280" }}>%</span>
                  </div>
                </div>
                <div style={{
                  background: "#f8f9fb",
                  border: "1px solid #e2e4ea",
                  borderRadius: 8,
                  padding: "8px 10px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9494b0", letterSpacing: "0.05em" }}>
                    Wind
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1b1b2f" }}>
                    {cw.windSpeed.toFixed(0)}<span style={{ fontSize: 11, color: "#6b7280" }}> km/h</span>
                  </div>
                </div>
              </div>

              <div style={{
                marginTop: 8,
                fontSize: 10,
                color: "#9494b0",
                textAlign: "center",
                fontStyle: "italic",
              }}>
                Live Open-Meteo observation — not an ML forecast · {cw.isDay ? "☀️ Daytime" : "🌙 Nighttime"}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </FeatureGroup>
  );
}
