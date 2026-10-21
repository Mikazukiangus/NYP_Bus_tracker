import type { UserLocation, PlaceReference } from './location';
import { isSingaporeLocation } from './singapore';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonnegative = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function validPlaceRef(v: unknown): v is PlaceReference {
  return object(v) && typeof v.id === 'string' && v.id.length > 0 && ['lta','onemap','preset'].includes(v.provider as string) &&
    (v.stopCode === undefined || typeof v.stopCode === 'string' && /^\d{5}$/.test(v.stopCode)) &&
    (v.postalCode === undefined || typeof v.postalCode === 'string' && /^\d{6}$/.test(v.postalCode));
}
export function parseLocation(v: unknown, legacy = false): UserLocation | null {
  if (!object(v) || typeof v.name !== 'string' || !v.name.trim() || typeof v.lat !== 'number' || typeof v.lng !== 'number' || !isSingaporeLocation(v.lat, v.lng)) return null;
  const source = legacy && typeof v.isSimulated === 'boolean' ? v.isSimulated ? 'selected-place' : 'gps' : v.source;
  if (!['gps','selected-place','default'].includes(source as string) || (v.kind !== undefined && !['place','address','postal','stop'].includes(v.kind as string)) || (v.address !== undefined && typeof v.address !== 'string')) return null;
  if (['accuracyMeters','capturedAtMs','selectedAtMs'].some(k => v[k] !== undefined && !nonnegative(v[k])) || v.placeRef !== undefined && !validPlaceRef(v.placeRef)) return null;
  return { name: source === 'gps' ? 'Your location' : v.name, lat: v.lat, lng: v.lng, source: source as UserLocation['source'],
    ...(v.kind !== undefined ? { kind: v.kind as UserLocation['kind'] } : {}), ...(v.address !== undefined ? { address: v.address as string } : {}),
    ...(v.accuracyMeters !== undefined ? { accuracyMeters: v.accuracyMeters as number } : {}),
    ...(v.capturedAtMs !== undefined ? { capturedAtMs: v.capturedAtMs as number } : {}),
    ...(v.selectedAtMs !== undefined ? { selectedAtMs: v.selectedAtMs as number } : {}), ...(v.placeRef ? { placeRef: v.placeRef as PlaceReference } : {}) };
}
