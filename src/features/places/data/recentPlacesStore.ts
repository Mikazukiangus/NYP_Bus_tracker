import type { PlaceResult } from '../model';
import { isPlace, MAX_RECENT } from '../domain/recentPlaces';
import { persistValue, type PersistenceResult } from '../../../services/persistence';
import { atomicCollection, type AtomicCollection, type CollectionRead, type PreferenceLocks } from '../../../services/atomicPreferences';
export const RECENT_PLACES_KEY = 'bustrackersg_recent_places_v1';
export function readRecentPlaces(storage?: Pick<Storage, 'getItem'>): CollectionRead<PlaceResult> {
  let raw: string | null;
  try { raw = (storage ?? window.localStorage).getItem(RECENT_PLACES_KEY); }
  catch { return { status: 'unavailable' }; }
  if (raw === null) return { status: 'missing' };
  try {
    const data: unknown = JSON.parse(raw);
    const list = Array.isArray(data) ? data : data && typeof data === 'object' && 'schemaVersion' in data && data.schemaVersion === 2 && 'places' in data && Array.isArray(data.places) ? data.places : null;
    if (!list) return { status: 'invalid' };
    const ids = new Set<string>();
    return { status: 'saved', items: list.filter(isPlace).filter(p => { if (ids.has(p.id)) return false; ids.add(p.id); return true; }).slice(0, MAX_RECENT) };
  } catch { return { status: 'invalid' }; }
}
export function loadRecentPlaces(storage?: Pick<Storage, 'getItem'>): PlaceResult[] {
  const read = readRecentPlaces(storage);
  return read.status === 'saved' ? read.items : [];
}
// Absolute replacement for fixtures/migrations. Application mutations use the locked update method below.
export function saveRecentPlaces(places: PlaceResult[], storage?: Pick<Storage, 'setItem'>): PersistenceResult {
  if (!Array.isArray(places)) return { status: 'invalid' };
  return persistValue(RECENT_PLACES_KEY, { schemaVersion: 2, places: places.filter(isPlace).slice(0, MAX_RECENT) }, storage);
}
export interface RecentPlacesStore extends AtomicCollection<PlaceResult> {}
export function createRecentPlacesStore(storage?: Pick<Storage, 'getItem' | 'setItem'>, locks?: PreferenceLocks): RecentPlacesStore {
  return atomicCollection(RECENT_PLACES_KEY, () => readRecentPlaces(storage), items => saveRecentPlaces(items, storage), locks);
}
export const recentPlacesStore = createRecentPlacesStore();
