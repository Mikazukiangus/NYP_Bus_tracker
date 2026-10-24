import { useCallback } from 'react';
import type { PlaceResult } from '../model';
import { addRecentPlace, isPlace } from '../domain/recentPlaces';
import { recentPlacesStore, type RecentPlacesStore } from '../data/recentPlacesStore';
import { useStoredCollection } from '../../preferences/application/useStoredCollection';
export function useRecentPlaces(store: RecentPlacesStore = recentPlacesStore) {
  const { items: recentPlaces, persistence, apply } = useStoredCollection(store, () => []);
  const rememberPlace = useCallback((place: PlaceResult) => {
    if (isPlace(place)) return apply(items => addRecentPlace(place, items));
  }, [apply]);
  return { recentPlaces, persistence, rememberPlace };
}
