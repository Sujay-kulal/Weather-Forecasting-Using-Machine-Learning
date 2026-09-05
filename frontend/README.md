# Weather Forecasting System — Frontend

React + Vite + TypeScript frontend for the Weather Forecasting Using Machine
Learning project. It talks **only** to the Phase 2 FastAPI backend — every
displayed value (states, weather history, predictions, metrics) comes from
PostgreSQL / the trained model through the API. There is no mock data.

## Run

```bash
cd frontend
npm install
copy .env.example .env      # optional; defaults to http://localhost:8000
npm run dev                 # http://localhost:5173
```

The backend must be running (see `backend/README.md`): `uvicorn app.main:app --port 8000`.

Production build: `npm run build` (TypeScript check + Vite build), preview with `npm run preview`.

## Configuration

`VITE_API_BASE_URL` — backend base URL (default `http://localhost:8000`, matches the
backend's CORS allow-list for `localhost:5173` / `localhost:3000`).

## Structure

```
src/
├── components/ui.tsx        # Card, Spinner, ErrorBanner, EmptyNote
├── pages/
│   ├── ForecastPage.tsx     # state+date → POST /predict → result + context chart
│   ├── WeatherHistoryPage.tsx  # GET /weather/{state} table + chart, "Load older data"
│   ├── ModelPerformancePage.tsx# GET /model-info metrics, comparison, feature groups
│   └── PredictionHistoryPage.tsx# GET /predictions table with filter/paging
├── services/api.ts          # the ONLY place that calls fetch(); typed, central
├── hooks/                   # useFetch (loading/error/data), useHealth (header dot)
├── types/api.ts             # mirrors backend Pydantic schemas exactly
├── App.tsx                  # header, tab navigation, health indicator
├── main.tsx
└── styles.css               # design tokens + layout + responsive rules
```

## Notes

- The forecast date defaults to (latest available measurement + 1) as a convenience;
  the backend remains the sole validator — rejected dates show the backend's reason.
- The prediction-history table shows no per-row model column because the backend's
  `predictions` table does not store one; the model name is shown once from `/model-info`.
- The historical chart on the Forecast page is context only; actual lag/rolling/seasonal
  feature engineering happens inside the backend.
