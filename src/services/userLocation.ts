import type { UserLocation } from '../types/bus';
import { config } from '../config';

export const LOCATION_STORAGE_KEY = 'bustrackersg_location_v1';

import { isSingaporeLocation } from '../../shared/geo/singapore';
export { isSingaporeLocation } from '../../shared/geo/singapore';

import { parseLocation } from '../../shared/geo/locationValidation';

// The device's own position, as map apps name it
const GPS_NAME = 'Your location';

export function loadSavedLocation(storage?: Pick<Storage, 'getItem'>): UserLocation | null {
  try {
    const raw = (storage ?? window.localStorage).getItem(LOCATION_STORAGE_KEY);
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (data && typeof data === 'object' && 'schemaVersion' in data) {
      return data.schemaVersion === 2 && 'location' in data ? parseLocation(data.location) : null;
    }
    return parseLocation(data, true);
  } catch {
    // Storage can be blocked, or contain an old/corrupt value.
    return null;
  }
}

export function saveUserLocation(loc: UserLocation, storage?: Pick<Storage, 'setItem'>): void {
  if (!parseLocation(loc)) return;
  try {
    (storage ?? window.localStorage).setItem(LOCATION_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, location: loc }));
  } catch {
    // A storage failure must not prevent changing location for this visit.
  }
}

export function locationFromGps(coords: Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>, capturedAtMs = Date.now()): UserLocation | null {
  if (!isSingaporeLocation(coords.latitude, coords.longitude)) return null;
  return {
    name: GPS_NAME,
    lat: coords.latitude,
    lng: coords.longitude,
    source: 'gps',
    capturedAtMs,
    ...(Number.isFinite(coords.accuracy) && coords.accuracy >= 0
      ? { accuracyMeters: Math.round(coords.accuracy) } : {}),
  };
}

export type GpsResult = { location: UserLocation } | { error: string };

// One fresh GPS fix, with a message suitable for the user when it can't be used
export function requestGpsLocation(timeoutMs = config.timeouts.gpsMs): Promise<GpsResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ error: 'Location services are not available in this browser.' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = locationFromGps(pos.coords);
        resolve(
          location
            ? { location }
            : { error: 'Your GPS position is outside Singapore. Search for an address or postal code instead.' }
        );
      },
      (err) =>
        resolve({
          error:
            err.code === 1
              ? 'Location permission was denied. Allow it in your browser, or search for an address or postal code.'
              : 'Could not get a GPS fix. Try again, or search for an address or postal code.',
        }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    );
  });
}
