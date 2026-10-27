import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PredictionResponse, WeatherRecord } from "../types/api";

interface ForecastWeatherChartProps {
  records: WeatherRecord[];
  result: PredictionResponse | null;
  locationLabel: string;
}

interface ChartRow {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_avg: number | null;
  predicted: number | null;
  ci_band?: [number, number] | null;
}

export function ForecastWeatherChart({ records, result, locationLabel }: ForecastWeatherChartProps) {
  const rows: ChartRow[] = records.map((record) => ({
    date: record.date,
    temp_max: record.temp_max,
    temp_min: record.temp_min,
    temp_avg: record.temp_avg,
    predicted: null,
  }));

  if (result && rows.length > 0) {
    rows[rows.length - 1].predicted = rows[rows.length - 1].temp_avg;
    let currentDate = result.forecast_date;
    result.predicted_temp_avg.forEach((prediction, index) => {
      const lo = result.temp_lo?.[index] ?? null;
      const hi = result.temp_hi?.[index] ?? null;
      rows.push({
        date: currentDate,
        temp_max: null,
        temp_min: null,
        temp_avg: null,
        predicted: Number(prediction),
        ci_band:
          result.interval_status === "calibrated_for_current_artifact" && lo !== null && hi !== null
            ? [lo, hi]
            : null,
      });
      currentDate = nextDay(currentDate);
    });
  }

  return (
    <>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={rows} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#e7edf4" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5a6b82" }} tickFormatter={shortDate} />
            <YAxis
              tick={{ fontSize: 11, fill: "#5a6b82" }}
              domain={["dataMin - 2", "dataMax + 2"]}
              tickFormatter={(value: number) => value.toFixed(1)}
              unit=" °C"
            />
            <Tooltip labelFormatter={fullDate} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="temp_max" name="Temp Max" stroke="#f26522" strokeWidth={1.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="temp_avg" name="Temp Avg" stroke="#1b1b2f" strokeWidth={2.2} dot={false} connectNulls />
            <Line type="monotone" dataKey="temp_min" name="Temp Min" stroke="#4a90d9" strokeWidth={1.5} dot={false} connectNulls />
            {result?.interval_status === "calibrated_for_current_artifact" && (
              <Area type="monotone" dataKey="ci_band" name="Calibrated interval" stroke="none" fill="#f26522" fillOpacity={0.15} connectNulls />
            )}
            {result && (
              <Line
                type="monotone"
                dataKey="predicted"
                name="Predicted"
                stroke="#f26522"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 4, fill: "#f26522", stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-note">
        The most recent {records.length} daily measurements for {locationLabel} (real PostgreSQL data), {result ? "with the generated forecast appended." : "from the backend."}
      </p>
      {result && result.interval_status !== "calibrated_for_current_artifact" && (
        <p className="chart-note subtle" role="status">
          Prediction interval bounds are hidden because this model artifact has no verified calibration.
        </p>
      )}
      <p className="chart-note subtle">
        Note: the model does not read this chart. The backend performs the actual feature engineering (lag features, rolling averages, seasonal encoding) on recent measurements before every prediction.
      </p>
    </>
  );
}

function nextDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  return iso.slice(5);
}

function fullDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
