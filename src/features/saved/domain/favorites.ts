import type { FavoriteItem } from '../../../types/bus';
export type FavoriteCandidate = Omit<FavoriteItem, 'id' | 'savedAt'>;
export function favoriteKey(item: Pick<FavoriteItem, 'serviceNo' | 'stopCode' | 'direction' | 'occurrence'>): string {
  return `${item.serviceNo.trim().toUpperCase()}:${item.stopCode}:${item.direction}:${item.occurrence ?? 1}`;
}
export function sameFavorite(a: Pick<FavoriteItem, 'serviceNo' | 'stopCode' | 'direction' | 'occurrence'>, b: Pick<FavoriteItem, 'serviceNo' | 'stopCode' | 'direction' | 'occurrence'>): boolean {
  return favoriteKey(a) === favoriteKey(b);
}
export function defaultFavorites(nowMs: number): FavoriteItem[] {
  return [{ id: 'fav-72-55329', serviceNo: '72', stopCode: '55329', stopName: 'Nanyang Poly', roadName: 'Ang Mo Kio Ave 8', direction: 1, destination: 'Tampines Int', savedAt: nowMs }];
}
export function toggleFavorite(items: FavoriteItem[], candidate: FavoriteCandidate, nowMs: number): FavoriteItem[] {
  if (items.some(item => sameFavorite(item, candidate))) return items.filter(item => !sameFavorite(item, candidate));
  return [{ ...candidate, serviceNo: candidate.serviceNo.trim().toUpperCase(), id: `fav:${favoriteKey(candidate)}`, savedAt: nowMs,
    labelSnapshot: { stopName: candidate.stopName, roadName: candidate.roadName, destination: candidate.destination } }, ...items];
}
export const removeFavorite = (items: FavoriteItem[], id: string): FavoriteItem[] => items.filter(item => item.id !== id);
export function isFavoriteItem(value: unknown): value is FavoriteItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<FavoriteItem>;
  return typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.serviceNo === 'string' && /^[0-9A-Za-z]{1,6}$/.test(item.serviceNo) &&
    typeof item.stopCode === 'string' && /^\d{5}$/.test(item.stopCode) &&
    typeof item.stopName === 'string' && typeof item.roadName === 'string' && typeof item.destination === 'string' &&
    (item.direction === 1 || item.direction === 2) && (item.occurrence === undefined || (Number.isSafeInteger(item.occurrence) && item.occurrence! > 0)) && typeof item.savedAt === 'number' && Number.isFinite(item.savedAt) && item.savedAt >= 0;
}
