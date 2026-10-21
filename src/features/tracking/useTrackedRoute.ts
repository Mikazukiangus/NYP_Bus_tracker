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

export function useTrackedRoute(userLocation: UserLocation, nearbyStops: NearbyStop[] | null | undefined) {
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  // The bus number last looked up in "Find Bus Service" (kept for next time; none on a first visit). The app opens
  // on that bus, or on a first visit on the first bus at the stop nearest the user (see below).
  const [searchedBus, setSearchedBus] = useState<string>(() => loadLastBusSearch() ?? '');
  const [direction, setDirection] = useState<number>(1);
  // Active bus service and route. A bundled route is only a placeholder until the real LTA route loads (Bus 72,
  // which stops at NYP, when there's none for that bus, or while a first visit waits for the nearest stop's buses).
  const [currentRoute, setCurrentRoute] = useState<BusRoute>(() =>
    annotateStopCalls(getOrCreateBusRoute(POPULAR_ROUTES[searchedBus] ? searchedBus : '72'))
  );
  const [isRouteLoading, setIsRouteLoading] = useState(true);
  const busChosen = useRef(false); // a bus has been chosen (at startup, by the user or by a trip)
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const routeRequestId = useRef(0);
  const currentRouteRef = useRef(currentRoute);
  currentRouteRef.current = currentRoute;

  // Physical stop + route occurrence (null follows the nearest stop).
  const [selectedStopRef, setSelectedStopRef] = useState<{ code: string; call?: StopCallRef } | null>(null);

  // Load a service's real stop sequence from LTA DataMall, falling back to bundled data if offline
  const loadRoute = useCallback(
    async (serviceNo: string, opts: { direction?: number; stopCode?: string; stopCall?: StopCallRef; datasetVersion?: string; remember?: boolean } = {}): Promise<boolean> => {
      busChosen.current = true;
      const requestId = ++routeRequestId.current;
      setIsRouteLoading(true);
      // Start optional geometry immediately; publishing stops never waits for it.
      const shapesPromise = fetchRouteShapes(serviceNo);
      const result = await fetchBusRoute(serviceNo, opts.datasetVersion);
      if (requestId !== routeRequestId.current) return false;
      setIsRouteLoading(false);

      if (result.status === 'not_found') {
        setRouteNotice(`There's no Bus ${serviceNo.toUpperCase()} running in Singapore. Please check the number.`);
        return false;
      }

      if (result.status !== 'ok' && opts.datasetVersion) {
        setRouteNotice('This trip’s route data has changed. Refresh to plan it again.');
        return false;
      }
      const route = annotateStopCalls(
        result.status === 'ok' ? { ...result.route, source: 'LTA_DATAMALL' as const } : getOrCreateBusRoute(serviceNo));
      setRouteNotice(
        result.status === 'ok'
          ? null
          : `Bus ${route.serviceNo}'s stops can't be loaded right now, so the ones shown are approximate.`
      );
      const loc = userLocationRef.current;
      setCurrentRoute(route);
      // A bus number searched for is the one the app opens on next time
      if (opts.remember) {
        setSearchedBus(route.serviceNo);
        saveLastBusSearch(route.serviceNo);
      }
      setDirection(
        opts.direction ??
          (opts.stopCode ? pickDirectionForStop(route, opts.stopCode) : undefined) ??
          pickNearestDirection(route, loc.lat, loc.lng)
      );
      setSelectedStopRef(opts.stopCode ? { code: opts.stopCode, call: opts.stopCall } : null);

      // Upgrade straight stop-to-stop lines to road-following OpenStreetMap geometry when it matches the stops
      void shapesPromise.then((shapes) => {
        if (requestId !== routeRequestId.current) return;
        const shaped = applyRouteShapes(route, shapes);
        if (shaped !== route) setCurrentRoute(shaped);
      });
      return true;
    },
    []
  );

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
    setSelectedStopRef({ code: stop.code, call: stop.call });
  }, []);

  const handleSetDirection = useCallback((dir: number) => {
    setDirection(dir);
    setSelectedStopRef(null);
  }, []);

  const retarget = useCallback((loc: UserLocation) => {
    userLocationRef.current = loc;
    setSelectedStopRef(null);
    setDirection(pickNearestDirection(currentRouteRef.current, loc.lat, loc.lng));
  }, []);
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

  return { searchedBus, direction, currentRoute, isRouteLoading, routeNotice, routeDir, nearestStop, distanceMeters, stopsWithDistance, selectedStop, loadRoute, handleSelectStop, handleSetDirection, retarget };
}
