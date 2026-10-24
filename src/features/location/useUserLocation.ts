import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserLocation } from '../../types/bus';
import { config } from '../../config';
import { SINGAPORE_LOCATIONS } from '../../data/locations';
import { loadSavedLocation, locationFromGps, saveUserLocation, requestGpsLocation, type GpsResult } from '../../services/userLocation';
import { parseLocation } from '../../../shared/geo/locationValidation';

export type GpsSelectionResult = GpsResult | { cancelled: true };
export function useUserLocation() {
  const [state, setState] = useState(() => {
    const saved = loadSavedLocation();
    return { userLocation: saved ?? SINGAPORE_LOCATIONS[0], isDefaultLocation: !saved, persistence: null as string | null };
  });
  const { userLocation, isDefaultLocation, persistence } = state;
  const revision = useRef(0);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const selectLocation = useCallback((candidate: UserLocation) => {
    const valid = parseLocation(candidate);
    if (!valid) return;
    candidate = valid;
    const location: UserLocation = { ...candidate, ...(candidate.source !== 'gps' ? { source: 'selected-place', selectedAtMs: Date.now() } : {}) };
    revision.current += 1;
    setState({ userLocation: location, isDefaultLocation: false, persistence: saveUserLocation(location).status });
  }, []);
  const requestGps = useCallback(async (onFix: (location: UserLocation) => void, signal?: AbortSignal): Promise<GpsSelectionResult> => {
    const ticket = ++revision.current;
    const result: GpsResult = await requestGpsLocation().catch(() => ({ error: 'Could not get a GPS fix. Try again, or search for an address or postal code.' }));
    if (!active.current || signal?.aborted || ticket !== revision.current) return { cancelled: true };
    // The validity check and selection callback run synchronously, with no await between them.
    if ('location' in result) onFix(result.location);
    return result;
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
  return { userLocation, isDefaultLocation, persistence, selectLocation, requestGps, requestStartupGps };
}
