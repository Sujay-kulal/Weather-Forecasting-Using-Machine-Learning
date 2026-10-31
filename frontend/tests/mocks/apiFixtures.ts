import type {
  HealthResponse,
  ModelInfoResponse,
  PredictionRecord,
  PredictionResponse,
  PredictionsResponse,
  StatesResponse,
  WeatherRecord,
  WeatherResponse,
} from "../../src/types/api";

export const SAMPLE_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
];

export function getMockStates(): StatesResponse {
  return { states: SAMPLE_STATES };
}

export function getMockDistricts(state: string) {
  if (state === "Maharashtra") {
    return { districts: ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane"] };
  }
  if (state === "Karnataka") {
    return { districts: ["Bengaluru Urban", "Mysuru", "Hubballi-Dharwad", "Mangaluru", "Belagavi"] };
  }
  return { districts: [`${state} Central`, `${state} North`, `${state} South`] };
}

export function getMockLocations(state: string, district: string) {
  return {
    locations: [
      `${district} Observatory`,
      `${district} Airport AWS`,
      `${district} Downtown Station`,
    ],
  };
}

export function getMockModelInfo(): ModelInfoResponse {
  return {
    model_name: "LightGBM",
    target: "next 7 days Temp_Avg (deg C)",
    features: [
      "lag1_temp_avg",
      "lag2_temp_avg",
      "lag3_temp_avg",
      "lag1_temp_max",
      "lag1_temp_min",
      "lag1_humidity",
      "lag1_rainfall",
      "lag2_humidity",
      "lag2_rainfall",
      "roll3_temp_avg",
      "roll7_temp_avg",
      "rainfall_roll3",
      "rainfall_roll7",
      "temp_range",
      "month_sin",
      "month_cos",
      "day_of_year_sin",
      "day_of_year_cos",
      "Season",
      "State",
    ],
    train_period: ["2015-01-08", "2025-07-11"],
    test_period: ["2025-10-19", "2026-10-18"],
    trained_through: "2025-07-11",
    q: 1.45,
    coverage_90: 91.2,
    metrics_status: "artifact_evaluated_training_overlap",
    interval_status: "not_calibrated_for_current_artifact",
    evaluation_note: "Historical metrics evaluated on held-out test horizon with temporal embargo.",
    metrics: {
      LightGBM: { MAE: 1.164, RMSE: 1.573, R2: 0.97 },
      Climatology: { MAE: 1.395, RMSE: 1.852, R2: 0.958 },
      Persistence: { MAE: 1.439, RMSE: 1.984, R2: 0.952 },
      RandomForest: { MAE: 1.282, RMSE: 1.714, R2: 0.964 },
      LinearRegression: { MAE: 1.41, RMSE: 1.895, R2: 0.956 },
    },
  };
}

export function getMockForecastAll(day: number = 1): Record<string, number> {
  const result: Record<string, number> = {};
  for (const s of SAMPLE_STATES) {
    result[s] = 24.5 + (s.length % 8) + day * 0.4;
  }
  return result;
}

export function getMockWeatherRecords(count: number = 30): WeatherRecord[] {
  const records: WeatherRecord[] = [];
  const baseDate = new Date("2026-10-30T00:00:00Z");

  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const avg = 26.5 + Math.sin(i * 0.3) * 4;
    records.push({
      date: dateStr,
      state: "Maharashtra",
      district: "Mumbai",
      location: "Mumbai Observatory",
      temp_max: Number((avg + 4.2).toFixed(1)),
      temp_avg: Number(avg.toFixed(1)),
      temp_min: Number((avg - 4.1).toFixed(1)),
      humidity: Math.round(65 + Math.cos(i * 0.4) * 15),
      rainfall: Number((Math.max(0, Math.sin(i * 0.5) * 8)).toFixed(1)),
    });
  }
  return records;
}

export function getMockWeatherHistory(count: number = 30): WeatherResponse {
  const records = getMockWeatherRecords(count);
  return {
    state: "Maharashtra",
    district: "Mumbai",
    location: "Mumbai Observatory",
    count: records.length,
    records,
  };
}

export function getMockPredictions(count: number = 20): PredictionsResponse {
  const predictions: PredictionRecord[] = [];
  const baseDate = new Date("2026-10-30T12:00:00Z");

  for (let i = 1; i <= count; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() - i);
    predictions.push({
      id: 1000 + i,
      state: SAMPLE_STATES[i % SAMPLE_STATES.length],
      district: "Capital District",
      location: "Primary Observatory",
      forecast_date: d.toISOString().slice(0, 10),
      predicted_temp_avg: [25.4, 26.1, 26.8, 27.2, 26.5, 25.9, 25.1],
      created_at: d.toISOString(),
    });
  }

  return {
    count: predictions.length,
    predictions,
  };
}

export function getMockPredictionResponse(): PredictionResponse {
  return {
    state: "Maharashtra",
    district: "Mumbai",
    location: "Mumbai Observatory",
    forecast_date: "2026-10-31",
    predicted_temp_avg: [27.2, 27.5, 27.9, 28.1, 27.8, 27.4, 27.0],
    temp_lo: [25.4, 25.7, 26.1, 26.3, 26.0, 25.6, 25.2],
    temp_hi: [29.0, 29.3, 29.7, 29.9, 29.6, 29.2, 28.8],
    interval_status: "calibrated",
    unit: "celsius",
    model: "LightGBM v3",
    typical_error_mae: 1.16,
    daily_forecasts: [
      {
        day: 1,
        date: "2026-10-31",
        temp_avg: 27.2,
        temp_min: 23.1,
        temp_max: 31.3,
        feels_like: 28.4,
        humidity: 62,
        rainfall: 0.0,
        rain_probability: 5,
        condition: "Sunny / Clear",
        condition_icon: "sun",
        comfort: "Comfortable",
        dew_point: 19.4,
        summary: "Pleasant sunshine with mild sea breeze",
      },
      {
        day: 2,
        date: "2026-11-01",
        temp_avg: 27.5,
        temp_min: 23.4,
        temp_max: 31.6,
        feels_like: 28.8,
        humidity: 64,
        rainfall: 0.0,
        rain_probability: 10,
        condition: "Partly Cloudy",
        condition_icon: "cloud-sun",
        comfort: "Comfortable",
        dew_point: 19.8,
        summary: "Scattered clouds with stable temperatures",
      },
    ],
    weather_summary: "Stable synoptic conditions with moderate daytime temperatures across the region.",
  };
}

export function getMockHealth(): HealthResponse {
  return {
    status: "ok",
    database: "connected",
    model_loaded: true,
  };
}
