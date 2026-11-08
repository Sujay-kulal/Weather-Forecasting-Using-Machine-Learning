# Coding Conventions

**Analysis Date:** 2026-11-08

## Naming Patterns

**Files & Directories:**
- Python backend modules: `snake_case.py` (e.g., `model_service.py`, `location_weather.py`)
- Python tests: `test_*.py` in `backend/tests/` (e.g., `test_consistency.py`, `test_no_leakage.py`)
- React components and pages: `PascalCase.tsx` (e.g., `ForecastPage.tsx`, `IndiaMap.tsx`)
- TypeScript utilities and services: `camelCase.ts` (e.g., `api.ts`, `cityWeather.ts`)
- TypeScript types: `camelCase.ts` or `PascalCase.ts` (e.g., `frontend/src/types/api.ts`)

**Python Code (Backend & ML):**
- Classes: `PascalCase` (e.g., `WeatherRecord`, `LocationWeatherService`, `ModelService`)
- Functions & Methods: `snake_case` (e.g., `get_weather_prediction`, `calculate_features`)
- Variables: `snake_case` (e.g., `current_temp`, `forecast_days`)
- Constants & Environment Variables: `UPPER_SNAKE_CASE` (e.g., `DATABASE_URL`, `DEFAULT_CACHE_TTL`)
- Pydantic Schemas: `PascalCase` with semantic suffixes (e.g., `WeatherPredictionRequest`, `PredictionResponse`)

**TypeScript Code (Frontend):**
- React Components: `PascalCase` (e.g., `IndiaMap`, `ForecastView`, `MetricCard`)
- Custom Hooks: `useCamelCase` (e.g., `useFetch`, `useHealth`)
- Functions & Handlers: `camelCase` (e.g., `fetchForecast`, `handleLocationSelect`)
- Interfaces & Types: `PascalCase` (e.g., `WeatherData`, `ModelMetrics`, `LocationCoordinate`)

## Code Style & Formatting

**Backend (Python):**
- Style Guide: PEP 8 compliant.
- Type Annotations: Full type hinting across all function arguments and return values (`def predict(features: pd.DataFrame) -> List[float]:`).
- Pydantic Validation: Explicit Pydantic v2 schemas using `model_config = ConfigDict(from_attributes=True)` for seamless SQLAlchemy ORM mapping.
- Dependency Injection: FastAPI `Depends(get_db)` pattern for database session lifecycles.
- Error Handling:
  - Avoid bare `except:`. Always catch specific exceptions (e.g., `HTTPError`, `ValueError`, `SQLAlchemyError`).
  - Raise explicit `HTTPException(status_code=4xx/5xx, detail="...")` with actionable error messages.
- Logging: Use Python's standard `logging.getLogger(__name__)` instead of `print()` in production services.

**Frontend (TypeScript/React):**
- TypeScript Settings: Strict mode enabled (`"strict": true` in `tsconfig.json`).
- Component Structure: Functional components with explicit typing:
  ```tsx
  interface LocationCardProps {
    city: string;
    temperature: number;
    onSelect: (city: string) => void;
  }
  export const LocationCard: React.FC<LocationCardProps> = ({ city, temperature, onSelect }) => { ... };
  ```
- State Management: React built-in hooks (`useState`, `useEffect`, `useCallback`, `useMemo`) for local state; centralized API methods in `frontend/src/services/api.ts`.
- Styling: Semantic CSS classes in `frontend/src/styles.css` with CSS custom properties (variables) for dark and light theme switching.

---

*Conventions analysis: 2026-11-08*
*Update after style changes or linting updates*
