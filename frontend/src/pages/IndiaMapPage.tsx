import { useEffect, useState } from "react";
import { getForecastAll, getRecentWeather, getStates } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Card, ErrorBanner, PageHead, Skeleton } from "../components/ui";
import type { WeatherRecord } from "../types/api";

interface MapPoint {
  state: string;
  city: string;
  lat: number;
  lon: number;
}

// Approximate state-capital coordinates are display anchors. The existing
// weather API returns state-level observations, not city coordinates.
const MAP_POINTS: MapPoint[] = [
  { state: "Andhra Pradesh", city: "Amaravati", lat: 16.51, lon: 80.52 },
  { state: "Arunachal Pradesh", city: "Itanagar", lat: 27.08, lon: 93.62 },
  { state: "Assam", city: "Dispur", lat: 26.14, lon: 91.79 },
  { state: "Bihar", city: "Patna", lat: 25.61, lon: 85.14 },
  { state: "Chhattisgarh", city: "Raipur", lat: 21.25, lon: 81.63 },
  { state: "Goa", city: "Panaji", lat: 15.50, lon: 73.83 },
  { state: "Gujarat", city: "Gandhinagar", lat: 23.22, lon: 72.64 },
  { state: "Haryana", city: "Chandigarh", lat: 30.73, lon: 76.78 },
  { state: "Himachal Pradesh", city: "Shimla", lat: 31.10, lon: 77.17 },
  { state: "Jharkhand", city: "Ranchi", lat: 23.34, lon: 85.31 },
  { state: "Karnataka", city: "Bengaluru", lat: 12.97, lon: 77.59 },
  { state: "Kerala", city: "Thiruvananthapuram", lat: 8.52, lon: 76.94 },
  { state: "Madhya Pradesh", city: "Bhopal", lat: 23.26, lon: 77.41 },
  { state: "Maharashtra", city: "Mumbai", lat: 19.08, lon: 72.88 },
  { state: "Manipur", city: "Imphal", lat: 24.82, lon: 93.94 },
  { state: "Meghalaya", city: "Shillong", lat: 25.58, lon: 91.89 },
  { state: "Mizoram", city: "Aizawl", lat: 23.73, lon: 92.72 },
  { state: "Nagaland", city: "Kohima", lat: 25.67, lon: 94.11 },
  { state: "Odisha", city: "Bhubaneswar", lat: 20.30, lon: 85.82 },
  { state: "Punjab", city: "Chandigarh", lat: 30.73, lon: 76.78 },
  { state: "Rajasthan", city: "Jaipur", lat: 26.91, lon: 75.79 },
  { state: "Sikkim", city: "Gangtok", lat: 27.33, lon: 88.61 },
  { state: "Tamil Nadu", city: "Chennai", lat: 13.08, lon: 80.27 },
  { state: "Telangana", city: "Hyderabad", lat: 17.39, lon: 78.49 },
  { state: "Tripura", city: "Agartala", lat: 23.83, lon: 91.28 },
  { state: "Uttar Pradesh", city: "Lucknow", lat: 26.85, lon: 80.95 },
  { state: "Uttarakhand", city: "Dehradun", lat: 30.32, lon: 78.03 },
  { state: "West Bengal", city: "Kolkata", lat: 22.57, lon: 88.36 },
  { state: "Andaman and Nicobar Islands", city: "Port Blair", lat: 11.62, lon: 92.73 },
  { state: "Chandigarh", city: "Chandigarh", lat: 30.73, lon: 76.78 },
  { state: "Dadra and Nagar Haveli and Daman and Diu", city: "Daman", lat: 20.40, lon: 72.83 },
  { state: "Delhi", city: "New Delhi", lat: 28.61, lon: 77.21 },
  { state: "Jammu and Kashmir", city: "Srinagar", lat: 34.08, lon: 74.80 },
  { state: "Ladakh", city: "Leh", lat: 34.15, lon: 77.58 },
  { state: "Lakshadweep", city: "Kavaratti", lat: 10.57, lon: 72.64 },
  { state: "Puducherry", city: "Puducherry", lat: 11.94, lon: 79.81 },
];

const INDIA_OUTLINE: [number, number][] = [
  [77, 35], [79, 34], [78, 32], [80, 30], [81, 28], [84, 27], [88, 28], [91, 27],
  [94, 26], [92, 24], [89, 22], [88, 21], [86, 21], [85, 19], [83, 17], [82, 15],
  [80, 13], [79, 10], [77, 8], [76, 10], [75, 12], [74, 15], [73, 18], [72, 21],
  [69, 23], [68, 25], [71, 27], [72, 30], [74, 32], [77, 35],
];

const INDIA_BOUNDS = { minLon: 67, maxLon: 97, minLat: 6, maxLat: 38 };
const SVG_WIDTH = 720;
const SVG_HEIGHT = 660;

const POINT_OFFSETS: Record<string, [number, number]> = {
  "Arunachal Pradesh": [-3, -15], Assam: [-15, 1], Manipur: [15, 7], Meghalaya: [-15, -8],
  Mizoram: [8, 14], Nagaland: [17, -10], Tripura: [-8, 15], Punjab: [-8, -7], Haryana: [8, 7],
};

function project(lon: number, lat: number, state?: string) {
  const x = ((lon - INDIA_BOUNDS.minLon) / (INDIA_BOUNDS.maxLon - INDIA_BOUNDS.minLon)) * SVG_WIDTH;
  const y = ((INDIA_BOUNDS.maxLat - lat) / (INDIA_BOUNDS.maxLat - INDIA_BOUNDS.minLat)) * SVG_HEIGHT;
  const [offsetX, offsetY] = state ? POINT_OFFSETS[state] ?? [0, 0] : [0, 0];
  return { x: x + offsetX, y: y + offsetY };
}

function tempColor(temp: number): string {
  if (temp < 10) return "#67c6ef";
  if (temp < 20) return "#4bc2a5";
  if (temp < 30) return "#ffb547";
  return "#ff704f";
}

export function IndiaMapPage() {
  const [day, setDay] = useState(1);
  const [showMl, setShowMl] = useState(true);
  const [showLive, setShowLive] = useState(false);
  const [liveRows, setLiveRows] = useState<Map<string, WeatherRecord>>(() => new Map());
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveAttempt, setLiveAttempt] = useState(0);
  const states = useFetch(getStates, []);
  const forecast = useFetch(() => getForecastAll(day), [day]);

  useEffect(() => {
    if (!showLive || !states.data) return;
    let cancelled = false;
    setLiveLoading(true);
    setLiveError(null);
    Promise.allSettled(states.data.states.map(async (state) => {
      const response = await getRecentWeather(state, 1);
      const record = response.records[response.records.length - 1];
      return record ? [state, record] as const : null;
    })).then((results) => {
      if (cancelled) return;
      const next = new Map<string, WeatherRecord>();
      let failed = 0;
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) next.set(...result.value);
        else if (result.status === "rejected") failed += 1;
      }
      setLiveRows(next);
      setLiveError(failed > 0 ? `Live observations unavailable for ${failed} region(s).` : null);
      setLiveLoading(false);
    });
    return () => { cancelled = true; };
  }, [showLive, states.data, liveAttempt]);

  const outline = INDIA_OUTLINE.map(([lon, lat]) => {
    const point = project(lon, lat);
    return `${point.x},${point.y}`;
  }).join(" ");
  const modelPoints = MAP_POINTS.flatMap((point) => {
    const value = forecast.data?.[point.state];
    if (value == null) return [];
    return [{ ...point, value, ...project(point.lon, point.lat, point.state) }];
  });
  const observations = MAP_POINTS.flatMap((point) => {
    const record = liveRows.get(point.state);
    if (!record) return [];
    return [{ ...point, record, ...project(point.lon, point.lat, point.state) }];
  });

  return (
    <div className="page">
      <PageHead title="India map" desc="Temperature forecasts by model horizon and recent observations from available statewide records." />
      <Card title="Weather across India" subtitle="The map is fitted to India on load. Hover or focus a marker for its value.">
        <div className="map-toolbar">
          <label className="map-range" htmlFor="forecast-day">Forecast day <strong>{day}</strong></label>
          <input id="forecast-day" type="range" min="1" max="7" value={day} onChange={(event) => setDay(Number(event.target.value))} />
          <label className="layer-toggle"><input type="checkbox" checked={showMl} onChange={(event) => setShowMl(event.target.checked)} /> ML state forecast</label>
          <label className="layer-toggle"><input type="checkbox" checked={showLive} onChange={(event) => setShowLive(event.target.checked)} /> Live cities</label>
        </div>
        {forecast.loading && !forecast.data && <Skeleton rows={4} />}
        {forecast.error && !forecast.data && <ErrorBanner message={forecast.error.message} onRetry={forecast.retry} />}
        {states.error && <ErrorBanner message={states.error.message} onRetry={states.retry} />}
        {showLive && liveLoading && <p className="map-status">Loading recent observations…</p>}
        {showLive && liveError && <p className="map-status">{liveError} <button className="health-retry" onClick={() => setLiveAttempt((value) => value + 1)}>Retry</button></p>}
        <div className="map-shell" role="img" aria-label={`India temperature map, forecast day ${day}`}>
          <svg className="india-map" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="india-fill" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#1b3145" />
                <stop offset="1" stopColor="#192638" />
              </linearGradient>
            </defs>
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} rx="18" fill="#111b29" />
            <polygon points={outline} fill="url(#india-fill)" stroke="#55677e" strokeWidth="2" />
            {showMl && modelPoints.map((point) => (
              <g key={`ml-${point.state}`} tabIndex={0} className="map-marker">
                <title>{`${point.state} · forecast day ${day}: ${point.value.toFixed(1)} °C`}</title>
                <circle cx={point.x} cy={point.y} r="5.5" fill={tempColor(point.value)} stroke="#101827" strokeWidth="1.5" />
              </g>
            ))}
            {showLive && observations.map(({ state, city, record, x, y }) => (
              <g key={`live-${state}`} tabIndex={0} className="map-marker live-marker">
                <title>{`${city} · ${state} statewide observation on ${record.date}: ${record.temp_avg.toFixed(1)} °C`}</title>
                <circle cx={x + 8} cy={y + 8} r="4" fill="#f4f6fa" stroke="#ff6b35" strokeWidth="2" />
              </g>
            ))}
            <text x="16" y="30" className="map-caption">INDIA · DAY {day} FORECAST</text>
            <text x="18" y={SVG_HEIGHT - 18} className="map-caption">State-average records plotted at approximate capital coordinates</text>
          </svg>
        </div>
        <div className="map-legend"><span><i className="legend-dot cool" /> &lt; 10°C</span><span><i className="legend-dot mild" /> 10–20°C</span><span><i className="legend-dot warm" /> 20–30°C</span><span><i className="legend-dot hot" /> &gt; 30°C</span><span><i className="legend-dot observed" /> Live observation</span></div>
      </Card>
    </div>
  );
}
