import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getModelInfo, getPredictions, getStates } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import type { PredictionRecord } from "../types/api";
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
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChipIcon,
  ClockIcon,
  DatabaseIcon,
  FilterIcon,
  ListIcon,
  RefreshIcon,
  SearchIcon,
  TargetIcon,
  XIcon,
} from "../components/icons";

interface ExtendedPredictionRecord extends PredictionRecord {
  model_version?: string;
  actual_temp?: number | null;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const CONFORMAL_Q = 2.84; // ±2.84°C empirical 90% conformal interval

function prettyDate(iso: string): string {
  if (!iso) return "—";
  const parts = iso.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return iso;
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function computeHorizonDate(baseIso: string, dayOffset: number): string {
  if (!baseIso) return `Day ${dayOffset + 1}`;
  const parts = baseIso.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return `Day ${dayOffset + 1}`;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d + dayOffset));
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function PredictionHistoryPage() {
  const states = useFetch(getStates, []);
  const modelInfo = useFetch(getModelInfo, []);

  // Records and Loading State
  const [records, setRecords] = useState<ExtendedPredictionRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [stateFilter, setStateFilter] = useState<string>("");
  const [modelFilter, setModelFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Detail Modal State
  const [selectedRecord, setSelectedRecord] = useState<ExtendedPredictionRecord | null>(null);

  // Auto-fetch predictions on mount
  useEffect(() => {
    void loadData();
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedRecord(null);
    }
    if (selectedRecord) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedRecord]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch up to 500 stored predictions to enable client-side instant filtering & full pagination
      const resp = await getPredictions(500, 0);
      const rows = (resp.predictions as ExtendedPredictionRecord[]) ?? [];
      setRecords(rows);
      setTotalCount((resp as any).total ?? resp.count ?? rows.length);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Filter records
  const filteredRecords = records.filter((r) => {
    if (stateFilter && r.state !== stateFilter) return false;
    if (modelFilter) {
      const ver = r.model_version ?? "weather_model_v3";
      if (ver !== modelFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchId = String(r.id).includes(q);
      const matchState = r.state.toLowerCase().includes(q);
      const matchDistrict = (r.district ?? "").toLowerCase().includes(q);
      const matchLocation = (r.location ?? "").toLowerCase().includes(q);
      const matchDate = r.forecast_date.includes(q);
      if (!matchId && !matchState && !matchDistrict && !matchLocation && !matchDate) {
        return false;
      }
    }
    return true;
  });

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRecords.length);
  const pagedRecords = filteredRecords.slice(startIndex, endIndex);

  // Unique model versions for filter
  const modelVersions = Array.from(
    new Set(records.map((r) => r.model_version ?? "weather_model_v3"))
  ).filter(Boolean);

  // Latest prediction timestamp
  const latestPredictionDate = records.length > 0 && records[0].created_at
    ? new Date(records[0].created_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="page">
      <PageHead
        title="Prediction History & Audit Log"
        desc="Immutable audit trail of multi-output temperature forecasts generated and stored in PostgreSQL. Inspect multi-horizon trajectories and model versions."
        badge={<Badge neutral>Database Audit Trail</Badge>}
      />

      {/* Hero Stat Chips */}
      <div className="stat-chips">
        <StatChip
          icon={<DatabaseIcon />}
          label="Total Stored Predictions"
          value={loading ? "…" : totalCount.toLocaleString()}
          sub="PostgreSQL public.predictions"
        />
        <StatChip
          icon={<FilterIcon />}
          label="Active Filter Matches"
          value={loading ? "…" : filteredRecords.length.toLocaleString()}
          sub={stateFilter || modelFilter || searchQuery ? "Filtered subset" : "All predictions matched"}
        />
        <StatChip
          icon={<ChipIcon />}
          label="Production Engine"
          value={modelInfo.data?.model_name ? `${modelInfo.data.model_name} v3` : "LightGBM v3"}
          sub="7-Day Multi-Output Joint Model"
        />
        <StatChip
          icon={<ClockIcon />}
          label="Latest Prediction Entry"
          value={latestPredictionDate}
          sub="Most recent stored inference"
        />
      </div>

      {/* Filter Toolbar Panel */}
      <div className="panel" style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", flex: 1 }}>
            {/* State filter */}
            <label className="field inline" style={{ minWidth: 170 }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                State Filter
              </span>
              <select
                value={stateFilter}
                onChange={(e) => {
                  setStateFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">All States ({states.data?.states.length ?? 34})</option>
                {states.data?.states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            {/* Model Version filter */}
            <label className="field inline" style={{ minWidth: 160 }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                Model Version
              </span>
              <select
                value={modelFilter}
                onChange={(e) => {
                  setModelFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">All Versions</option>
                {modelVersions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            {/* Search query input */}
            <label className="field inline" style={{ minWidth: 220, flex: 1 }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                Search Audit Trail
              </span>
              <div style={{ position: "relative", width: "100%" }}>
                <SearchIcon
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 15,
                    height: 15,
                    color: "var(--text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="search"
                  placeholder="Filter by district, station, state, or ID…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            {/* Page size selector */}
            <label className="field inline" style={{ width: 110 }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                Rows per page
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} rows
                  </option>
                ))}
              </select>
            </label>

            {/* Refresh button */}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void loadData()}
              disabled={loading}
              style={{ height: 38, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <RefreshIcon style={{ width: 15, height: 15 }} />
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && <ErrorBanner message={error} onRetry={() => void loadData()} />}

      {/* Loading state skeleton */}
      {loading && records.length === 0 && (
        <Card title="Loading Prediction Audit Records…" icon={<ListIcon />}>
          <Skeleton rows={8} />
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && filteredRecords.length === 0 && (
        <Card title="Stored Predictions" icon={<ListIcon />}>
          <EmptyNote
            title={stateFilter || searchQuery || modelFilter ? "No matching prediction records" : "No predictions stored yet"}
            hint={
              stateFilter || searchQuery || modelFilter
                ? "Try clearing or broadening your search filters to view older audit records."
                : "No forecast requests have been executed yet. Run a prediction on the Weather Forecast page to generate an audit log."
            }
            action={
              (stateFilter || searchQuery || modelFilter) ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setStateFilter("");
                    setModelFilter("");
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                >
                  Clear All Filters
                </button>
              ) : undefined
            }
          />
        </Card>
      )}

      {/* Structured Audit Log Table & Pagination */}
      {!loading && filteredRecords.length > 0 && (
        <Card
          title="Stored Prediction Audit Log"
          subtitle={`Showing items ${startIndex + 1}–${endIndex} of ${filteredRecords.length.toLocaleString()} matching records.`}
          icon={<ListIcon />}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>ID</th>
                  <th>State</th>
                  <th>District</th>
                  <th>Station</th>
                  <th>Target Date</th>
                  <th>7-Day Predicted Avg Temp (°C)</th>
                  <th>Model Version</th>
                  <th>Created At</th>
                  <th style={{ textAlign: "right" }}>Trajectory Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((r) => {
                  const temps = Array.isArray(r.predicted_temp_avg)
                    ? r.predicted_temp_avg
                    : [Number(r.predicted_temp_avg)];
                  const minTemp = Math.min(...temps);
                  const maxTemp = Math.max(...temps);

                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="feature-tag">#{r.id}</span>
                      </td>
                      <td>
                        <Badge variant="info">{r.state}</Badge>
                      </td>
                      <td>{r.district || <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                      <td>{r.location || <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                      <td style={{ fontWeight: 600 }}>{prettyDate(r.forecast_date)}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "var(--accent)",
                              background: "var(--accent-subtle)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid #bfdbfe",
                              fontVariantNumeric: "tabular-nums",
                            }}
                            title={`Day 1: ${temps[0]?.toFixed(1)}°C`}
                          >
                            D1: {temps[0]?.toFixed(1)}°C
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            Range: {minTemp.toFixed(1)}°–{maxTemp.toFixed(1)}°C ({temps.length}D)
                          </span>
                        </div>
                      </td>
                      <td>
                        <Badge neutral>{r.model_version || "weather_model_v3"}</Badge>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {new Date(r.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => setSelectedRecord(r)}
                          style={{
                            fontSize: "11.5px",
                            padding: "4px 8px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <TargetIcon style={{ width: 13, height: 13 }} />
                          Inspect Trajectory
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Standard True Pagination Controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 4px 4px",
              marginTop: 10,
              borderTop: "1px solid var(--border-subtle)",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
              Showing <strong>{startIndex + 1}</strong> to <strong>{endIndex}</strong> of{" "}
              <strong>{filteredRecords.length.toLocaleString()}</strong> prediction records
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={activePage <= 1}
                style={{
                  padding: "5px 10px",
                  fontSize: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <ChevronLeftIcon style={{ width: 14, height: 14 }} />
                Previous
              </button>

              <span
                style={{
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  padding: "0 8px",
                }}
              >
                Page {activePage} of {totalPages}
              </span>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={activePage >= totalPages}
                style={{
                  padding: "5px 10px",
                  fontSize: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Next
                <ChevronRightIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Trajectory Detail Inspection Modal */}
      {selectedRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={() => setSelectedRecord(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              width: "100%",
              maxWidth: "780px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "6px",
                    background: "var(--accent-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent)",
                  }}
                >
                  <TargetIcon style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <h3
                    id="modal-title"
                    style={{
                      margin: 0,
                      fontSize: "16px",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    Prediction Audit Record #{selectedRecord.id}
                    <Badge variant="info">{selectedRecord.state}</Badge>
                  </h3>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    7-Day Multi-Horizon Predicted Trajectory & Confidence Bounds
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn-outline"
                onClick={() => setSelectedRecord(null)}
                style={{ padding: "6px", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                aria-label="Close dialog"
              >
                <XIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Metadata Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10,
                  background: "var(--bg-surface-subtle)",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>
                    State / Region
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
                    {selectedRecord.state}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>
                    District / Station
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                    {selectedRecord.district || "State Default"} {selectedRecord.location ? `· ${selectedRecord.location}` : ""}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>
                    Forecast Origin Date
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                    {prettyDate(selectedRecord.forecast_date)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>
                    Model Engine
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
                    {selectedRecord.model_version || "weather_model_v3"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }}>
                    Recorded Timestamp
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: 2 }}>
                    {new Date(selectedRecord.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Trajectory Line Chart */}
              <div>
                <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>
                  7-Day Predicted Trajectory (°C)
                </span>
                <div style={{ width: "100%", height: 180, marginTop: 8 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={selectedRecord.predicted_temp_avg.map((temp, i) => ({
                        day: `Day ${i + 1}`,
                        date: computeHorizonDate(selectedRecord.forecast_date, i + 1),
                        temp: Number(temp.toFixed(2)),
                        upper: Number((temp + CONFORMAL_Q).toFixed(2)),
                        lower: Number((temp - CONFORMAL_Q).toFixed(2)),
                      }))}
                      margin={{ top: 10, right: 20, bottom: 5, left: 0 }}
                    >
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        unit="°C"
                        domain={["dataMin - 3", "dataMax + 3"]}
                        tickFormatter={(v: number) => v.toFixed(0)}
                      />
                      <Tooltip
                        formatter={(v: number, name: string) => [`${v.toFixed(2)} °C`, name]}
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "none",
                          borderRadius: "6px",
                          color: "#ffffff",
                          fontSize: "12px",
                        }}
                      />
                      <ReferenceLine
                        y={
                          selectedRecord.predicted_temp_avg.reduce((a, b) => a + b, 0) /
                          selectedRecord.predicted_temp_avg.length
                        }
                        stroke="#94a3b8"
                        strokeDasharray="4 4"
                      />
                      <Line
                        type="monotone"
                        dataKey="temp"
                        name="Predicted Temp Avg"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#2563eb" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Trajectory Table */}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Horizon</th>
                      <th>Valid Date</th>
                      <th className="num">Predicted Avg Temp (°C)</th>
                      <th className="num">Est. Diurnal (Min – Max)</th>
                      <th>90% Confidence Interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRecord.predicted_temp_avg.map((temp, i) => {
                      const dayDate = computeHorizonDate(selectedRecord.forecast_date, i + 1);
                      const estMin = (temp - 3.5).toFixed(1);
                      const estMax = (temp + 3.5).toFixed(1);
                      const ciLow = (temp - CONFORMAL_Q).toFixed(1);
                      const ciHigh = (temp + CONFORMAL_Q).toFixed(1);

                      return (
                        <tr key={i}>
                          <td>
                            <Badge neutral>Day {i + 1} (t+{i + 1})</Badge>
                          </td>
                          <td style={{ fontWeight: 600 }}>{dayDate}</td>
                          <td className="num strong" style={{ color: "var(--accent)" }}>
                            {temp.toFixed(2)}°C
                          </td>
                          <td className="num" style={{ color: "var(--text-secondary)" }}>
                            {estMin}°C – {estMax}°C
                          </td>
                          <td>
                            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                              [{ciLow}°C, {ciHigh}°C]
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Audit Info Note */}
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  background: "var(--bg-surface-subtle)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <CalendarIcon style={{ width: 14, height: 14, color: "var(--text-faint)" }} />
                <span>
                  Audit Verification: Stored in PostgreSQL <code>predictions</code> table on inference request. Output array contains 7 joint multi-output predictions.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "12px 20px",
                borderTop: "1px solid var(--border-subtle)",
                background: "var(--bg-surface)",
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedRecord(null)}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
