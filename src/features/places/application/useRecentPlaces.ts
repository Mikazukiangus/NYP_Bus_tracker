import { useCallback, useRef, useState } from 'react';
import type { PlaceResult } from '../model';
import { addRecentPlace } from '../domain/recentPlaces';
import { recentPlacesStore, type RecentPlacesStore } from '../data/recentPlacesStore';
export function useRecentPlaces(store: RecentPlacesStore = recentPlacesStore) {
  const [recentPlaces, setRecentPlaces] = useState(() => store.load());
  const current = useRef(recentPlaces);
  const rememberPlace = useCallback((place: PlaceResult) => {
    const next = addRecentPlace(place, current.current);
    current.current = next;
    setRecentPlaces(next);
    store.save(next);
  }, [store]);
  return { recentPlaces, rememberPlace };
}
