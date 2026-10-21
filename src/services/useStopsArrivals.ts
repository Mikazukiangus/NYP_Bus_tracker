import { useEffect, useMemo, useState } from 'react';
import type { StopServiceArrivals } from '../types/bus';
import { arrivalRepository } from '../features/arrivals/data/arrivalRepository';
import { ageServices } from '../features/arrivals/domain/snapshot';
import { useArrivalClock } from '../features/arrivals/useArrivalClock';
import { config } from '../config';

const REFRESH_MS = config.polling.multiStopSeconds * 1000;

// Live arrivals for several stops, keyed by stop code: undefined while loading, null when the feed is down.
// One LTA call per stop, refreshed at the configured interval while enabled (30 s by default).
export function useStopsArrivals(
  stopCodes: string[],
  enabled: boolean
): Record<string, StopServiceArrivals[] | null | undefined> {
  const nowMs = useArrivalClock(enabled);
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
      const results = await Promise.all(codes.map((code) => arrivalRepository.services(code)));
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
    () => (loaded.key === key ? Object.fromEntries(Object.entries(loaded.byStop).map(([code, services]) => [code, ageServices(services, nowMs)])) : {}),
    [loaded, key, nowMs]
  );
}
