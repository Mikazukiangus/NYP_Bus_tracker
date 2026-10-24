import { useCallback, useMemo } from 'react';
import { favoriteLabels } from '../domain/labels';
import type { BusNetwork } from '../../network/model';
import type { BusStop } from '../../../types/bus';
import { defaultFavorites, sameFavorite, toggleFavorite, removeFavorite } from '../domain/favorites';
import { favoritesStore, type FavoritesStore } from '../data/favoritesStore';
import { useStoredCollection } from '../../preferences/application/useStoredCollection';
export function useSavedBuses(serviceNo: string, selectedStop: BusStop, direction: number, destination: string, store: FavoritesStore = favoritesStore, now = Date.now, network: BusNetwork | null = null) {
  const { items: favorites, persistence, current, apply } = useStoredCollection(store, () => defaultFavorites(now()));
  const isCurrentFavorite = favorites.some(item => sameFavorite(item, { serviceNo, stopCode: selectedStop.code, direction, occurrence: selectedStop.call?.occurrence }));
  const handleToggleFavorite = useCallback(() => {
    const candidate = { serviceNo, stopCode: selectedStop.code, stopName: selectedStop.name, roadName: selectedStop.road, direction, occurrence: selectedStop.call?.occurrence, destination };
    const wanted = !current.current.some(item => sameFavorite(item, candidate));
    const savedAt = now();
    return apply(items => {
      const exists = items.some(item => sameFavorite(item, candidate));
      return wanted === exists ? items : toggleFavorite(items, candidate, savedAt);
    });
  }, [apply, serviceNo, selectedStop.code, selectedStop.name, selectedStop.road, selectedStop.call, direction, destination, now]);
  const handleRemoveFavorite = useCallback((id: string) => apply(items => removeFavorite(items, id)), [apply]);
  const displayed = useMemo(() => favoriteLabels(favorites, network), [favorites, network]);
  return { favorites: displayed, persistence, isCurrentFavorite, handleToggleFavorite, handleRemoveFavorite };
}
