/**
 * Central API service - every backend call in the app goes through here.
 * Response shapes mirror backend/app/schemas.py (see types/api.ts).
 */
import type {
  HealthResponse,
  ModelInfoResponse,
  PredictionResponse,
  PredictionsResponse,
  StatesResponse,
  DistrictsResponse,
  LocationsResponse,
  WeatherResponse,
} from "../types/api";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || "/api").replace(/\/+$/, "");

/** Error carrying the backend's HTTP status and message (or a network failure). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    if (init?.signal?.aborted) throw new ApiError(0, "Request cancelled.");
    throw new ApiError(0, "Cannot reach the backend server. Is the FastAPI server running?");
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    let parsedBody = false;
    try {
      const body = await response.json() as { detail?: string | { msg?: unknown }[] };
      parsedBody = true;
      if (typeof body?.detail === "string") detail = body.detail;
      else if (Array.isArray(body?.detail)) {
        const messages = body.detail.map((item) => item?.msg).filter((msg) => typeof msg === "string");
        if (messages.length) detail = messages.join(". ");
      }
    } catch {
      /* keep status text */
    }
    if (response.status >= 500 && BASE_URL.startsWith("/") && !parsedBody) {
      detail = "The backend is unavailable or returned an invalid response. Check that FastAPI is running.";
    }
    throw new ApiError(response.status, detail);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new ApiError(response.status, "The backend returned an invalid response. Check the API URL.");
  }
}

// ---------------- GET /health ----------------
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

// ---------------- GET /states ----------------
export function getStates(): Promise<StatesResponse> {
  return request<StatesResponse>("/states");
}

// ---------------- GET /districts/{state} ----------------
export function getDistricts(state: string): Promise<DistrictsResponse> {
  return request<DistrictsResponse>(`/districts/${encodeURIComponent(state)}`);
}

// ---------------- GET /locations/{state}/{district} ----------------
export function getLocations(state: string, district: string): Promise<LocationsResponse> {
  return request<LocationsResponse>(
    `/locations/${encodeURIComponent(state)}/${encodeURIComponent(district)}`
  );
}

// ---------------- GET /weather/... ----------------
export function getWeatherHistory(
  state: string,
  limit = 100,
  offset = 0,
  district?: string,
  location?: string,
  filters: { startDate?: string; endDate?: string; signal?: AbortSignal } = {},
): Promise<WeatherResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters.startDate) params.set("start_date", filters.startDate);
  if (filters.endDate) params.set("end_date", filters.endDate);
  const parts = [state];
  if (district) {
    parts.push(district);
    if (location) parts.push(location);
  }
  const series = parts.map(encodeURIComponent).join("/");
  return request<WeatherResponse>(`/weather/${series}?${params}`, { signal: filters.signal });
}

export function getRecentWeather(
  state: string,
  days = 30,
  district?: string,
  location?: string
): Promise<WeatherResponse> {
  if (district && location) {
    return request<WeatherResponse>(
      `/weather/${encodeURIComponent(state)}/${encodeURIComponent(district)}/${encodeURIComponent(location)}/recent?days=${days}`
    );
  }
  return request<WeatherResponse>(
    `/weather/${encodeURIComponent(state)}/recent?days=${days}`,
  );
}

// ---------------- POST /predict ----------------
export function predict(
  state: string,
  forecastDate: string,
  district?: string,
  location?: string,
  previewRainfallCandidate = false
): Promise<PredictionResponse> {
  const body: Record<string, string | boolean> = { state, forecast_date: forecastDate };
  if (previewRainfallCandidate) body.preview_rainfall_candidate = true;
  if (district) body.district = district;
  if (location) body.location = location;

  return request<PredictionResponse>("/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------- GET /predictions?limit=&offset= ----------------
export function getPredictions(limit = 50, offset = 0,
  filters: { state?: string; modelVersion?: string; search?: string } = {},
): Promise<PredictionsResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (filters.state) params.set("state", filters.state);
  if (filters.modelVersion) params.set("model_version", filters.modelVersion);
  if (filters.search?.trim()) params.set("q", filters.search.trim());
  return request<PredictionsResponse>(`/predictions?${params}`);
}

// ---------------- GET /model-info ----------------
export function getModelInfo(): Promise<ModelInfoResponse> {
  return request<ModelInfoResponse>("/model-info", { cache: "no-store" });
}

// ---------------- GET /forecast/all?day=&date= ----------------
export function getForecastAll(
  dayOrDate?: number | string,
  date?: string
): Promise<Record<string, number>> {
  const params = new URLSearchParams();
  if (typeof dayOrDate === "number") {
    params.set("day", String(dayOrDate));
    if (date) params.set("date", date);
  } else if (typeof dayOrDate === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayOrDate)) {
      params.set("date", dayOrDate);
    } else if (!isNaN(Number(dayOrDate))) {
      params.set("day", dayOrDate);
    } else {
      params.set("date", dayOrDate);
    }
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<Record<string, number>>(`/forecast/all${query}`);
}
