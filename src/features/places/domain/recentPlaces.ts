import { validPlaceRef } from '../../../../shared/geo/locationValidation';
import { isSingaporeLocation } from '../../../../shared/geo/singapore';
import type { PlaceResult } from '../model';
export const MAX_RECENT = 6;
export const isPlace = (value: unknown): value is PlaceResult => {
  const p = value as Partial<PlaceResult> | null;
  return (
    !!p &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    p.name.length > 0 &&
    ['place', 'address', 'postal', 'stop'].includes(p.kind as string) &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    isSingaporeLocation(p.lat, p.lng) &&
    (p.subtitle === undefined || typeof p.subtitle === 'string') &&
    (p.placeRef === undefined || validPlaceRef(p.placeRef))
  );
};

export function addRecentPlace(place: PlaceResult, current: PlaceResult[]): PlaceResult[] {
  return [place, ...current.filter((p) => p.id !== place.id)].slice(0, MAX_RECENT);
}
