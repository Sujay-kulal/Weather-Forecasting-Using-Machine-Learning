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

// ---------------- GET /weather/{state}?limit=&offset= ----------------
export function getWeatherHistory(
  state: string,
  limit = 100,
  offset = 0,
): Promise<WeatherResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request<WeatherResponse>(`/weather/${encodeURIComponent(state)}?${params}`);
}

// ---------------- GET /weather/{state}/recent?days= ----------------
export function getRecentWeather(state: string, days = 30): Promise<WeatherResponse> {
  return request<WeatherResponse>(
    `/weather/${encodeURIComponent(state)}/recent?days=${days}`,
  );
}

// ---------------- POST /predict ----------------
export function predict(state: string, forecastDate: string): Promise<PredictionResponse> {
  return request<PredictionResponse>("/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, forecast_date: forecastDate }),
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
