"""
Prediction computation cache using cachetools TTLCache.
Keyed by (state, target_date, latest_data_date) with TTL of 3600 seconds.
"""
from cachetools import TTLCache

prediction_cache = TTLCache(maxsize=1024, ttl=3600)

def clear_forecast_cache():
    prediction_cache.clear()
