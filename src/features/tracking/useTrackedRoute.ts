import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BusRoute, BusStop, UserLocation } from '../../types/bus';
import type { NearbyStop } from '../network/model';
import { getOrCreateBusRoute, POPULAR_ROUTES } from '../../data/offlineRoutes';
import { annotateStopCalls, callIndex } from '../../../shared/transit/stopCalls';
import type { StopCallRef } from '../../../shared/transit/routes';
import { findNearestBusStop, pickDirectionForStop, pickNearestDirection } from './routeSelection';
import { fetchBusRoute } from './routeRepository';
import { applyRouteShapes } from '../../services/routeShape';
import { fetchRouteShapes } from './shapeRepository';
import { loadLastBusSearch, saveLastBusSearch } from '../../services/lastBusSearch';
import { serviceNoSchema } from '../../../shared/input/primitives';

interface RouteState {
  searchedBus: string;
  direction: number;
  currentRoute: BusRoute;
  isRouteLoading: boolean;
  routeNotice: string | null;
  selectedStopRef: { code: string; call?: StopCallRef } | null;
}
const DEFAULT_LOADERS = { fetchBusRoute, fetchRouteShapes };

export function useTrackedRoute(userLocation: UserLocation, nearbyStops: NearbyStop[] | null | undefined, loaders = DEFAULT_LOADERS) {
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const [state, setState] = useState<RouteState>(() => {
    const searchedBus = loadLastBusSearch() ?? '';
    return { searchedBus, direction: 1, currentRoute: annotateStopCalls(getOrCreateBusRoute(POPULAR_ROUTES[searchedBus] ? searchedBus : '72')),
      isRouteLoading: true, routeNotice: null, selectedStopRef: null };
  });
  const current = useRef(state);
  const publish = useCallback((patch: Partial<RouteState>) => {
    current.current = { ...current.current, ...patch };
    setState(current.current);
  }, []);
  const { searchedBus, direction, currentRoute, isRouteLoading, routeNotice, selectedStopRef } = state;
  const busChosen = useRef(false);
  const routeRequestId = useRef(0);
  const tripRequest = useRef(false);
  const selectionRevision = useRef(0);
  const selectionIntent = useRef<'manual' | 'location'>('location');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const cancelRouteRequest = useCallback((tripOnly = false) => {
    if (tripOnly && !tripRequest.current) return;
    routeRequestId.current++;
    publish({ isRouteLoading: false });
  }, [publish]);

  const loadRoute = useCallback(async (serviceNo: string, opts: {
    direction?: number; stopCode?: string; stopCall?: StopCallRef; datasetVersion?: string; remember?: boolean;
  } = {}): Promise<boolean> => {
    const requestId = ++routeRequestId.current;
    tripRequest.current = Boolean(opts.datasetVersion || opts.stopCall?.datasetVersion);
    const parsed = serviceNoSchema.safeParse(serviceNo);
    if (!parsed.success) { publish({ isRouteLoading: false, routeNotice: 'Enter a valid bus service number.' }); return false; }
    serviceNo = parsed.data;
    busChosen.current = true;
    const selectionAtStart = selectionRevision.current;
    publish({ isRouteLoading: true });
    const shapesPromise = loaders.fetchRouteShapes(serviceNo);
    const result = await loaders.fetchBusRoute(serviceNo, opts.datasetVersion);
    if (!active.current || requestId !== routeRequestId.current) return false;
    if (result.status === 'not_found') {
      publish({ isRouteLoading: false, routeNotice: `There's no Bus ${serviceNo.toUpperCase()} running in Singapore. Please check the number.` });
      return false;
    }
    if (result.status !== 'ok' && opts.datasetVersion) {
      publish({ isRouteLoading: false, routeNotice: 'This trip’s route data has changed. Refresh to plan it again.' });
      return false;
    }
    const route = annotateStopCalls(result.status === 'ok'
      ? { ...result.route, source: 'LTA_DATAMALL' as const } : getOrCreateBusRoute(serviceNo));
    const loc = userLocationRef.current;
    const unchanged = selectionAtStart === selectionRevision.current;
    const nextDirection = unchanged
      ? opts.direction ?? (opts.stopCode ? pickDirectionForStop(route, opts.stopCode) : undefined) ?? pickNearestDirection(route, loc.lat, loc.lng)
      : selectionIntent.current === 'location' ? pickNearestDirection(route, loc.lat, loc.lng) : current.current.direction;
    const nextStop = unchanged ? opts.stopCode ? { code: opts.stopCode, call: opts.stopCall } : null : current.current.selectedStopRef;
    // Publish route, direction, stop, notice and remembered service in one state transition.
    publish({ currentRoute: route, direction: nextDirection === 2 && route.direction2 ? 2 : 1, selectedStopRef: nextStop,
      isRouteLoading: false, routeNotice: result.status === 'ok' ? null : `Bus ${route.serviceNo}'s stops can't be loaded right now, so the ones shown are approximate.`,
      ...(opts.remember ? { searchedBus: route.serviceNo } : {}) });
    if (opts.remember) saveLastBusSearch(route.serviceNo);
    void shapesPromise.then(shapes => {
      if (!active.current || requestId !== routeRequestId.current) return;
      const shaped = applyRouteShapes(route, shapes);
      if (shaped !== route) publish({ currentRoute: shaped });
    });
    return true;
  }, [loaders, publish]);

  const routeDir = useMemo(() => {
    return direction === 2 && currentRoute.direction2 ? currentRoute.direction2 : currentRoute.direction1;
  }, [currentRoute, direction]);

  // Find nearest stop based on userLocation
  const nearestResult = useMemo(() => {
    return findNearestBusStop(currentRoute, direction, userLocation.lat, userLocation.lng);
  }, [currentRoute, direction, userLocation.lat, userLocation.lng]);

  const nearestStop = nearestResult.nearestStop;
  const distanceMeters = nearestResult.distanceMeters;
  const stopsWithDistance = nearestResult.allStopsWithDistance;

  const selectedStop = useMemo<BusStop>(
    () => selectedStopRef ? routeDir.stops[callIndex(routeDir.stops, selectedStopRef)] ?? nearestStop : nearestStop,
    [routeDir, selectedStopRef, nearestStop]
  );

  const handleSelectStop = useCallback((stop: BusStop) => {
    selectionRevision.current++;
    selectionIntent.current = 'manual';
    publish({ selectedStopRef: { code: stop.code, call: stop.call } });
  }, [publish]);

  const handleSetDirection = useCallback((dir: number) => {
    selectionRevision.current++;
    selectionIntent.current = 'manual';
    publish({ direction: dir, selectedStopRef: null });
  }, [publish]);

  const retarget = useCallback((loc: UserLocation) => {
    userLocationRef.current = loc;
    selectionRevision.current++;
    selectionIntent.current = 'location';
    publish({ selectedStopRef: null, direction: pickNearestDirection(current.current.currentRoute, loc.lat, loc.lng) });
  }, [publish]);
  // Open on the bus last searched for; on a first visit, on the first bus at the stop nearest the user once the bus
  // network has loaded (or Bus 72, NYP's, if it can't load). Not once a bus has been chosen some other way.
  useEffect(() => {
    if (busChosen.current) return;
    if (searchedBus) loadRoute(searchedBus);
    else if (nearbyStops !== null) {
      const nearest = nearbyStops?.find((n) => n.services.length);
      const svc = nearest?.services[0];
      if (nearest && svc) loadRoute(svc.serviceNo, { direction: svc.direction, stopCode: nearest.stop.code });
      else loadRoute('72');
    }
  }, [searchedBus, nearbyStops, loadRoute]);

  return { searchedBus, direction, currentRoute, isRouteLoading, routeNotice, routeDir, nearestStop, distanceMeters, stopsWithDistance, selectedStop, loadRoute, cancelRouteRequest, handleSelectStop, handleSetDirection, retarget };
}
