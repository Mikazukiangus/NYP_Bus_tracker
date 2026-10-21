import { useEffect, useMemo, useRef, useState } from 'react';
import { BusArrivalInfo, FavoriteItem } from '../types/bus';
import { arrivalRepository } from '../features/arrivals/data/arrivalRepository';
import { ageBus } from '../features/arrivals/domain/snapshot';
import { useArrivalClock } from '../features/arrivals/useArrivalClock';
import { config } from '../config';

export type FavoriteArrival =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ok'; nextBus: BusArrivalInfo | null; nextBus2: BusArrivalInfo | null };

const REFRESH_MS = config.polling.multiStopSeconds * 1000;

// Live next-bus times for each favourite, keyed by favourite id. One LTA call per distinct stop;
// polls only while `enabled` (i.e. while favourites are visible).
export function useFavoriteArrivals(favorites: FavoriteItem[], enabled: boolean): Record<string, FavoriteArrival> {
  const nowMs = useArrivalClock(enabled);
  const [arrivals, setArrivals] = useState<Record<string, FavoriteArrival>>({});
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;
  const favoritesKey = favorites.map((f) => f.id).join(',');

  useEffect(() => {
    if (!enabled || favoritesKey === '') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      const favorites = favoritesRef.current;
      const stopCodes = [...new Set(favorites.map((f) => f.stopCode))];
      const results = await Promise.all(stopCodes.map((code) => arrivalRepository.services(code)));
      if (cancelled) return;
      const byStop = new Map(stopCodes.map((code, i) => [code, results[i]]));
      setArrivals(
        Object.fromEntries(
          favorites.map((f): [string, FavoriteArrival] => {
            const services = byStop.get(f.stopCode);
            if (!services) return [f.id, { status: 'unavailable' }];
            const svc = services.find((s) => s.serviceNo.toUpperCase() === f.serviceNo.toUpperCase());
            return [f.id, { status: 'ok', nextBus: svc?.nextBus ?? null, nextBus2: svc?.nextBus2 ?? null }];
          })
        )
      );
      timer = setTimeout(load, REFRESH_MS);
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, favoritesKey]);

  return useMemo(() => Object.fromEntries(Object.entries(arrivals).map(([id, arrival]) => [id, arrival.status === 'ok'
    ? { ...arrival, nextBus: ageBus(arrival.nextBus, nowMs), nextBus2: ageBus(arrival.nextBus2, nowMs) } : arrival])), [arrivals, nowMs]);
}
