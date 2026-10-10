import { useEffect, useMemo, useState } from 'react';
import type { StopServiceArrivals } from '../types/bus';
import { fetchStopArrivals } from './busTrackerService';

const REFRESH_MS = 30 * 1000;

// Live arrivals for several stops, keyed by stop code: undefined while loading, null when the feed is down.
// One LTA call per stop, refreshed every 30 s while enabled.
export function useStopsArrivals(
  stopCodes: string[],
  enabled: boolean
): Record<string, StopServiceArrivals[] | null | undefined> {
  const [loaded, setLoaded] = useState<{ key: string; byStop: Record<string, StopServiceArrivals[] | null> }>({
    key: '',
    byStop: {},
  });
  const key = [...new Set(stopCodes)].sort().join(',');

  useEffect(() => {
    if (!enabled || key === '') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const codes = key.split(',');

    const load = async () => {
      const results = await Promise.all(codes.map((code) => fetchStopArrivals(code)));
      if (cancelled) return;
      setLoaded({ key, byStop: Object.fromEntries(codes.map((code, i) => [code, results[i]])) });
      timer = setTimeout(load, REFRESH_MS);
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, enabled]);

  // Results for an earlier stop list are never reported as current
  return useMemo(
    () => (loaded.key === key ? loaded.byStop : {}),
    [loaded, key]
  );
}
