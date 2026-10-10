import type { UserLocation } from '../types/bus';

export const LOCATION_STORAGE_KEY = 'bustrackersg_location_v1';

export function isSingaporeLocation(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 1.15 && lat <= 1.48 && lng >= 103.55 && lng <= 104.1;
}

function isUserLocation(value: unknown): value is UserLocation {
  if (!value || typeof value !== 'object') return false;
  const loc = value as Partial<UserLocation>;
  return typeof loc.name === 'string' && loc.name.trim().length > 0 &&
    typeof loc.lat === 'number' && typeof loc.lng === 'number' &&
    isSingaporeLocation(loc.lat, loc.lng) && typeof loc.isSimulated === 'boolean' &&
    (loc.accuracyMeters === undefined ||
      (typeof loc.accuracyMeters === 'number' && Number.isFinite(loc.accuracyMeters) && loc.accuracyMeters >= 0)) &&
    (loc.kind === undefined || ['place', 'address', 'postal', 'stop'].includes(loc.kind)) &&
    (loc.address === undefined || typeof loc.address === 'string');
}

export function loadSavedLocation(storage?: Pick<Storage, 'getItem'>): UserLocation | null {
  try {
    const raw = (storage ?? window.localStorage).getItem(LOCATION_STORAGE_KEY);
    const loc: unknown = raw ? JSON.parse(raw) : null;
    return isUserLocation(loc) ? loc : null;
  } catch {
    // Storage can be blocked, or contain an old/corrupt value.
    return null;
  }
}

export function saveUserLocation(loc: UserLocation, storage?: Pick<Storage, 'setItem'>): void {
  if (!isUserLocation(loc)) return;
  try {
    (storage ?? window.localStorage).setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc));
  } catch {
    // A storage failure must not prevent changing location for this visit.
  }
}

export function locationFromGps(coords: Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>): UserLocation | null {
  if (!isSingaporeLocation(coords.latitude, coords.longitude)) return null;
  return {
    name: 'My Device GPS Location',
    lat: coords.latitude,
    lng: coords.longitude,
    isSimulated: false,
    ...(Number.isFinite(coords.accuracy) && coords.accuracy >= 0
      ? { accuracyMeters: Math.round(coords.accuracy) } : {}),
  };
}

export type GpsResult = { location: UserLocation } | { error: string };

// One fresh GPS fix, with a message suitable for the user when it can't be used
export function requestGpsLocation(timeoutMs = 8000): Promise<GpsResult> {
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
