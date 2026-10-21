import type { PlaceResult, PlaceSearchState } from '../model';
export const isPostalCode = (query: string) => /^\d{6}$/.test(query.trim());
export const isStopCode = (query: string) => /^\d{5}$/.test(query.trim());

export function rankPlaces(places: { place: PlaceResult; hasPostal: boolean }[], query: string): PlaceResult[] {
  // OneMap's order is loose, so re-rank for places people travel to:
  // 1. results with a postal code (buildings, stations, malls) before flyovers, exits and pumping stations
  // 2. exact, then prefix, then word matches of the name (e.g. "Jurong Point" before a clinic inside it)
  const q = query.trim().toLowerCase();
  const rank = (p: PlaceResult) => {
    const name = p.name.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) return 2;
    return 3;
  };
  return places
    .map(({ place, hasPostal }, i) => ({ place, i, postal: hasPostal ? 0 : 1, match: rank(place) }))
    .sort((a, b) => a.postal - b.postal || a.match - b.match || a.i - b.i)
    .map(({ place }) => place);
}

export function mergeSearchResults(places: PlaceResult[] | null, stops: PlaceResult[]): PlaceSearchState {
  return { results: [...(places ?? []).slice(0, 6), ...stops], status: 'done', addressSearchFailed: places === null };
}
