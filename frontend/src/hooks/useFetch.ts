/**
 * Small data-fetching hooks. Each exposes { data, loading, error, retry } and
 * re-fetches when its arguments change. Mutations (predict) live in
 * their components since they are user-triggered.
 */
import { useEffect, useState } from "react";
import { ApiError } from "../services/api";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  retry: () => void;
}

export function useFetch<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: ApiError | null }>({
    data: null,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((err: ApiError) => !cancelled && setState({ data: null, loading: false, error: err }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return {
    ...state,
    retry: () => setAttempt((a) => a + 1),
  };
}
