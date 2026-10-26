# Weather Forecasting Frontend

React, TypeScript, and Vite interface for the state-level seven-day temperature
forecasting API. The saved model accepts 20 engineered features. Weather history,
model metadata, and prediction history come from the FastAPI backend. The map's
city markers are separate live-weather observations fetched directly from
Open-Meteo; they are not ML predictions.

## Run locally

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_BASE_URL` to the backend URL if needed. With the development
proxy, use `/api`. For production builds, the frontend container's Nginx
configuration proxies `/api/` to FastAPI.

The production build and TypeScript check are available with:

```bash
npm run build
npx tsc --noEmit -p tsconfig.json
```

## Pages and data

- **Forecast:** Select a state and date; a valid forecast request writes an
  audit record to PostgreSQL.
- **Weather History:** Reads weather measurements from the backend.
- **Model Performance:** Shows model metadata and historical scores with their
  validation status.
- **Prediction History:** Reads stored predictions from PostgreSQL.
- **India Map:** Combines backend state-level ML forecasts with the separate
  Open-Meteo city-observation layer.

The forecast date defaults to two days after the newest measurement. This lets
the existing model's lagged feature contract include that newest observation.
The API omits prediction bounds unless metadata validates calibration for the
currently loaded artifact.

The frontend is a single-page application with tab navigation; a browser refresh
returns to the Forecast page.
