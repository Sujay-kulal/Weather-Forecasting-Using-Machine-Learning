"""
Concurrency and thread-safety test suite for ThreadSafeTTLCache.

Verifies mutual exclusion, RLock reentrancy, snapshot iteration safety,
concurrent eviction, and atomicity across multiple worker threads.
"""
import concurrent.futures
from datetime import date
import threading
import time

from app.services.prediction_cache import ThreadSafeTTLCache, clear_forecast_cache, prediction_cache


def test_prediction_cache_rlock_reentrancy():
    """Verify that ThreadSafeTTLCache lock is reentrant (RLock) and does not self-deadlock."""
    cache = ThreadSafeTTLCache(maxsize=10, ttl=60)
    with cache._lock:
        with cache._lock:
            cache["test_key"] = "test_val"
            assert cache["test_key"] == "test_val"
            assert cache.get("test_key") == "test_val"
            assert "test_key" in cache
            assert len(cache) == 1


def test_prediction_cache_concurrent_reads_and_writes():
    """Verify high-concurrency read and write operations from 10 threads without race conditions."""
    cache = ThreadSafeTTLCache(maxsize=500, ttl=60)
    num_threads = 10
    ops_per_thread = 100
    errors = []

    def worker(thread_id: int):
        try:
            for i in range(ops_per_thread):
                key = (f"state_{thread_id}", date(2026, 1, 1), date(2026, 1, (i % 28) + 1))
                val = [float(thread_id + i)]
                cache[key] = val
                retrieved = cache.get(key)
                if retrieved is not None:
                    assert retrieved == val
        except Exception as exc:
            errors.append(exc)

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(worker, t) for t in range(num_threads)]
        concurrent.futures.wait(futures)

    assert len(errors) == 0, f"Encountered concurrency errors: {errors}"


def test_prediction_cache_concurrent_eviction_thread_safety():
    """Verify that concurrent insertions triggering TTLCache maxsize eviction do not corrupt internal links."""
    small_cache = ThreadSafeTTLCache(maxsize=20, ttl=60)
    num_threads = 8
    items_per_thread = 50
    errors = []

    def inserter(thread_id: int):
        try:
            for i in range(items_per_thread):
                small_cache[(f"s_{thread_id}_{i}", date(2026, 1, 1), date(2026, 1, 2))] = [float(i)]
        except Exception as exc:
            errors.append(exc)

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(inserter, t) for t in range(num_threads)]
        concurrent.futures.wait(futures)

    assert len(errors) == 0
    assert len(small_cache) <= 20


def test_prediction_cache_snapshot_iteration_safety():
    """Verify that iterating over keys while concurrent mutations occur does not trigger RuntimeError."""
    cache = ThreadSafeTTLCache(maxsize=100, ttl=60)
    for i in range(50):
        cache[f"init_{i}"] = i

    stop_event = threading.Event()
    errors = []

    def mutator():
        i = 0
        while not stop_event.is_set():
            cache[f"dyn_{i % 50}"] = i
            if f"dyn_{(i + 1) % 50}" in cache:
                del cache[f"dyn_{(i + 1) % 50}"]
            i += 1

    t = threading.Thread(target=mutator)
    t.start()

    try:
        for _ in range(50):
            # Iteration should produce an immutable snapshot without raising
            # RuntimeError: dictionary changed size during iteration
            keys = list(cache)
            assert isinstance(keys, list)
            time.sleep(0.001)
    except Exception as exc:
        errors.append(exc)
    finally:
        stop_event.set()
        t.join()

    assert len(errors) == 0


def test_clear_forecast_cache_thread_safety():
    """Verify global clear_forecast_cache function runs safely under concurrent read/write activity."""
    prediction_cache.clear()
    stop_event = threading.Event()
    errors = []

    def writer():
        i = 0
        while not stop_event.is_set():
            prediction_cache[(f"st_{i % 10}", date(2026, 1, 1), date(2026, 1, 2))] = [25.0]
            i += 1

    threads = [threading.Thread(target=writer) for _ in range(4)]
    for t in threads:
        t.start()

    try:
        for _ in range(10):
            clear_forecast_cache()
            time.sleep(0.005)
    except Exception as exc:
        errors.append(exc)
    finally:
        stop_event.set()
        for t in threads:
            t.join()
        prediction_cache.clear()

    assert len(errors) == 0
