import { useCallback, useMemo, useRef, useState } from 'react';
import { favoriteLabels } from '../domain/labels';
import type { BusNetwork } from '../../network/model';
import type { BusStop, FavoriteItem } from '../../../types/bus';
import { defaultFavorites, sameFavorite, toggleFavorite, removeFavorite } from '../domain/favorites';
import { favoritesStore, type FavoritesStore } from '../data/favoritesStore';
export function useSavedBuses(serviceNo: string, selectedStop: BusStop, direction: number, destination: string, store: FavoritesStore = favoritesStore, now = Date.now, network: BusNetwork | null = null) {
  const [favorites, setFavorites] = useState(() => {
    const stored = store.read();
    return stored.status === 'saved' ? stored.items : defaultFavorites(now());
  });
  const current = useRef(favorites);
  const apply = useCallback((next: FavoriteItem[]) => {
    current.current = next;
    setFavorites(next);
    store.save(next);
  }, [store]);
  const isCurrentFavorite = favorites.some(item => sameFavorite(item, { serviceNo, stopCode: selectedStop.code, direction, occurrence: selectedStop.call?.occurrence }));
  const handleToggleFavorite = useCallback(() => {
    apply(toggleFavorite(current.current, { serviceNo, stopCode: selectedStop.code, stopName: selectedStop.name, roadName: selectedStop.road, direction, occurrence: selectedStop.call?.occurrence, destination }, now()));
  }, [apply, serviceNo, selectedStop.code, selectedStop.name, selectedStop.road, selectedStop.call, direction, destination, now]);
  const handleRemoveFavorite = useCallback((id: string) => apply(removeFavorite(current.current, id)), [apply]);
  const displayed = useMemo(() => favoriteLabels(favorites, network), [favorites, network]);
  return { favorites: displayed, isCurrentFavorite, handleToggleFavorite, handleRemoveFavorite };
}
