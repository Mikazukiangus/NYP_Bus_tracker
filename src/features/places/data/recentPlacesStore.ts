import type { PlaceResult } from '../model';
import { isPlace, MAX_RECENT } from '../domain/recentPlaces';
export const RECENT_PLACES_KEY = 'bustrackersg_recent_places_v1';
export function loadRecentPlaces(storage?: Pick<Storage, 'getItem'>): PlaceResult[] {
  try {
    const raw = (storage ?? window.localStorage).getItem(RECENT_PLACES_KEY);
    const data: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(data) ? data : data && typeof data === 'object' && 'schemaVersion' in data && data.schemaVersion === 2 && 'places' in data && Array.isArray(data.places) ? data.places : [];
    const ids = new Set<string>();
    return list.filter(isPlace).filter(p => { if (ids.has(p.id)) return false; ids.add(p.id); return true; }).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}


export function saveRecentPlaces(places: PlaceResult[], storage?: Pick<Storage, 'setItem'>): void {
  if (!Array.isArray(places)) return;
  const valid = places.filter(isPlace).slice(0, MAX_RECENT);
  try { (storage ?? window.localStorage).setItem(RECENT_PLACES_KEY, JSON.stringify({ schemaVersion: 2, places: valid })); } catch { /* persistence is optional */ }
}
export interface RecentPlacesStore { load(): PlaceResult[]; save(places: PlaceResult[]): void }
export const recentPlacesStore: RecentPlacesStore = { load: loadRecentPlaces, save: saveRecentPlaces };
