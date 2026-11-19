# Weather Forecasting Frontend

React, TypeScript, and Vite interface for the state-level seven-day temperature
forecasting API. The saved model accepts 20 engineered features. Weather history,
model metadata, and prediction history come from the FastAPI backend. The map
draws state forecasts and shows current city conditions from Open-Meteo.

## Run locally

```bash
cd frontend
npm ci
npm run dev
```

The default `/api` uses the local Vite proxy or the Compose Nginx proxy.
When building for Vercel, set `VITE_API_BASE_URL` to the Render API origin.

The production build and TypeScript check are available with:

```bash
npm run build
npx tsc --noEmit -p tsconfig.json
```

## Pages and Data

- **Forecast:** Select a state and date; a valid forecast request writes an
  audit record to PostgreSQL.
- **Weather History:** Reads weather measurements from the backend.
- **Model Performance:** Shows model metadata and historical scores with their
  validation status.
- **ML Project Overview:** Documents features, forecast timing and the recorded training cutoff.
- **Prediction History:** Reads stored predictions from PostgreSQL.
- **India Map:** Combines backend state-level ML forecasts with the separate
  Open-Meteo city-observation layer.

The forecast form and map start two days after their latest available weather
record. LightGBM produces average temperatures. The forecast page labels other
weather indicators as rule-based estimates and only shows them when the backend
supplies them. The performance page displays missing metrics as unavailable.

`npm test` exercises components and API clients. For the live browser suite,
build the frontend, set `WEATHER_TEST_DATABASE_URL` to a disposable local database
with recent weather, then run `npm run test:browser`. See the root README for setup.

The frontend is a single-page application with tab navigation; a browser refresh
returns to the Forecast page.
