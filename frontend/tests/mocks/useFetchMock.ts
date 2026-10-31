import {
  getMockModelInfo,
  getMockStates,
  getMockDistricts,
  getMockLocations,
  getMockWeatherHistory,
  getMockPredictions,
  getMockForecastAll,
} from "./apiFixtures";

let globalOverride: any = null;

export function setMockFetchOverride(override: any) {
  globalOverride = override;
}

export function resetMockFetchOverride() {
  globalOverride = null;
}

export function useFetch(fn: () => Promise<any>, deps: unknown[]) {
  if (globalOverride !== null) {
    if (typeof globalOverride === "function") {
      return globalOverride(fn, deps);
    }
    return globalOverride;
  }

  // Derive default mock based on function string
  const fnStr = fn.toString();
  if (fnStr.includes("getModelInfo")) {
    return { data: getMockModelInfo(), loading: false, error: null, retry: () => {} };
  }
  if (fnStr.includes("getStates")) {
    return { data: getMockStates(), loading: false, error: null, retry: () => {} };
  }
  if (fnStr.includes("getDistricts")) {
    return { data: getMockDistricts("Maharashtra"), loading: false, error: null, retry: () => {} };
  }
  if (fnStr.includes("getLocations")) {
    return { data: getMockLocations("Maharashtra", "Mumbai"), loading: false, error: null, retry: () => {} };
  }
  if (fnStr.includes("getPredictions")) {
    return { data: getMockPredictions(), loading: false, error: null, retry: () => {} };
  }
  if (fnStr.includes("getForecastAll")) {
    return { data: getMockForecastAll(), loading: false, error: null, retry: () => {} };
  }
  if (fnStr.includes("getWeatherHistory")) {
    return { data: getMockWeatherHistory(), loading: false, error: null, retry: () => {} };
  }

  return { data: null, loading: false, error: null, retry: () => {} };
}
