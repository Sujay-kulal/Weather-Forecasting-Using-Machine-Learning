/**
 * Types mirroring the Phase 2 Pydantic response schemas (backend/app/schemas.py).
 * Every field is verified against the live API — nothing invented.
 */

export interface HealthResponse {
  status: string;
  database: string;
  model_loaded: boolean;
}

export interface StatesResponse {
  states: string[];
}

export interface DistrictsResponse {
  districts: string[];
}

export interface LocationsResponse {
  locations: string[];
}

export type LocationScope = "place" | "district" | "state";

/** A concrete India location selected from backend geocoding. */
export interface LocationOption {
  name: string;
  district: string;
  state: string;
  country: string;
  country_code: "IN";
  latitude: number;
  longitude: number;
  scope: LocationScope;
  geoname_id?: number | null;
}

export interface LocationSearchResponse {
  locations: LocationOption[];
}

export interface WeatherDay {
  date: string;
  temperature: number;
}

/** A normalized, accurately labelled result from ML or Open-Meteo. */
export interface LocationWeatherResponse {
  location: LocationOption;
  forecast_date: string;
  source: "ML Prediction" | "Historical Observations" | "Historical Reanalysis" | "Current Weather" | "Weather API Forecast";
  temperature: number;
  temperature_min?: number | null;
  temperature_max?: number | null;
  humidity?: number | null;
  rainfall?: number | null;
  wind_speed?: number | null;
  weather_code?: number | null;
  weather_description?: string | null;
  forecast: WeatherDay[];
  model?: string | null;
  last_known?: LastKnown | null;
  message?: string | null;
}

export interface WeatherRecord {
  date: string; // YYYY-MM-DD
  state: string;
  district?: string;
  location?: string;
  temp_max: number;
  temp_min: number;
  temp_avg: number;
  humidity: number;
  rainfall: number;
}

export interface WeatherResponse {
  state: string;
  district?: string;
  location?: string;
  count: number;
  records: WeatherRecord[];
}

export interface LastKnown {
  date: string;
  temp_avg: number;
  temp_min?: number | null;
  temp_max?: number | null;
  humidity?: number | null;
  rainfall?: number | null;
}

export interface DayForecast {
  day: number;
  date: string;
  temp_avg: number;
  temp_min: number;
  temp_max: number;
  feels_like: number;
  humidity: number;
  rainfall: number;
  rain_probability: number;
  condition: string;
  condition_icon: string;
  comfort: string;
  dew_point: number;
  summary: string;
}

export interface PredictionResponse {
  state: string;
  district?: string;
  location?: string;
  forecast_date: string;
  predicted_temp_avg: number[];
  temp_lo?: number[] | null;
  temp_hi?: number[] | null;
  interval_status?: string;
  unit: string;
  model: string;
  typical_error_mae?: number | null;
  last_known?: LastKnown | null;
  daily_forecasts?: DayForecast[];
  weather_summary?: string;
}

export interface PredictionRecord {
  id: number;
  state: string;
  district?: string;
  location?: string;
  forecast_date: string;
  predicted_temp_avg: number[];
  created_at: string;
}

export interface PredictionsResponse {
  count: number; // NOTE: page size, not total (backend limitation)
  predictions: PredictionRecord[];
}

export interface ModelMetrics {
  MAE: number;
  RMSE: number;
  R2: number;
}

export interface ModelInfoResponse {
  model_name: string;
  target: string;
  features: string[];
  metrics: Record<string, ModelMetrics>;
  train_period: string[];
  test_period: string[];
  trained_through?: string;
  q?: number;
  coverage_90?: number;
  metrics_status?: string;
  interval_status?: string;
  evaluation_note?: string;
}
