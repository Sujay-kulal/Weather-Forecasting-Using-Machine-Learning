import { useEffect, useRef, useState } from "react";
import { MapContainer, GeoJSON } from "react-leaflet";
import type { GeoJSON as LeafletGeoJSON, PathOptions, Layer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { getForecastAll } from "../services/api";
import { Spinner, ErrorBanner } from "./ui";

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
  if (temp === undefined) return "#94a3b8"; // slate-400 (no data)
  if (temp < 15) return "#3b82f6"; // blue (cold)
  if (temp < 20) return "#06b6d4"; // cyan (cool)
  if (temp < 25) return "#10b981"; // emerald (mild)
  if (temp < 30) return "#f59e0b"; // amber (warm)
  if (temp < 35) return "#f97316"; // orange (hot)
  return "#ef4444"; // red (very hot)
}

export function IndiaMap({ onSelectState, selectedState, forecastDate, height }: IndiaMapProps) {
  const [geoData, setGeoData] = useState<any>(null);
  const [forecasts, setForecasts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  function styleFeature(feature: any): PathOptions {
    if (!feature) return {};
    const rawName = feature.properties?.STNAME_SH || feature.properties?.STNAME || "";
    const stateName = normalizeStateName(rawName);
    const temp = forecasts[stateName];
    const isSelected = selectedState && selectedState.toLowerCase() === stateName.toLowerCase();

    return {
      fillColor: getTempColor(temp),
      weight: isSelected ? 3 : 1.2,
      opacity: 1,
      color: isSelected ? "#0f172a" : "#ffffff",
      fillOpacity: isSelected ? 0.95 : 0.75,
    };
  }

  function onEachFeature(feature: any, layer: Layer) {
    const rawName = feature.properties?.STNAME_SH || feature.properties?.STNAME || "";
    const stateName = normalizeStateName(rawName);
    const temp = forecasts[stateName];
    const tempDisplay = temp !== undefined ? `${temp.toFixed(1)} °C` : "No data";

    layer.bindTooltip(
      `<div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
        <strong style="color: #0f4c81;">${stateName}</strong><br/>
        <span>Predicted Temp: <b>${tempDisplay}</b></span>
      </div>`,
      { sticky: true, direction: "auto" }
    );

    layer.on({
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({
          weight: 2.5,
          color: "#0284c7",
          fillOpacity: 0.9,
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
      {loading && (
        <div style={{ position: "absolute", zIndex: 1000, top: 20, right: 20 }}>
          <Spinner label="Loading all-state predictions…" />
        </div>
      )}
      {error && <ErrorBanner message={error} />}

      {geoData && (
        <MapContainer
          center={[22.8, 80.0]}
          zoom={4.5}
          minZoom={4}
          maxZoom={7}
          maxBounds={[
            [6.0, 68.0],
            [37.5, 98.0],
          ]}
          scrollWheelZoom={false}
          style={{
            height: height || "520px",
            width: "100%",
            background: "#f8fafc",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
          }}
        >
          <GeoJSON
            ref={geoJsonRef}
            key={JSON.stringify(forecasts) + (selectedState || "")}
            data={geoData}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        </MapContainer>
      )}

      {/* Choropleth Temperature Legend */}
      <div
        style={{
          marginTop: "12px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "10px",
          fontSize: "12px",
          color: "#475569",
          background: "#ffffff",
          padding: "8px 12px",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
        }}
      >
        <span style={{ fontWeight: 600 }}>Forecast Temp (°C):</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 14, height: 14, background: "#3b82f6", borderRadius: 3 }} /> &lt;15°
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 14, height: 14, background: "#06b6d4", borderRadius: 3 }} /> 15–20°
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 14, height: 14, background: "#10b981", borderRadius: 3 }} /> 20–25°
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 14, height: 14, background: "#f59e0b", borderRadius: 3 }} /> 25–30°
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 14, height: 14, background: "#f97316", borderRadius: 3 }} /> 30–35°
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 14, height: 14, background: "#ef4444", borderRadius: 3 }} /> &gt;35°
        </span>
        <span style={{ marginLeft: "auto", fontStyle: "italic", color: "#64748b" }}>
          Click any state to view its 7-day forecast
        </span>
      </div>
    </div>
  );
}
