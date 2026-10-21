import { useCallback, useRef, useState } from 'react';
import type { UserLocation } from '../../types/bus';
import { config } from '../../config';
import { SINGAPORE_LOCATIONS } from '../../data/locations';
import { loadSavedLocation, locationFromGps, saveUserLocation } from '../../services/userLocation';
import { parseLocation } from '../../../shared/geo/locationValidation';

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<UserLocation>(() => loadSavedLocation() ?? SINGAPORE_LOCATIONS[0]);
  const [isDefaultLocation, setIsDefaultLocation] = useState(() => !loadSavedLocation());
  const revision = useRef(0);
  const selectLocation = useCallback((candidate: UserLocation) => {
    const valid = parseLocation(candidate);
    if (!valid) return;
    candidate = valid;
    const location: UserLocation = { ...candidate, ...(candidate.source !== 'gps' ? { source: 'selected-place', selectedAtMs: Date.now() } : {}) };
    revision.current += 1;
    setUserLocation(location);
    setIsDefaultLocation(false);
    saveUserLocation(location);
  }, []);
  // The caller composes the location change with tracking; GPS owns its revision/cancellation guard.
  const requestStartupGps = useCallback((onFix: (location: UserLocation) => void) => {
    let active = true;
    const startedAtRevision = revision.current;
    navigator.geolocation?.getCurrentPosition((position) => {
      const location = locationFromGps(position?.coords);
      if (active && revision.current === startedAtRevision && location) onFix(location);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: config.timeouts.startupGpsMs });
    return () => { active = false; };
  }, []);
  return { userLocation, isDefaultLocation, selectLocation, requestStartupGps };
}
