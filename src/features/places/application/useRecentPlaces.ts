import { useCallback, useRef, useState } from 'react';
import type { PlaceResult } from '../model';
import { addRecentPlace, isPlace } from '../domain/recentPlaces';
import { recentPlacesStore, type RecentPlacesStore } from '../data/recentPlacesStore';
export function useRecentPlaces(store: RecentPlacesStore = recentPlacesStore) {
  const [recentPlaces, setRecentPlaces] = useState(() => store.load());
  const [persistence, setPersistence] = useState<string | null>(null);
  const current = useRef(recentPlaces);
  const rememberPlace = useCallback((place: PlaceResult) => {
    if (!isPlace(place)) return;
    const next = addRecentPlace(place, current.current);
    current.current = next;
    setRecentPlaces(next);
    setPersistence(store.save(next).status);
  }, [store]);
  return { recentPlaces, persistence, rememberPlace };
}
