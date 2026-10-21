import type { UserLocation } from '../../../types/bus';
import type { PlaceResult } from '../model';
export function stopToPlace(stop: { code: string; name: string; road: string; lat: number; lng: number }): PlaceResult {
  return {
    id: `stop:${stop.code}`,
    kind: 'stop',
    placeRef: { provider: 'lta', id: stop.code, stopCode: stop.code },
    name: stop.name,
    subtitle: `Bus stop ${stop.code} · ${stop.road}`,
    lat: stop.lat,
    lng: stop.lng,
  };
}

export function placeToLocation(place: PlaceResult, selectedAtMs?: number): UserLocation {
  return {
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    source: 'selected-place',
    ...(selectedAtMs !== undefined ? { selectedAtMs } : {}),
    ...(place.placeRef ? { placeRef: place.placeRef } : {}),
    kind: place.kind,
    ...(place.subtitle ? { address: place.subtitle } : {}),
  };
}
