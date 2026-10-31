import { useEffect, useState } from "react";
import { IndiaMap, type OverlayMetric, METRIC_CONFIGS, normalizeStateName, getTempColor } from "../components/IndiaMap";
import {
  ChipIcon,
  CloudSunIcon,
  DropletIcon,
  MapIcon,
  RainIcon,
  SlidersIcon,
  ThermometerIcon,
} from "../components/icons";
import { Badge, Card, EmptyNote, ErrorBanner, PageHead, Skeleton, StatChip } from "../components/ui";
import { getForecastAll, getRecentWeather } from "../services/api";
import type { WeatherRecord } from "../types/api";

export interface IndiaMapPageProps {
  selectedState?: string;
  onSelectState?: (state: string) => void;
  onNavigateTab?: (tab: string) => void;
}

const KEY_STATES = [
  "Maharashtra",
  "Delhi",
  "Karnataka",
  "Tamil Nadu",
  "Uttar Pradesh",
  "Gujarat",
];

export function IndiaMapPage({
  selectedState: externalSelectedState,
  onSelectState: externalOnSelectState,
  onNavigateTab,
}: IndiaMapPageProps) {
  const [internalSelectedState, setInternalSelectedState] = useState<string>("");
  const selectedState = externalSelectedState !== undefined ? externalSelectedState : internalSelectedState;

  const [overlayMetric, setOverlayMetric] = useState<OverlayMetric>("temperature");
  const [forecastDay, setForecastDay] = useState<number>(1);

  // State Telemetry data
  const [recentRecords, setRecentRecords] = useState<WeatherRecord[]>([]);
  const [forecastTemp, setForecastTemp] = useState<number | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState<boolean>(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  function handleSelectState(state: string) {
    if (externalOnSelectState) {
      externalOnSelectState(state);
    } else {
      setInternalSelectedState(state);
    }
  }

  // Fetch telemetry whenever selectedState or forecastDay changes
  useEffect(() => {
    if (!selectedState) {
      setRecentRecords([]);
      setForecastTemp(null);
      setTelemetryError(null);
      setTelemetryLoading(false);
      return;
    }

    let cancelled = false;
    setTelemetryLoading(true);
    setTelemetryError(null);

    const normState = normalizeStateName(selectedState);

    async function loadTelemetry() {
      // 1. Fetch recent observations from database
      try {
        const recentRes = await getRecentWeather(normState, 7);
        if (!cancelled) {
          setRecentRecords(recentRes.records ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Could not load recent records for state:", normState, err);
          // Try without normalized state
          try {
            const fallbackRecent = await getRecentWeather(selectedState, 7);
            if (!cancelled) setRecentRecords(fallbackRecent.records ?? []);
          } catch {
            if (!cancelled) setRecentRecords([]);
          }
        }
      }

      // 2. Fetch Day forecast temperature for this state
      try {
        const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";
        const forecastRes = await fetch(`${BASE_URL}/forecast/all?day=${forecastDay}`);
        if (forecastRes.ok) {
          const allForecasts = (await forecastRes.json()) as Record<string, number>;
          if (!cancelled) {
            const val = allForecasts[normState] ?? allForecasts[selectedState];
            setForecastTemp(val !== undefined ? val : null);
          }
        } else {
          throw new Error("Failed to load forecast");
        }
      } catch {
        try {
          const fallbackForecasts = await getForecastAll(forecastDay);
          if (!cancelled) {
            const val = fallbackForecasts[normState] ?? fallbackForecasts[selectedState];
            setForecastTemp(val !== undefined ? val : null);
          }
        } catch {
          if (!cancelled) setForecastTemp(null);
        }
      } finally {
        if (!cancelled) {
          setTelemetryLoading(false);
        }
      }
    }

    void loadTelemetry();
    return () => {
      cancelled = true;
    };
  }, [selectedState, forecastDay]);

  const latestRecord = recentRecords.length > 0 ? recentRecords[recentRecords.length - 1] : null;
  const activeMetricConf = METRIC_CONFIGS[overlayMetric];

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Enterprise Page Header */}
      <PageHead
        title="India Meteorological Intelligence Map"
        desc="Interactive geospatial weather analytics, state-level LightGBM multi-output forecasts, and live city observations across India."
        badge={<Badge variant="info">36 States & UTs Monitored</Badge>}
      />

      {/* Top KPI Cards */}
      <div className="stat-chips">
        <StatChip
          icon={<MapIcon />}
          label="Monitored Regions"
          value="36 States / UTs"
          sub="Full national coverage"
        />
        <StatChip
          icon={<CloudSunIcon />}
          label="Live Feeds"
          value="150+ Cities"
          sub="Open-Meteo telemetry"
        />
        <StatChip
          icon={<SlidersIcon />}
          label="Active Overlay"
          value={`${activeMetricConf.label} (${activeMetricConf.unit})`}
          sub={`Forecast Horizon: Day ${forecastDay}`}
        />
        <StatChip
          icon={<ChipIcon />}
          label="Inference Engine"
          value="LightGBM Multi-Output"
          sub="Horizon Day 1 to 7"
        />
      </div>

      {/* Asymmetric Map Layout: 1fr map on left, 300px telemetry panel on right */}
      <div className="map-layout-grid">
        {/* Left Column: Refactored IndiaMap */}
        <div>
          <IndiaMap
            selectedState={selectedState}
            onSelectState={handleSelectState}
            overlayMetric={overlayMetric}
            onOverlayMetricChange={setOverlayMetric}
            forecastDay={forecastDay}
            onForecastDayChange={setForecastDay}
            height="650px"
          />
        </div>

        {/* Right Column: State Telemetry & Forecast Panel */}
        <div>
          {!selectedState ? (
            <Card
              title="State Telemetry"
              subtitle="Regional intelligence inspector"
              icon={<MapIcon style={{ width: 16, height: 16, color: "var(--accent)" }} />}
            >
              <EmptyNote
                title="No State Selected"
                hint="Select any state polygon or city marker on the map to inspect regional observations and multi-output forecasts."
              />

              <div style={{ marginTop: 20, borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Quick Select Key States:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {KEY_STATES.map((state) => (
                    <button
                      key={state}
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleSelectState(state)}
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <Card
              title={selectedState}
              subtitle="Regional Telemetry & Forecast"
              icon={<MapIcon style={{ width: 16, height: 16, color: "var(--accent)" }} />}
              action={
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => handleSelectState("")}
                  style={{ padding: "4px 8px", fontSize: 11.5 }}
                >
                  Clear Selection
                </button>
              }
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <Badge variant="info">Monitored Region</Badge>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>PostgreSQL + LightGBM</span>
              </div>

              {telemetryLoading ? (
                <Skeleton rows={5} />
              ) : telemetryError ? (
                <ErrorBanner message={telemetryError} />
              ) : (
                <>
                  {/* Telemetry Metric Tiles */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                    <div className="stat-chip" style={{ padding: "10px 12px" }}>
                      <span className="stat-icon" style={{ width: 30, height: 30 }}>
                        <ThermometerIcon style={{ width: 16, height: 16 }} />
                      </span>
                      <span className="stat-body">
                        <span className="stat-value" style={{ fontSize: 16 }}>
                          {forecastTemp !== null ? `${forecastTemp.toFixed(1)}°C` : "—"}
                        </span>
                        <span className="stat-label">Day {forecastDay} Forecast</span>
                      </span>
                    </div>

                    <div className="stat-chip" style={{ padding: "10px 12px" }}>
                      <span className="stat-icon" style={{ width: 30, height: 30 }}>
                        <ThermometerIcon style={{ width: 16, height: 16 }} />
                      </span>
                      <span className="stat-body">
                        <span className="stat-value" style={{ fontSize: 16 }}>
                          {latestRecord ? `${latestRecord.temp_avg.toFixed(1)}°C` : "—"}
                        </span>
                        <span className="stat-label">Recent Avg Temp</span>
                      </span>
                    </div>

                    <div className="stat-chip" style={{ padding: "10px 12px" }}>
                      <span className="stat-icon" style={{ width: 30, height: 30 }}>
                        <DropletIcon style={{ width: 16, height: 16 }} />
                      </span>
                      <span className="stat-body">
                        <span className="stat-value" style={{ fontSize: 16 }}>
                          {latestRecord ? `${latestRecord.humidity.toFixed(0)}%` : "—"}
                        </span>
                        <span className="stat-label">Humidity</span>
                      </span>
                    </div>

                    <div className="stat-chip" style={{ padding: "10px 12px" }}>
                      <span className="stat-icon" style={{ width: 30, height: 30 }}>
                        <RainIcon style={{ width: 16, height: 16 }} />
                      </span>
                      <span className="stat-body">
                        <span className="stat-value" style={{ fontSize: 16 }}>
                          {latestRecord ? `${latestRecord.rainfall.toFixed(1)} mm` : "—"}
                        </span>
                        <span className="stat-label">Rainfall</span>
                      </span>
                    </div>
                  </div>

                  {/* 7-Day Mini-Trend Summary */}
                  <div
                    style={{
                      borderTop: "1px solid var(--border-subtle)",
                      paddingTop: 12,
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "var(--text-secondary)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        7-Day Historical Trend
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Observed Temp_Avg</span>
                    </div>

                    {recentRecords.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>
                        Historical trend records loading from database…
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${recentRecords.length}, 1fr)`,
                          gap: 4,
                          alignItems: "end",
                          height: 70,
                          padding: "4px 0",
                        }}
                      >
                        {recentRecords.map((r, i) => {
                          const barHeight = Math.max(16, Math.min(50, ((r.temp_avg - 10) / 30) * 50));
                          const color = getTempColor(r.temp_avg);
                          const dateParts = r.date.split("-");
                          const dayLabel = dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : `D${i + 1}`;
                          return (
                            <div
                              key={r.date}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 3,
                              }}
                              title={`${r.date}: Avg ${r.temp_avg.toFixed(1)}°C (Max ${r.temp_max.toFixed(1)}°C, Min ${r.temp_min.toFixed(1)}°C)`}
                            >
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                                {r.temp_avg.toFixed(0)}°
                              </span>
                              <div
                                style={{
                                  width: "100%",
                                  maxWidth: 16,
                                  height: `${barHeight}px`,
                                  background: color,
                                  borderRadius: 2,
                                }}
                              />
                              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                                {dayLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Primary Navigation to Full Forecast */}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      if (onNavigateTab) {
                        onNavigateTab("forecast");
                      }
                    }}
                    style={{
                      width: "100%",
                      marginTop: 18,
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <span>Open Full Forecast Details →</span>
                  </button>
                </>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
