"""
Weather Forecast Service - computes comprehensive multi-parameter forecasts:
- Temperature (Average, Min, Max, Range)
- Apparent Temperature (Feels Like)
- Humidity (%)
- Rainfall (mm) & Rain Probability (%)
- Dew Point (°C)
- Weather Condition (Icon, Status, Summary)
- Comfort Index & Daily Highlights
"""
import math
from datetime import date as date_type, timedelta
from typing import List, Tuple

from app.models import WeatherData
from app.schemas import DayForecast
from app.services.temperature import round_temperature


def calculate_feels_like(temp: float, humidity: float) -> float:
    """
    Robert Steadman / Australian Apparent Temperature formula:
    e = (humidity / 100) * 6.105 * exp((17.27 * temp) / (237.7 + temp))
    AT = temp + 0.33 * e - 4.0
    """
    if temp < 10.0:
        return round_temperature(temp - (100.0 - humidity) * 0.015, 1)
    e = (humidity / 100.0) * 6.105 * math.exp((17.27 * temp) / (237.7 + temp))
    apparent = temp + 0.33 * e - 4.0
    return round_temperature(apparent, 1)


def calculate_dew_point(temp: float, humidity: float) -> float:
    """Magnus-Tetens approximation for dew point."""
    hum = max(1.0, min(100.0, humidity))
    dew = temp - ((100.0 - hum) / 5.0)
    return round_temperature(dew, 1)


def determine_condition(
    rainfall: float,
    rain_prob: int,
    humidity: float,
    temp_max: float,
    temp_min: float,
) -> Tuple[str, str]:
    """
    Returns (condition_label, condition_icon)
    """
    if rainfall >= 12.0 or (rainfall >= 6.0 and rain_prob >= 70):
        cond = "Heavy Rain"
        icon = "rain-storm"
    elif rainfall >= 2.0 or rain_prob >= 50:
        cond = "Rain / Showers"
        icon = "rain"
    elif rainfall >= 0.3 or rain_prob >= 35:
        cond = "Light Rain / Drizzle"
        icon = "rain-light"
    elif humidity >= 78.0:
        cond = "Overcast"
        icon = "cloud"
    elif humidity >= 60.0:
        cond = "Partly Cloudy"
        icon = "cloud-sun"
    elif temp_max >= 38.0:
        cond = "Hot & Sunny"
        icon = "sun-hot"
    elif temp_min <= 10.0:
        cond = "Cold & Clear"
        icon = "snowflake"
    else:
        cond = "Clear & Sunny"
        icon = "sun"
    return cond, icon


def determine_comfort(feels_like: float, humidity: float) -> str:
    if feels_like < 14.0:
        return "Cool & Crisp"
    if feels_like <= 24.0 and humidity <= 65:
        return "Pleasant & Comfortable"
    if feels_like <= 29.0:
        return "Warm & Moderate"
    if feels_like <= 35.0:
        return "Humid & Sticky"
    if feels_like <= 40.0:
        return "Very Hot / Muggy"
    return "Extreme Heat Alert"


def generate_day_summary(
    condition: str,
    temp_min: float,
    temp_max: float,
    humidity: float,
    rain_prob: int,
) -> str:
    parts = []
    if rain_prob >= 60:
        parts.append(f"high probability of rain ({rain_prob}%)")
    elif rain_prob >= 35:
        parts.append(f"scattered showers possible ({rain_prob}%)")
    else:
        parts.append(f"dry conditions ({rain_prob}% rain chance)")

    if temp_max >= 36.0:
        parts.append("elevated afternoon heat")
    elif temp_min <= 13.0:
        parts.append("cool morning lows")

    if humidity >= 75.0:
        parts.append("humid air")
    elif humidity <= 35.0:
        parts.append("low humidity")

    advisory = ", ".join(parts)
    return f"{condition} expected. High of {temp_max:.1f}°C, low of {temp_min:.1f}°C with {advisory}."


def build_daily_forecasts(
    history: List[WeatherData],
    forecast_date: date_type,
    predicted_temp_avg: List[float],
) -> Tuple[List[DayForecast], str]:
    """
    Build multi-parameter forecasts for each horizon day (1..7).
    """
    recent_ranges = [
        h.temp_max - h.temp_min
        for h in history[:7]
        if h.temp_max is not None and h.temp_min is not None and h.temp_max >= h.temp_min
    ]
    base_range = (sum(recent_ranges) / len(recent_ranges)) if recent_ranges else 9.5
    base_range = max(5.0, min(18.0, base_range))

    recent_hums = [
        h.humidity for h in history[:7] if h.humidity is not None
    ]
    base_hum = (sum(recent_hums[:3]) / len(recent_hums[:3])) if recent_hums else 60.0
    base_hum = max(20.0, min(95.0, base_hum))

    recent_rains = [
        h.rainfall for h in history[:7] if h.rainfall is not None
    ]
    recent_rain_mean = (sum(recent_rains[:3]) / len(recent_rains[:3])) if recent_rains else 0.0

    last_temp = history[0].temp_avg if (history and history[0].temp_avg is not None) else predicted_temp_avg[0]

    daily_forecasts = []
    for i, t_avg in enumerate(predicted_temp_avg):
        cur_date = forecast_date + timedelta(days=i)
        t_avg_val = round_temperature(float(t_avg), 1)

        t_shift = t_avg_val - last_temp
        hum_val = base_hum - t_shift * 1.1
        hum_val = max(18.0, min(96.0, round(hum_val, 1)))

        if recent_rain_mean > 0.5 or hum_val >= 70.0:
            rain_prob_base = 30 if recent_rain_mean <= 0.5 else 55
            rain_prob = int(min(95, max(10, rain_prob_base + (hum_val - 65.0) * 1.2 - i * 2)))
            rainfall_val = round(max(0.0, recent_rain_mean * 0.7 + max(0.0, hum_val - 70.0) * 0.2 - i * 0.25), 1)
        else:
            rain_prob = int(min(30, max(5, 10 + (hum_val - 45.0) * 0.35 - i * 1.2)))
            rainfall_val = 0.0

        day_range = base_range * (0.85 if (rainfall_val > 0.0 or rain_prob >= 50) else 1.0)
        t_max = round_temperature(t_avg_val + day_range * 0.52, 1)
        t_min = round_temperature(t_avg_val - day_range * 0.48, 1)

        if t_min > t_avg_val:
            t_min = round_temperature(t_avg_val - 1.0, 1)
        if t_max < t_avg_val:
            t_max = round_temperature(t_avg_val + 1.0, 1)

        feels_like = calculate_feels_like(t_avg_val, hum_val)
        dew_point = calculate_dew_point(t_avg_val, hum_val)

        condition, condition_icon = determine_condition(
            rainfall_val,
            rain_prob,
            hum_val,
            t_max,
            t_min,
        )
        comfort = determine_comfort(feels_like, hum_val)
        summary = generate_day_summary(
            condition,
            t_min,
            t_max,
            hum_val,
            rain_prob,
        )

        daily_forecasts.append(
            DayForecast(
                day=i + 1,
                date=cur_date,
                temp_avg=t_avg_val,
                temp_min=t_min,
                temp_max=t_max,
                feels_like=feels_like,
                humidity=hum_val,
                rainfall=rainfall_val,
                rain_probability=rain_prob,
                condition=condition,
                condition_icon=condition_icon,
                comfort=comfort,
                dew_point=dew_point,
                summary=summary,
            )
        )

    avg_7d = sum(f.temp_avg for f in daily_forecasts) / len(daily_forecasts)
    min_7d = min(f.temp_min for f in daily_forecasts)
    max_7d = max(f.temp_max for f in daily_forecasts)
    tot_rain_7d = sum(f.rainfall for f in daily_forecasts)
    max_rain_prob = max(f.rain_probability for f in daily_forecasts)

    if tot_rain_7d > 5.0 or max_rain_prob >= 60:
        rain_note = f"Active rain risk ({tot_rain_7d:.1f} mm total expected across the week)"
    elif max_rain_prob >= 35:
        rain_note = "Scattered light showers possible during the period"
    else:
        rain_note = "Predominantly dry and clear atmospheric conditions"

    weather_summary = (
        f"7-day outlook: Mean temperature of {avg_7d:.1f}°C with overnight lows of "
        f"{min_7d:.1f}°C and afternoon highs up to {max_7d:.1f}°C. {rain_note}."
    )

    return daily_forecasts, weather_summary
