import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getStates, getDistricts, getLocations, getWeatherHistory } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import {
  Badge,
  Card,
  EmptyNote,
  ErrorBanner,
  PageHead,
  Skeleton,
  Spinner,
  StatChip,
} from "../components/ui";
import {
  CalendarIcon,
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  DropletIcon,
  RainIcon,
  RefreshIcon,
  SearchIcon,
  SlidersIcon,
  ThermometerIcon,
} from "../components/icons";
import type { WeatherRecord } from "../types/api";

type SortKey = "date" | "temp_max" | "temp_avg" | "temp_min" | "humidity" | "rainfall" | "wind_speed";
type SortOrder = "asc" | "desc";
type ChartView = "temperature" | "hydrology" | "combined";

const TOTAL_DB_RECORDS = 46834;
const FETCH_PAGE_SIZE = 1000;

function prettyDate(iso?: string | null): string {
  if (!iso) return "—";
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return iso;
  }
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(iso?: string | null): string {
  if (!iso || iso.length < 5) return iso ?? "";
  return iso.slice(5);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function WeatherChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const data = payload[0]?.payload as WeatherRecord | undefined;
  if (!data) return null;

  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.95)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 8,
        padding: "10px 14px",
        color: "#ffffff",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        minWidth: 190,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
          borderBottom: "1px solid rgba(255,255,255,0.15)",
          paddingBottom: 4,
          letterSpacing: "-0.01em",
        }}
      >
        {prettyDate(label)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#ea580c", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span>●</span> Max Temp:
          </span>
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {data.temp_max.toFixed(1)} °C
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#cbd5e1", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span>●</span> Avg Temp:
          </span>
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {data.temp_avg.toFixed(1)} °C
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#38bdf8", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span>●</span> Min Temp:
          </span>
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {data.temp_min.toFixed(1)} °C
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#60a5fa", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span>💧</span> Humidity:
          </span>
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {data.humidity.toFixed(0)} %
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#a5b4fc", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span>🌧️</span> Rainfall:
          </span>
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {data.rainfall.toFixed(1)} mm
          </span>
        </div>
      </div>
    </div>
  );
}

export function WeatherHistoryPage() {
  const states = useFetch(getStates, []);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [location, setLocation] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [records, setRecords] = useState<WeatherRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [chartView, setChartView] = useState<ChartView>("temperature");

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

  // Strict useEffect data fetching with cancellation and zero render-time side effects
  useEffect(() => {
    if (!state) {
      setRecords([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchArchiveData() {
      setLoading(true);
      setError(null);
      try {
        const resp = await getWeatherHistory(state, FETCH_PAGE_SIZE, 0, district, location);
        if (!cancelled) {
          setRecords(resp.records);
          setTotal(resp.count);
          setPage(1);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchArchiveData();

    return () => {
      cancelled = true;
    };
  }, [state, district, location, retryKey]);

  async function loadMoreRecords() {
    if (loading || loadingMore || records.length >= total) return;
    setLoadingMore(true);
    setError(null);
    try {
      const resp = await getWeatherHistory(state, FETCH_PAGE_SIZE, records.length, district, location);
      setRecords((prev) => [...prev, ...resp.records]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function onStateChange(newState: string) {
    setState(newState);
    setDistrict("");
    setLocation("");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
    setPage(1);
  }

  function onDistrictChange(newDistrict: string) {
    setDistrict(newDistrict);
    setLocation("");
    setPage(1);
  }

  function onLocationChange(newLocation: string) {
    setLocation(newLocation);
    setPage(1);
  }

  function resetFilters() {
    setState("");
    setDistrict("");
    setLocation("");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
    setPage(1);
    setSortKey("date");
    setSortOrder("desc");
  }

  function applyDatePreset(days: number) {
    if (records.length === 0) return;
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const latestDateStr = sorted[0]?.date;
    if (!latestDateStr) return;
    const latest = new Date(latestDateStr + "T00:00:00Z");
    const past = new Date(latest);
    past.setUTCDate(past.getUTCDate() - days);
    const startIso = past.toISOString().slice(0, 10);
    setStartDate(startIso);
    setEndDate(latestDateStr);
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder(key === "date" ? "desc" : "desc");
    }
    setPage(1);
  }

  function renderSortIndicator(key: SortKey) {
    if (sortKey !== key) {
      return <span style={{ fontSize: 10, color: "var(--text-faint)", marginLeft: 4 }}>⇅</span>;
    }
    return (
      <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 4, fontWeight: 700 }}>
        {sortOrder === "asc" ? "▲" : "▼"}
      </span>
    );
  }

  // Filter records by date range and search query
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const dateMatch =
          r.date.toLowerCase().includes(q) || prettyDate(r.date).toLowerCase().includes(q);
        const stationMatch =
          (r.state && r.state.toLowerCase().includes(q)) ||
          (r.district && r.district.toLowerCase().includes(q)) ||
          (r.location && r.location.toLowerCase().includes(q));
        const remarksMatch =
          (r.rainfall > 0 && "rainfall rain wet showers precipitation".includes(q)) ||
          (r.rainfall === 0 && "dry sunny clear".includes(q)) ||
          (r.temp_avg >= 35 && "hot heat sunny".includes(q)) ||
          (r.temp_avg <= 15 && "cold chill winter cool".includes(q)) ||
          (r.humidity >= 80 && "humid overcast damp".includes(q));

        if (!dateMatch && !stationMatch && !remarksMatch) return false;
      }

      return true;
    });
  }, [records, startDate, endDate, searchQuery]);

  // Sort filtered records
  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      if (sortKey === "date") {
        return sortOrder === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      }
      if (sortKey === "wind_speed") {
        const aVal = (a as any).wind_speed ?? 0;
        const bVal = (b as any).wind_speed ?? 0;
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [filteredRecords, sortKey, sortOrder]);

  // Pagination calculation
  const totalFiltered = sortedRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = totalFiltered > 0 ? (safePage - 1) * pageSize : 0;
  const endIndex = Math.min(totalFiltered, startIndex + pageSize);
  const paginatedRows = sortedRecords.slice(startIndex, endIndex);

  // Chronological order for chart
  const chartData = useMemo(() => {
    return [...filteredRecords].sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredRecords]);

  // Summary statistics computed from genuine loaded records
  const loadedCount = filteredRecords.length;
  const meanAvgTemp =
    loadedCount > 0
      ? filteredRecords.reduce((acc, r) => acc + r.temp_avg, 0) / loadedCount
      : null;
  const meanMinTemp =
    loadedCount > 0
      ? filteredRecords.reduce((acc, r) => acc + r.temp_min, 0) / loadedCount
      : null;
  const meanMaxTemp =
    loadedCount > 0
      ? filteredRecords.reduce((acc, r) => acc + r.temp_max, 0) / loadedCount
      : null;
  const meanHumidity =
    loadedCount > 0
      ? filteredRecords.reduce((acc, r) => acc + r.humidity, 0) / loadedCount
      : null;
  const totalRainfall =
    loadedCount > 0 ? filteredRecords.reduce((acc, r) => acc + r.rainfall, 0) : null;
  const rainDaysCount =
    loadedCount > 0 ? filteredRecords.filter((r) => r.rainfall > 0.1).length : 0;

  const firstDate = chartData[0]?.date;
  const lastDate = chartData[chartData.length - 1]?.date;
  const dateSpanDays =
    firstDate && lastDate
      ? Math.round(
          (new Date(lastDate + "T00:00:00Z").getTime() -
            new Date(firstDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1
      : 0;

  const locSummary = location
    ? `${location}, ${district}, ${state}`
    : district
    ? `${district}, ${state}`
    : state || "India";

  return (
    <div className="page">
      {/* 1. Page Header */}
      <PageHead
        title="Weather History Archive"
        desc="Explore 46,834 locked meteorological observations stored across Indian states, districts, and stations in PostgreSQL."
        badge={<Badge variant="info">46,834 Locked Rows</Badge>}
      />

      {/* 2. Filter Toolbar inside enterprise .panel */}
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 className="panel-title">
              <SlidersIcon /> Query & Observation Filters
            </h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              • Cascading Geography, Date Range & Text Match
            </span>
          </div>
          <div className="panel-action">
            <button
              type="button"
              className="btn-outline"
              onClick={resetFilters}
              title="Reset all filters and restore initial state"
            >
              <RefreshIcon style={{ width: 13, height: 13 }} /> Reset Filters
            </button>
          </div>
        </div>

        {/* Row 1: Cascading Location Selectors */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 16,
          }}
        >
          {/* State Selector */}
          <label className="field" style={{ margin: 0 }}>
            <span>State</span>
            {states.loading ? (
              <Spinner label="Loading states…" />
            ) : states.error ? (
              <ErrorBanner message={states.error.message} />
            ) : (
              <select value={state} onChange={(e) => onStateChange(e.target.value)}>
                <option value="">Select an Indian state…</option>
                {states.data?.states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </label>

          {/* District Selector */}
          <label className="field" style={{ margin: 0 }}>
            <span>District {hasDistricts ? "" : "(State-level records)"}</span>
            {districtsFetch.loading ? (
              <Spinner label="Loading districts…" />
            ) : (
              <select
                value={district}
                onChange={(e) => onDistrictChange(e.target.value)}
                disabled={!state || !hasDistricts}
              >
                <option value="">
                  {hasDistricts ? "All districts (or choose specific)" : "No sub-districts in DB"}
                </option>
                {districtsFetch.data?.districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </label>

          {/* Location Station Selector */}
          <label className="field" style={{ margin: 0 }}>
            <span>Location Station</span>
            {locationsFetch.loading ? (
              <Spinner label="Loading stations…" />
            ) : (
              <select
                value={location}
                onChange={(e) => onLocationChange(e.target.value)}
                disabled={!district || !hasLocations}
              >
                <option value="">
                  {hasLocations ? "All stations (or choose specific)" : "No stations in district"}
                </option>
                {locationsFetch.data?.locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        {/* Row 2: Date Range & Search Input */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 14,
            alignItems: "flex-end",
          }}
        >
          {/* Start Date */}
          <label className="field" style={{ margin: 0 }}>
            <span>Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              disabled={!state}
            />
          </label>

          {/* End Date */}
          <label className="field" style={{ margin: 0 }}>
            <span>End Date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              disabled={!state}
            />
          </label>

          {/* Search Input */}
          <label className="field" style={{ margin: 0, gridColumn: "span 2" }}>
            <span>Search Observations</span>
            <div style={{ position: "relative", width: "100%" }}>
              <input
                type="search"
                placeholder="Filter by date (YYYY-MM), station, or remarks (e.g. rain, hot)…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                disabled={!state}
                style={{ paddingLeft: 34 }}
              />
              <SearchIcon
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 16,
                  height: 16,
                  color: "var(--text-muted)",
                  pointerEvents: "none",
                }}
              />
            </div>
          </label>
        </div>

        {/* Date presets and fetch-more status strip */}
        {state && records.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
              flexWrap: "wrap",
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Quick Window:</span>
            <button
              type="button"
              className="btn-outline"
              onClick={() => applyDatePreset(30)}
              style={{ padding: "3px 8px", fontSize: 11.5 }}
            >
              Past 30 Days
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => applyDatePreset(90)}
              style={{ padding: "3px 8px", fontSize: 11.5 }}
            >
              Past 90 Days
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => applyDatePreset(365)}
              style={{ padding: "3px 8px", fontSize: 11.5 }}
            >
              Past 1 Year
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setPage(1);
              }}
              style={{ padding: "3px 8px", fontSize: 11.5 }}
            >
              All Records
            </button>

            {records.length < total && (
              <button
                type="button"
                className="btn-secondary"
                onClick={loadMoreRecords}
                disabled={loadingMore}
                style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 11.5 }}
              >
                {loadingMore
                  ? "Loading older rows…"
                  : `Fetch Older Rows (${(total - records.length).toLocaleString()} remaining in DB)`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Explicit Loading, Error, and Empty States */}
      {loading && records.length === 0 && <Skeleton rows={6} />}
      {error && (
        <ErrorBanner
          message={error}
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      )}

      {!loading && !error && !state && (
        <EmptyNote
          title="Select a Weather Region"
          hint="Choose an Indian state from the filter toolbar above to load historical meteorological observations."
        />
      )}

      {!loading && !error && state && records.length === 0 && (
        <EmptyNote
          title="No Historical Observations"
          hint="The PostgreSQL database returned no historical measurements for this selection."
        />
      )}

      {/* 3. Summary Statistics Chips (.stat-chips) */}
      {records.length > 0 && (
        <div className="stat-chips" style={{ marginBottom: 20 }}>
          <StatChip
            icon={<DatabaseIcon />}
            label="Total Database Records"
            value={TOTAL_DB_RECORDS.toLocaleString()}
            sub="Locked PostgreSQL rows"
          />
          <StatChip
            icon={<ChartIcon />}
            label="Loaded Rows"
            value={loadedCount.toLocaleString()}
            sub={
              filteredRecords.length !== records.length
                ? `${records.length.toLocaleString()} rows in memory`
                : `${total.toLocaleString()} rows in DB`
            }
          />
          <StatChip
            icon={<ThermometerIcon />}
            label="Mean Avg Temp (°C)"
            value={meanAvgTemp != null ? `${meanAvgTemp.toFixed(1)} °C` : "—"}
            sub={
              meanMinTemp != null && meanMaxTemp != null
                ? `Diurnal: ${meanMinTemp.toFixed(1)}° – ${meanMaxTemp.toFixed(1)}°`
                : undefined
            }
          />
          <StatChip
            icon={<DropletIcon />}
            label="Mean Humidity (%)"
            value={meanHumidity != null ? `${meanHumidity.toFixed(0)} %` : "—"}
            sub="Relative air humidity"
          />
          <StatChip
            icon={<RainIcon />}
            label="Total Rainfall (mm)"
            value={totalRainfall != null ? `${totalRainfall.toFixed(1)} mm` : "—"}
            sub={`${rainDaysCount} rain days in window`}
          />
          <StatChip
            icon={<CalendarIcon />}
            label="Observation Date Range"
            value={firstDate && lastDate ? `${firstDate} → ${lastDate}` : "—"}
            sub={`${dateSpanDays} total calendar days`}
          />
        </div>
      )}

      {/* 4. Historical Trend Chart inside enterprise Card */}
      {records.length > 0 && chartData.length > 0 && (
        <Card
          title="Historical Meteorological Trend"
          subtitle={`Chronological observation timeline for ${locSummary} (${chartData.length.toLocaleString()} plotted points).`}
          icon={<ChartIcon />}
          action={
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                className={chartView === "temperature" ? "btn-primary" : "btn-outline"}
                onClick={() => setChartView("temperature")}
                style={{ padding: "4px 8px", fontSize: 11.5 }}
              >
                Temperature (°C)
              </button>
              <button
                type="button"
                className={chartView === "hydrology" ? "btn-primary" : "btn-outline"}
                onClick={() => setChartView("hydrology")}
                style={{ padding: "4px 8px", fontSize: 11.5 }}
              >
                Rainfall & Humidity
              </button>
              <button
                type="button"
                className={chartView === "combined" ? "btn-primary" : "btn-outline"}
                onClick={() => setChartView("combined")}
                style={{ padding: "4px 8px", fontSize: 11.5 }}
              >
                Combined View
              </button>
            </div>
          }
          className="chart-card"
        >
          <div style={{ height: 320, width: "100%", margin: "8px 0" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: chartView !== "temperature" ? 30 : 20, bottom: 5, left: 0 }}
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={shortDate}
                />

                {/* Primary Y Axis for Temperature (°C) or Humidity (%) */}
                {chartView === "temperature" && (
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    domain={["dataMin - 2", "dataMax + 2"]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    unit=" °C"
                  />
                )}

                {chartView === "hydrology" && (
                  <>
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      domain={[0, 100]}
                      unit=" %"
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      unit=" mm"
                    />
                  </>
                )}

                {chartView === "combined" && (
                  <>
                    <YAxis
                      yAxisId="temp"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      domain={["dataMin - 2", "dataMax + 2"]}
                      tickFormatter={(v: number) => v.toFixed(1)}
                      unit=" °C"
                    />
                    <YAxis
                      yAxisId="rain"
                      orientation="right"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      unit=" mm"
                    />
                  </>
                )}

                <Tooltip content={<WeatherChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

                {/* Temperature Series */}
                {(chartView === "temperature" || chartView === "combined") && (
                  <>
                    <Line
                      yAxisId={chartView === "combined" ? "temp" : undefined}
                      type="monotone"
                      dataKey="temp_max"
                      name="Observed Max Temp"
                      stroke="#ea580c"
                      strokeWidth={1.5}
                      dot={false}
                    />
                    <Line
                      yAxisId={chartView === "combined" ? "temp" : undefined}
                      type="monotone"
                      dataKey="temp_avg"
                      name="Observed Avg Temp"
                      stroke="#0f172a"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId={chartView === "combined" ? "temp" : undefined}
                      type="monotone"
                      dataKey="temp_min"
                      name="Observed Min Temp"
                      stroke="#0284c7"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </>
                )}

                {/* Hydrological Series */}
                {chartView === "hydrology" && (
                  <>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="humidity"
                      name="Relative Humidity"
                      stroke="#0284c7"
                      strokeWidth={1.8}
                      dot={false}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="rainfall"
                      name="Rainfall (mm)"
                      fill="#2563eb"
                      opacity={0.6}
                    />
                  </>
                )}

                {chartView === "combined" && (
                  <Bar
                    yAxisId="rain"
                    dataKey="rainfall"
                    name="Rainfall (mm)"
                    fill="#38bdf8"
                    opacity={0.4}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* 5. Structured Data Table wrapped inside .table-wrap */}
      {records.length > 0 && (
        <Card
          title="Structured Observation Archive"
          subtitle={`Tabular daily records for ${locSummary} (${totalFiltered.toLocaleString()} matching records). Sort columns or paginate below.`}
          icon={<DatabaseIcon />}
        >
          {filteredRecords.length === 0 ? (
            <EmptyNote
              title="No Records Match Current Filters"
              hint="Try clearing your search query or expanding the date range window."
              action={
                <button type="button" className="btn-secondary" onClick={resetFilters}>
                  Clear Search & Filters
                </button>
              }
            />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th
                        onClick={() => toggleSort("date")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") toggleSort("date");
                        }}
                      >
                        <div style={{ display: "inline-flex", alignItems: "center" }}>
                          <span>Date</span>
                          {renderSortIndicator("date")}
                        </div>
                      </th>
                      <th
                        className="num"
                        onClick={() => toggleSort("temp_max")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") toggleSort("temp_max");
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            width: "100%",
                          }}
                        >
                          <span>Temp Max (°C)</span>
                          {renderSortIndicator("temp_max")}
                        </div>
                      </th>
                      <th
                        className="num"
                        onClick={() => toggleSort("temp_avg")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") toggleSort("temp_avg");
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            width: "100%",
                          }}
                        >
                          <span>Temp Avg (°C)</span>
                          {renderSortIndicator("temp_avg")}
                        </div>
                      </th>
                      <th
                        className="num"
                        onClick={() => toggleSort("temp_min")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") toggleSort("temp_min");
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            width: "100%",
                          }}
                        >
                          <span>Temp Min (°C)</span>
                          {renderSortIndicator("temp_min")}
                        </div>
                      </th>
                      <th
                        className="num"
                        onClick={() => toggleSort("humidity")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") toggleSort("humidity");
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            width: "100%",
                          }}
                        >
                          <span>Humidity (%)</span>
                          {renderSortIndicator("humidity")}
                        </div>
                      </th>
                      <th
                        className="num"
                        onClick={() => toggleSort("rainfall")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") toggleSort("rainfall");
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            width: "100%",
                          }}
                        >
                          <span>Rainfall (mm)</span>
                          {renderSortIndicator("rainfall")}
                        </div>
                      </th>
                      <th
                        className="num"
                        onClick={() => toggleSort("wind_speed")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") toggleSort("wind_speed");
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            width: "100%",
                          }}
                        >
                          <span>Wind Speed</span>
                          {renderSortIndicator("wind_speed")}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((r) => (
                      <tr key={`${r.date}-${r.state}-${r.district || ""}-${r.location || ""}`}>
                        <td title={r.date}>{prettyDate(r.date)}</td>
                        <td className="num">{r.temp_max.toFixed(1)}</td>
                        <td className="num strong">{r.temp_avg.toFixed(1)}</td>
                        <td className="num">{r.temp_min.toFixed(1)}</td>
                        <td className="num">{r.humidity.toFixed(0)} %</td>
                        <td className="num">{r.rainfall.toFixed(1)}</td>
                        <td className="num" style={{ color: "var(--text-faint)" }}>
                          {(r as any).wind_speed != null
                            ? `${Number((r as any).wind_speed).toFixed(1)} km/h`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderTop: "1px solid var(--border-subtle)",
                  flexWrap: "wrap",
                  gap: 12,
                  background: "#f8fafc",
                }}
              >
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Showing <strong>{startIndex + 1}</strong> to <strong>{endIndex}</strong> of{" "}
                  <strong>{totalFiltered.toLocaleString()}</strong> records
                  {records.length < total && (
                    <span style={{ marginLeft: 8, color: "var(--text-muted)", fontSize: 12 }}>
                      ({records.length.toLocaleString()} of {total.toLocaleString()} rows in memory)
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12.5,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span>Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      style={{ width: "auto", padding: "4px 28px 4px 10px", fontSize: 12.5 }}
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>
                    Page {safePage} of {totalPages}
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      aria-label="Previous page"
                      style={{ padding: "6px 10px" }}
                    >
                      <ChevronLeftIcon style={{ width: 16, height: 16 }} />
                      <span>Previous</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      aria-label="Next page"
                      style={{ padding: "6px 10px" }}
                    >
                      <span>Next</span>
                      <ChevronRightIcon style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
