import { loadSavedLocation, LOCATION_STORAGE_KEY } from '../../services/userLocation';
import { readRecentPlaces } from '../places/data/recentPlacesStore';
import type { PlaceReference } from '../../../shared/geo/location';

const reference = (ref?: PlaceReference) => ref ? { provider: ref.provider, id: ref.id,
  ...(ref.stopCode ? { stopCode: ref.stopCode } : {}), ...(ref.postalCode ? { postalCode: ref.postalCode } : {}) } : undefined;

// Export only validated, explicitly named location fields, never an arbitrary storage dump.
export function locationExport(storage: Pick<Storage, 'getItem'> = window.localStorage, now = Date.now()) {
  storage.getItem(LOCATION_STORAGE_KEY); // Surface blocked storage instead of silently exporting an empty record.
  const location = loadSavedLocation(storage);
  const recent = readRecentPlaces(storage);
  if (recent.status === 'unavailable' || recent.status === 'invalid') throw new Error('Saved places could not be read.');
  return {
    schemaVersion: 1, exportedAt: new Date(now).toISOString(),
    location: location ? { ...location, placeRef: reference(location.placeRef) } : null,
    recentPlaces: recent.status === 'saved' ? recent.items.map(place => ({ id: place.id, kind: place.kind,
      name: place.name, subtitle: place.subtitle, lat: place.lat, lng: place.lng, placeRef: reference(place.placeRef) })) : [],
  };
}
