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

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

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
    throw new ApiError(0, "Cannot reach the backend server. Is the FastAPI server running?");
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep status text */
    }
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
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
  location?: string
): Promise<WeatherResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (district && location) {
    return request<WeatherResponse>(
      `/weather/${encodeURIComponent(state)}/${encodeURIComponent(district)}/${encodeURIComponent(location)}?${params}`
    );
  }
  return request<WeatherResponse>(`/weather/${encodeURIComponent(state)}?${params}`);
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
  location?: string
): Promise<PredictionResponse> {
  const body: any = { state, forecast_date: forecastDate };
  if (district) body.district = district;
  if (location) body.location = location;

  return request<PredictionResponse>("/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------- GET /predictions?limit=&offset= ----------------
export function getPredictions(limit = 50, offset = 0): Promise<PredictionsResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request<PredictionsResponse>(`/predictions?${params}`);
}

// ---------------- GET /model-info ----------------
export function getModelInfo(): Promise<ModelInfoResponse> {
  return request<ModelInfoResponse>("/model-info");
}
