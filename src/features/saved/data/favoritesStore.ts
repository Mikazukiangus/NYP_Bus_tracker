import type { FavoriteItem } from '../../../types/bus';
import { isFavoriteItem, favoriteKey } from '../domain/favorites';
import { persistValue, type PersistenceResult } from '../../../services/persistence';
import { atomicCollection, type AtomicCollection, type PreferenceLocks } from '../../../services/atomicPreferences';
export const FAVORITES_STORAGE_KEY = 'sbs_transit_favorites_v1'; // stable key; the envelope owns versioning
export type FavoritesRead = ReturnType<AtomicCollection<FavoriteItem>['read']>;
export interface FavoritesStore extends AtomicCollection<FavoriteItem> { save(items: FavoriteItem[]): PersistenceResult }
export function normalizeFavorites(rows: unknown[]): FavoriteItem[] {
  const keys = new Set<string>(), ids = new Set<string>();
  return rows.filter(isFavoriteItem).flatMap(item => {
    const key = favoriteKey(item);
    if (keys.has(key)) return [];
    keys.add(key);
    let id = item.id;
    let suffix = 0;
    while (ids.has(id)) id = `fav:${key}:${++suffix}`;
    ids.add(id);
    return [{ id, serviceNo: item.serviceNo.toUpperCase(), stopCode: item.stopCode, direction: item.direction,
      savedAt: item.savedAt, ...(item.occurrence !== undefined ? { occurrence: item.occurrence } : {}),
      stopName: item.stopName, roadName: item.roadName, destination: item.destination,
      labelSnapshot: { stopName: item.stopName, roadName: item.roadName, destination: item.destination } }];
  });
}
export function createFavoritesStore(storage?: Pick<Storage, 'getItem' | 'setItem'>, locks?: PreferenceLocks): FavoritesStore {
  const read = (): FavoritesRead => {
      let raw: string | null;
      try { raw = (storage ?? window.localStorage).getItem(FAVORITES_STORAGE_KEY); }
      catch { return { status: 'unavailable' }; }
      try {
        if (raw === null) return { status: 'missing' };
        const parsed: unknown = JSON.parse(raw);
        // Read legacy arrays without writing during React initialization. Save emits only the new envelope.
        const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' &&
          'schemaVersion' in parsed && parsed.schemaVersion === 2 && 'items' in parsed && Array.isArray(parsed.items)
          ? parsed.items.map(item => item && typeof item === 'object' && item.labelSnapshot && typeof item.labelSnapshot === 'object'
            ? { ...item, stopName: item.labelSnapshot.stopName, roadName: item.labelSnapshot.roadName, destination: item.labelSnapshot.destination } : null) : null;
        return rows ? { status: 'saved', items: normalizeFavorites(rows) } : { status: 'invalid' };
      } catch { return { status: 'invalid' }; }
    };
  // Absolute replacement for migrations/tests; application read-modify-write actions use update().
  const save = (items: FavoriteItem[]): PersistenceResult => {
      const records = normalizeFavorites(items).map(({ stopName, roadName, destination, ...record }) => record);
      return persistValue(FAVORITES_STORAGE_KEY, { schemaVersion: 2, items: records }, storage);
    };
  return { ...atomicCollection(FAVORITES_STORAGE_KEY, read, save, locks), save };
}
export const favoritesStore = createFavoritesStore();
