import { useCallback, useEffect, useState } from 'react';
import { subscribe } from '../api';

/**
 * Load data from the API. Re-runs when `deps` change, and (optionally) whenever
 * any data changes in the API (`live: true`), so counters stay current.
 *
 *   const { data, loading, error, reload } = useAsync(() => api.leaderboard(10), []);
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts: { live?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await run());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  useEffect(() => {
    if (!opts.live) return;
    return subscribe(() => void reload());
  }, [opts.live, reload]);

  return { data, loading, error, reload, setData };
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}
