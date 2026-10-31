"""
Prediction computation cache using cachetools TTLCache with thread-safety.
Keyed by (state, target_date, latest_data_date) with TTL of 3600 seconds.
"""
import threading
from typing import Any, Iterator, MutableMapping
from cachetools import TTLCache


class ThreadSafeTTLCache(MutableMapping):
    """Thread-safe proxy around cachetools.TTLCache using an RLock."""

    def __init__(self, maxsize: int = 1024, ttl: float = 3600):
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._lock = threading.RLock()

    def __getitem__(self, key: Any) -> Any:
        with self._lock:
            return self._cache[key]

    def __setitem__(self, key: Any, value: Any) -> None:
        with self._lock:
            self._cache[key] = value

    def __delitem__(self, key: Any) -> None:
        with self._lock:
            del self._cache[key]

    def __iter__(self) -> Iterator[Any]:
        with self._lock:
            return iter(list(self._cache.keys()))

    def __len__(self) -> int:
        with self._lock:
            return len(self._cache)

    def __contains__(self, key: Any) -> bool:
        with self._lock:
            return key in self._cache

    def get(self, key: Any, default: Any = None) -> Any:
        with self._lock:
            return self._cache.get(key, default)

    def pop(self, key: Any, default: Any = None) -> Any:
        with self._lock:
            return self._cache.pop(key, default)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    @property
    def maxsize(self) -> int:
        return self._cache.maxsize

    @property
    def ttl(self) -> float:
        return self._cache.ttl


prediction_cache = ThreadSafeTTLCache(maxsize=1024, ttl=3600)


def clear_forecast_cache():
    prediction_cache.clear()
