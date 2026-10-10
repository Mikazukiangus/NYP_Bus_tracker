import { useEffect, useRef, useState } from 'react';
import { BusArrivalInfo, FavoriteItem } from '../types/bus';
import { fetchStopArrivals } from './busTrackerService';

export type FavoriteArrival =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ok'; nextBus: BusArrivalInfo | null; nextBus2: BusArrivalInfo | null };

const REFRESH_MS = 30 * 1000;

// Live next-bus times for each favourite, keyed by favourite id. One LTA call per distinct stop;
// polls only while `enabled` (i.e. while favourites are visible).
export function useFavoriteArrivals(favorites: FavoriteItem[], enabled: boolean): Record<string, FavoriteArrival> {
  const [arrivals, setArrivals] = useState<Record<string, FavoriteArrival>>({});
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;
  const favoritesKey = favorites.map((f) => f.id).join(',');

  useEffect(() => {
    if (!enabled || favoritesKey === '') return;
    let cancelled = false;

    const load = async () => {
      const favorites = favoritesRef.current;
      const stopCodes = [...new Set(favorites.map((f) => f.stopCode))];
      const results = await Promise.all(stopCodes.map((code) => fetchStopArrivals(code)));
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
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, favoritesKey]);

  return arrivals;
}
