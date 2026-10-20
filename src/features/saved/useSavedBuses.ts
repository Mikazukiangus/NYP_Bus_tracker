import { useMemo, useState } from 'react';
import type { BusStop, FavoriteItem } from '../../types/bus';
const FAVORITES_STORAGE_KEY = 'sbs_transit_favorites_v1';

export function useSavedBuses(serviceNo: string, selectedStop: BusStop, direction: number, destination: string) {
  // Favorites state
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    // Seed default favorite (Bus 72 at Nanyang Poly, towards Tampines)
    return [
      {
        id: 'fav-72-55329',
        serviceNo: '72',
        stopCode: '55329',
        stopName: 'Nanyang Poly',
        roadName: 'Ang Mo Kio Ave 8',
        direction: 1,
        destination: 'Tampines Int',
        savedAt: Date.now(),
      },
    ];
  });

  const saveFavorites = (items: FavoriteItem[]) => {
    setFavorites(items);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  const isCurrentFavorite = useMemo(() => {
    return favorites.some(
      (f) => f.serviceNo === serviceNo && f.stopCode === selectedStop.code
    );
  }, [favorites, serviceNo, selectedStop.code]);

  const handleToggleFavorite = () => {
    if (isCurrentFavorite) {
      saveFavorites(
        favorites.filter(
          (f) => !(f.serviceNo === serviceNo && f.stopCode === selectedStop.code)
        )
      );
    } else {
      const newFav: FavoriteItem = {
        id: `fav-${serviceNo}-${selectedStop.code}-${Date.now()}`,
        serviceNo,
        stopCode: selectedStop.code,
        stopName: selectedStop.name,
        roadName: selectedStop.road,
        direction,
        destination,
        savedAt: Date.now(),
      };
      saveFavorites([newFav, ...favorites]);
    }
  };

  const handleRemoveFavorite = (id: string) => {
    saveFavorites(favorites.filter((f) => f.id !== id));
  };

  return { favorites, isCurrentFavorite, handleToggleFavorite, handleRemoveFavorite };
}
