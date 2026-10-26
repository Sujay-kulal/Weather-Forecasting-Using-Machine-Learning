"""Offline unit coverage for all-India location search and source selection.

Every upstream response is mocked here.  Production calls still go only to
Open-Meteo, while tests verify that an exact selected coordinate flows through
to the relevant provider call.
"""
from __future__ import annotations

import os
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://invalid:invalid@127.0.0.1:1/weather_location_test",
)

from app.routes import location_weather, prediction  # noqa: E402
from app.schemas import LocationOption, LocationWeatherRequest, LocationWeatherResponse  # noqa: E402
from app.services import location_weather_service, open_meteo_service  # noqa: E402
from app.services.location_weather_service import DatabaseLocation  # noqa: E402


TODAY = date(2026, 10, 26)


def selected_location(
    *,
    name: str = "Bengaluru",
    district: str = "Bengaluru Urban",
    state: str = "Karnataka",
    latitude: float = 12.9716,
    longitude: float = 77.5946,
) -> LocationOption:
    return LocationOption(
        name=name,
        district=district,
        state=state,
        country="India",
        country_code="IN",
        latitude=latitude,
        longitude=longitude,
    )


def provider_weather(temperature: float = 28.5) -> open_meteo_service.ProviderWeather:
    return open_meteo_service.ProviderWeather(
        temperature=temperature,
        temperature_min=22.0,
        temperature_max=31.0,
        humidity=70.0,
        rainfall=1.2,
        wind_speed=9.0,
        weather_code=2,
        weather_description="Partly cloudy",
    )


class IndiaGeocodingTests(unittest.TestCase):
    def setUp(self):
        open_meteo_service.clear_geocode_cache()

    def test_search_keeps_duplicate_names_distinguishable_and_india_only(self):
        payload = {
            "results": [
                {
                    "name": "Rampur", "country": "India", "country_code": "IN",
                    "admin1": "Uttar Pradesh", "admin2": "Rampur",
                    "latitude": 28.8154, "longitude": 79.0250,
                },
                {
                    "name": "Rampur", "country": "India", "country_code": "IN",
                    "admin1": "Himachal Pradesh", "admin2": "Shimla",
                    "latitude": 31.1048, "longitude": 77.1734,
                },
                {
                    "name": "Rampur", "country": "United States", "country_code": "US",
                    "admin1": "California", "admin2": "Somewhere",
                    "latitude": 35.0, "longitude": -118.0,
                },
                {
                    "name": "Bad coordinates", "country": "India", "country_code": "IN",
                    "admin1": "Karnataka", "admin2": "Mysuru",
                    "latitude": 77.6, "longitude": 12.9,
                },
            ]
        }
        with patch.object(open_meteo_service, "_request_json", return_value=payload) as request_json:
            results = open_meteo_service.search_india_locations("Rampur")
            cached_results = open_meteo_service.search_india_locations("rampur")

        self.assertEqual(request_json.call_count, 1, "repeated queries should use the geocoding cache")
        self.assertEqual(len(results), 2)
        self.assertEqual([(item.name, item.state, item.district) for item in results], [
            ("Rampur", "Uttar Pradesh", "Rampur"),
            ("Rampur", "Himachal Pradesh", "Shimla"),
        ])
        self.assertEqual(results[0].latitude, 28.8154)
        self.assertEqual(results[1].longitude, 77.1734)
        self.assertEqual(cached_results, results)

    def test_short_query_does_not_call_provider(self):
        with patch.object(open_meteo_service, "_request_json") as request_json:
            self.assertEqual(open_meteo_service.search_india_locations("a"), [])
        request_json.assert_not_called()

    def test_exact_state_search_returns_explicit_state_scope(self):
        with patch.object(open_meteo_service, "_request_json") as request_json:
            results = open_meteo_service.search_india_locations("Karnataka")
        request_json.assert_not_called()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].scope, "state")
        self.assertEqual((results[0].name, results[0].state), ("Karnataka", "Karnataka"))
        self.assertEqual((results[0].latitude, results[0].longitude), (15.3173, 75.7139))

    def test_non_india_location_is_rejected_by_request_schema(self):
        with self.assertRaises(ValidationError):
            LocationOption(
                name="Kathmandu", state="Bagmati", country="Nepal", country_code="NP",
                latitude=27.7172, longitude=85.3240,
            )


class AutomaticSourceSelectionTests(unittest.TestCase):
    def test_city_candidate_never_inherits_its_state_history(self):
        city = selected_location()
        candidates = location_weather_service._candidate_database_locations(city)
        self.assertEqual(candidates, [("Karnataka", "Bengaluru Urban", "Bengaluru")])

        state = selected_location(
            name="Karnataka", district="", state="Karnataka", latitude=15.3173, longitude=75.7139
        )
        self.assertIn(("Karnataka", "", ""), location_weather_service._candidate_database_locations(state))

    def test_ml_ready_exact_location_returns_ml_prediction(self):
        selected = selected_location()
        target = TODAY + timedelta(days=1)
        expected = LocationWeatherResponse(
            location=selected,
            forecast_date=target,
            source="ML Prediction",
            temperature=27.1,
            forecast=[],
            model="saved-model",
        )
        identity = DatabaseLocation("Karnataka", "Bengaluru Urban", "Bengaluru")
        with patch.object(location_weather_service, "resolve_database_location", return_value=identity), patch.object(
            location_weather_service, "_try_ml_prediction", return_value=expected
        ) as predict_ml, patch.object(open_meteo_service, "fetch_forecast_weather") as provider:
            result = location_weather_service.lookup_location_weather(
                selected, target, MagicMock(), today=TODAY
            )

        self.assertEqual(result.source, "ML Prediction")
        self.assertEqual(result.temperature, 27.1)
        predict_ml.assert_called_once()
        provider.assert_not_called()

    def test_insufficient_ml_history_falls_back_using_selected_coordinates(self):
        selected = selected_location(latitude=11.0168, longitude=76.9558)
        target = TODAY + timedelta(days=2)
        identity = DatabaseLocation("Tamil Nadu", "Coimbatore", "Coimbatore")
        with patch.object(location_weather_service, "resolve_database_location", return_value=identity), patch.object(
            location_weather_service, "_try_ml_prediction", return_value=None
        ), patch.object(
            open_meteo_service, "fetch_forecast_weather", return_value=provider_weather(30.4)
        ) as forecast:
            result = location_weather_service.lookup_location_weather(
                selected, target, MagicMock(), today=TODAY
            )

        self.assertEqual(result.source, "Weather API Forecast")
        self.assertEqual(result.temperature, 30.4)
        forecast.assert_called_once_with(11.0168, 76.9558, target, today=TODAY)

    def test_past_date_uses_matching_database_observation_before_provider(self):
        selected = selected_location()
        target = TODAY - timedelta(days=9)
        observation = SimpleNamespace(
            temp_avg=25.4, temp_min=20.1, temp_max=31.8, humidity=63.0, rainfall=2.3
        )
        with patch.object(
            location_weather_service, "resolve_database_location",
            return_value=DatabaseLocation("Karnataka", "Bengaluru Urban", "Bengaluru"),
        ), patch.object(location_weather_service, "_observation_for_date", return_value=observation), patch.object(
            open_meteo_service, "fetch_historical_weather"
        ) as historical:
            result = location_weather_service.lookup_location_weather(
                selected, target, MagicMock(), today=TODAY
            )

        self.assertEqual(result.source, "Historical Observations")
        self.assertEqual(result.temperature, 25.4)
        historical.assert_not_called()

    def test_past_without_exact_db_history_uses_archive_at_selected_coordinates(self):
        selected = selected_location(latitude=22.5726, longitude=88.3639, state="West Bengal", district="Kolkata")
        target = TODAY - timedelta(days=5)
        with patch.object(location_weather_service, "resolve_database_location", return_value=None), patch.object(
            open_meteo_service, "fetch_historical_weather", return_value=provider_weather(29.0)
        ) as historical:
            result = location_weather_service.lookup_location_weather(
                selected, target, MagicMock(), today=TODAY
            )

        self.assertEqual(result.source, "Historical Observations")
        historical.assert_called_once_with(22.5726, 88.3639, target)

    def test_current_date_always_uses_current_conditions_not_ml(self):
        selected = selected_location()
        with patch.object(location_weather_service, "resolve_database_location") as resolve_db, patch.object(
            open_meteo_service, "fetch_current_weather", return_value=provider_weather(26.8)
        ) as current:
            result = location_weather_service.lookup_location_weather(
                selected, TODAY, MagicMock(), today=TODAY
            )

        self.assertEqual(result.source, "Current Weather")
        self.assertEqual(result.temperature, 26.8)
        current.assert_called_once_with(12.9716, 77.5946)
        resolve_db.assert_not_called()

    def test_unsupported_future_date_has_no_invented_forecast(self):
        selected = selected_location()
        target = TODAY + timedelta(days=open_meteo_service.MAX_FORECAST_DAYS + 1)
        with patch.object(location_weather_service, "resolve_database_location", return_value=None):
            with self.assertRaises(open_meteo_service.UnsupportedForecastDate):
                location_weather_service.lookup_location_weather(
                    selected, target, MagicMock(), today=TODAY
                )

    def test_provider_failure_bubbles_to_route_as_502(self):
        selected = selected_location()
        payload = LocationWeatherRequest(location=selected, forecast_date=TODAY)
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(pipeline=None)))
        with patch.object(
            location_weather_service,
            "lookup_location_weather",
            side_effect=open_meteo_service.WeatherProviderUnavailable("network down"),
        ):
            with self.assertRaises(HTTPException) as raised:
                location_weather.lookup_weather(payload, request, MagicMock())

        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn("network down", raised.exception.detail)


class ExistingMlContractTests(unittest.TestCase):
    def test_legacy_state_prediction_route_is_still_registered(self):
        paths = {route.path for route in prediction.router.routes}
        self.assertIn("/predict", paths)
        self.assertIn("/forecast/all", paths)


if __name__ == "__main__":
    unittest.main(verbosity=2)
