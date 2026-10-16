import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AlightHint,
  BusRoute,
  BusStop,
  BusServiceArrivals,
  FavoriteItem,
  IncomingBus,
  JourneyOverlay,
  StopRef,
  TrafficIncident,
  TripView,
  UserLocation
} from './types/bus';
import type { WeatherSnapshot } from './types/weather';
import {
  SINGAPORE_LOCATIONS,
  calculateDistanceMeters,
  getOrCreateBusRoute,
  POPULAR_ROUTES
} from './data/singaporeBuses';
import {
  findNearestBusStop,
  generateArrivalTimings,
  fetchBusRoute,
  fetchTrafficIncidents,
  pickDirectionForStop,
  pickNearestDirection,
} from './services/busTrackerService';
import { applyRouteShapes, distanceToPathMeters, fetchRouteShapes, legPath } from './services/routeShape';
import { BusNetwork, NearbyStop, StopService, loadBusNetwork, nearestStops } from './services/busNetwork';
import { TripLeg, TripOption, alightFor, legServiceNos, liveDeparture, planTrips, tripScore, withServices } from './services/tripPlanner';
import { PlaceResult, addRecentPlace, loadRecentPlaces, placeToLocation } from './services/placeSearch';
import { useStopsArrivals } from './services/useStopsArrivals';
import { fetchWeatherSnapshot, forecastAt, formatSgTime, summarizeWeather } from './services/neaWeather';
import { rainNowcast } from './services/rainNowcast';
import { RainAdviceInput, rainAdvice } from './services/rainAdvice';
import { firstCatchable, leaveWithin, walkMinutes } from './services/leaveWithin';
import { Header } from './components/Header';
import { BusSearchBox } from './components/BusSearchBox';
import { NearestStopBanner } from './components/NearestStopBanner';
import { ArrivalDisplay } from './components/ArrivalDisplay';
import { StopServicesBoard } from './components/StopServicesBoard';
import { LiveBusMap } from './components/LiveBusMap';
import { RouteStopsList } from './components/RouteStopsList';
import { NEAWeatherWidget, WeatherStrip } from './components/NEAWeatherWidget';
import { LiveArrivalsBar } from './components/LiveArrivalsBar';
import { AppTab, BottomTabBar } from './components/AppTabs';
import { FavoritesModal, NextBusLabel } from './components/FavoritesModal';
import { LocationPickerModal } from './components/LocationPickerModal';
import { LocationBar } from './components/LocationBar';
import { RainAdviceStrip } from './components/RainAdviceStrip';
import { RankedTrip, TripPlannerCard, TripPlannerState } from './components/TripPlannerCard';
import { useFavoriteArrivals } from './services/favoriteArrivals';
import { useStopArrivals } from './services/useStopArrivals';
import { useIsPhone } from './services/useIsPhone';
import { useTextEntry } from './services/useTextEntry';
import { loadSavedLocation, locationFromGps, saveUserLocation } from './services/userLocation';
import { loadLastBusSearch, saveLastBusSearch } from './services/lastBusSearch';
import { AlarmRide, useGetOffAlarm } from './services/useGetOffAlarm';
import { GetOffBanner, alarmStatus } from './components/GetOffAlarm';
import { Heart, AlertCircle } from 'lucide-react';

const FAVORITES_STORAGE_KEY = 'sbs_transit_favorites_v1';
const ARRIVALS_CARD_ID = 'live-arrivals';
const stopRef = ({ code, name, road, lat, lng }: StopRef): StopRef => ({ code, name, road, lat, lng });
// Incidents within this distance of the route line are shown on the map
const INCIDENT_ROUTE_DISTANCE_M = 150;
// Further than this from where the trip starts, a bus stop isn't one you'd walk to (for the rain advice)
const WALKABLE_STOP_M = 1500;

export default function App() {
  // Restore the last location immediately while requesting a fresh GPS fix.
  const [userLocation, setUserLocation] = useState<UserLocation>(() => loadSavedLocation() ?? SINGAPORE_LOCATIONS[0]);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const locationRevisionRef = useRef(0);

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  // The bus number last looked up in "Find Bus Service" (kept for next time; none on a first visit). The app opens
  // on that bus, or on a first visit on the first bus at the stop nearest the user (see below).
  const [searchedBus, setSearchedBus] = useState<string>(() => loadLastBusSearch() ?? '');
  const [direction, setDirection] = useState<number>(1);
  // Active bus service and route. A bundled route is only a placeholder until the real LTA route loads (Bus 72,
  // which stops at NYP, when there's none for that bus, or while a first visit waits for the nearest stop's buses).
  const [currentRoute, setCurrentRoute] = useState<BusRoute>(() =>
    getOrCreateBusRoute(POPULAR_ROUTES[searchedBus] ? searchedBus : '72')
  );
  const [isRouteLoading, setIsRouteLoading] = useState(true);
  const busChosen = useRef(false); // a bus has been chosen (at startup, by the user or by a trip)
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const routeRequestId = useRef(0);
  const currentRouteRef = useRef(currentRoute);
  currentRouteRef.current = currentRoute;

  const [activeTab, setActiveTab] = useState<AppTab>('arrivals');
  // Phones get a shorter page: the tabs in a bar at the bottom, each tab showing only what it's for, folded
  // sections, and a bar with the next bus
  const isPhone = useIsPhone();
  const isTyping = useTextEntry();

  // Each tab opens at the top, as in an app; choosing the open tab again goes back to the top
  const selectTab = useCallback(
    (tab: AppTab) => {
      window.scrollTo({ top: 0, behavior: tab === activeTab ? 'smooth' : 'auto' });
      setActiveTab(tab);
    },
    [activeTab]
  );

  // Selected stop code (null = follow the nearest stop; user can pick any other stop)
  const [selectedStopCode, setSelectedStopCode] = useState<string | null>(null);

  // Load a service's real stop sequence from LTA DataMall, falling back to bundled data if offline
  const loadRoute = useCallback(
    async (serviceNo: string, opts: { direction?: number; stopCode?: string; remember?: boolean } = {}) => {
      busChosen.current = true;
      const requestId = ++routeRequestId.current;
      setIsRouteLoading(true);
      const result = await fetchBusRoute(serviceNo);
      if (requestId !== routeRequestId.current) return;
      setIsRouteLoading(false);

      if (result.status === 'not_found') {
        setRouteNotice(`Bus ${serviceNo.toUpperCase()} is not a current LTA bus service. Please check the number.`);
        return;
      }

      const route =
        result.status === 'ok' ? { ...result.route, source: 'LTA_DATAMALL' as const } : getOrCreateBusRoute(serviceNo);
      setRouteNotice(
        result.status === 'ok'
          ? null
          : `Live LTA route data is unavailable right now, so the stops shown for Bus ${route.serviceNo} are approximate.`
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
      setSelectedStopCode(opts.stopCode ?? null);

      // Upgrade straight stop-to-stop lines to road-following OpenStreetMap geometry when it matches the stops
      const shapes = await fetchRouteShapes(route.serviceNo);
      if (requestId !== routeRequestId.current) return;
      const shaped = applyRouteShapes(route, shapes);
      if (shaped !== route) setCurrentRoute(shaped);
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
    () => routeDir.stops.find((s) => s.code === selectedStopCode) ?? nearestStop,
    [routeDir, selectedStopCode, nearestStop]
  );

  // Real-time Bus Arrival Timings for active selected stop
  const { services: stopServices, dataSource, lastUpdated, isRefreshing, secondsUntilRefresh, refresh: handleRefresh } =
    useStopArrivals(selectedStop.code);

  const handleSelectStop = useCallback((stop: BusStop) => {
    setSelectedStopCode(stop.code);
  }, []);

  const handleSetDirection = useCallback((dir: number) => {
    setDirection(dir);
    setSelectedStopCode(null);
  }, []);

  // Changing location re-targets the nearest stop and the direction closest to the user
  const applyUserLocation = useCallback((loc: UserLocation) => {
    locationRevisionRef.current += 1;
    userLocationRef.current = loc;
    setUserLocation(loc);
    saveUserLocation(loc);
    setSelectedStopCode(null);
    setDirection(pickNearestDirection(currentRouteRef.current, loc.lat, loc.lng));
  }, []);

  // LTA bus network (every stop and service direction, built at deploy time) for nearby buses,
  // stop search and trip planning. Loaded once in the background.
  const [network, setNetwork] = useState<BusNetwork | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let active = true;
    loadBusNetwork().then((net) => {
      if (!active) return;
      setNetwork(net);
      setNetworkStatus(net ? 'ready' : 'unavailable');
    });
    return () => {
      active = false;
    };
  }, []);

  // Bus stops nearest the user, with their services (null while loading, undefined if the network is unavailable)
  const nearbyStops = useMemo(
    () =>
      network ? nearestStops(network, userLocation.lat, userLocation.lng) : networkStatus === 'loading' ? null : undefined,
    [network, networkStatus, userLocation.lat, userLocation.lng]
  );

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

  // Places chosen recently as a start or destination
  const [recentPlaces, setRecentPlaces] = useState<PlaceResult[]>(() => loadRecentPlaces());
  const rememberPlace = useCallback((place: PlaceResult) => {
    setRecentPlaces((current) => addRecentPlace(place, current));
  }, []);

  // Trip planning: buses from the user's location to a destination
  const [destination, setDestination] = useState<PlaceResult | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  // The bus chosen for each leg of a trip where more than one service runs between the same stops (trip id -> service per leg)
  const [tripServices, setTripServices] = useState<Record<string, string[]>>({});

  const tripPlan = useMemo(
    () => (network && destination ? planTrips(network, userLocation, destination) : null),
    [network, destination, userLocation.lat, userLocation.lng]
  );

  // Live arrivals where each bus of each option is boarded (the first bus's for departure times, all of them
  // to see which of the buses that run between the same stops are due), refreshed while a destination is set
  const tripBoardStops = useMemo(
    () => tripPlan?.options.flatMap((o) => o.legs.map((l) => l.board.code)) ?? [],
    [tripPlan]
  );
  const tripArrivals = useStopsArrivals(tripBoardStops, !!tripPlan);

  // Services with a bus due at a trip's boarding stop (upper case), or null if not known
  const servicesDueAt = useCallback(
    (stopCode: string) => {
      const services = tripArrivals[stopCode];
      return services ? new Set(services.filter((s) => s.nextBus).map((s) => s.serviceNo.toUpperCase())) : null;
    },
    [tripArrivals]
  );

  // Ranked by door-to-door time using live waits where known; options with no bus due go last. A trip from the
  // tracked stop uses the arrivals card's own (more often refreshed) times, so the two give the same leave time.
  const rankedTrips = useMemo<RankedTrip[]>(() => {
    if (!tripPlan) return [];
    const arrivalsAt = (code: string) =>
      code === selectedStop.code && dataSource === 'LTA_DATAMALL_V3' && stopServices ? stopServices : tripArrivals[code];
    const ranked = tripPlan.options.map((option) => ({
      option,
      live: liveDeparture(option, arrivalsAt(option.legs[0].board.code)),
    }));
    return ranked.sort((a, b) => {
      const diff = tripScore(a.option, a.live) - tripScore(b.option, b.live);
      return Number.isNaN(diff) ? 0 : diff;
    });
  }, [tripPlan, tripArrivals, selectedStop.code, dataSource, stopServices]);

  // Which leg of a trip the tracked bus is, from the tracked stop (-1 if it isn't part of that trip)
  const legOfTrackedBus = useCallback(
    (option: TripOption) => {
      const svc = currentRoute.serviceNo.toUpperCase();
      const boardIndex = routeDir.stops.findIndex((s) => s.code === selectedStop.code);
      return option.legs.findIndex(
        (leg) =>
          leg.board.code === selectedStop.code &&
          [leg.serviceNo, ...leg.alsoServiceNos].some((s) => s.toUpperCase() === svc) &&
          routeDir.stops.some((s, i) => i > boardIndex && s.code === leg.alight.code)
      );
    },
    [currentRoute.serviceNo, routeDir, selectedStop.code]
  );

  // The trip shown with the tracked bus: the one chosen in the trip list, or else a suggested trip that uses
  // the tracked bus from the tracked stop (direct trips first), so a bus picked another way still shows the
  // whole trip, including the bus after a change
  const plannedTrip = useMemo(() => {
    if (!tripPlan) return null;
    const chosen = tripPlan.options.find((o) => o.id === selectedTripId);
    if (chosen) return chosen;
    const fewestChanges = [...tripPlan.options].sort((a, b) => a.legs.length - b.legs.length);
    return fewestChanges.find((o) => legOfTrackedBus(o) >= 0) ?? null;
  }, [tripPlan, selectedTripId, legOfTrackedBus]);
  const trackedLeg = plannedTrip ? legOfTrackedBus(plannedTrip) : -1;

  // A trip with the bus chosen for each leg. The tracked bus is the one chosen for its leg; a leg nobody chose a
  // bus for gets its quickest bus, or if none of that is due, the quickest of the others that is.
  const withChosenBuses = useCallback(
    (option: TripOption) => {
      const chosen = option.legs.map((leg, i) => {
        const picked = tripServices[option.id]?.[i];
        if (picked) return picked;
        const due = servicesDueAt(leg.board.code);
        if (!due || due.has(leg.serviceNo.toUpperCase())) return leg.serviceNo;
        return leg.alternatives.find((a) => due.has(a.serviceNo.toUpperCase()))?.serviceNo ?? leg.serviceNo;
      });
      if (option.id === plannedTrip?.id && trackedLeg >= 0) chosen[trackedLeg] = currentRoute.serviceNo;
      return withServices(option, chosen);
    },
    [tripServices, servicesDueAt, plannedTrip?.id, trackedLeg, currentRoute.serviceNo]
  );
  const selectedTrip = useMemo(() => plannedTrip && withChosenBuses(plannedTrip), [plannedTrip, withChosenBuses]);

  // Track the first bus of a trip at its boarding stop
  const selectTrip = useCallback(
    (option: TripOption) => {
      setSelectedTripId(option.id);
      const leg = option.legs[0];
      loadRoute(leg.serviceNo, { direction: leg.direction, stopCode: leg.board.code });
    },
    [loadRoute]
  );

  // Track one bus of a trip (e.g. the bus after a change) at its boarding stop, keeping the trip shown and the
  // buses chosen for its other legs
  const trackTripLeg = useCallback(
    (option: TripOption, index: number) => {
      const leg = option.legs[index];
      if (!leg) return;
      setTripServices((current) => ({ ...current, [option.id]: option.legs.map((l) => l.serviceNo) }));
      setSelectedTripId(option.id);
      loadRoute(leg.serviceNo, { direction: leg.direction, stopCode: leg.board.code });
    },
    [loadRoute]
  );
  const trackTripLegAt = useCallback(
    (index: number) => {
      if (selectedTrip) trackTripLeg(selectedTrip, index);
    },
    [selectedTrip, trackTripLeg]
  );

  // Take another bus that runs between the same stops for one leg of a trip; when it's the leg of the tracked
  // bus, track the chosen bus instead
  const chooseTripService = useCallback(
    (option: TripOption, index: number, serviceNo: string) => {
      const services = option.legs.map((l) => l.serviceNo);
      services[index] = serviceNo;
      const chosen = withServices(option, services);
      if (option.id === plannedTrip?.id && index === trackedLeg) trackTripLeg(chosen, index);
      else {
        setTripServices((current) => ({ ...current, [option.id]: services }));
        setSelectedTripId(option.id);
      }
    },
    [plannedTrip?.id, trackedLeg, trackTripLeg]
  );
  const chooseTripServiceAt = useCallback(
    (index: number, serviceNo: string) => {
      if (selectedTrip) chooseTripService(selectedTrip, index, serviceNo);
    },
    [selectedTrip, chooseTripService]
  );

  // The trip list with the buses chosen in it (ranked by the main buses, so choosing one doesn't reorder the list)
  const shownTrips = useMemo<RankedTrip[]>(
    () => rankedTrips.map((trip) => ({ ...trip, option: withChosenBuses(trip.option) })),
    [rankedTrips, withChosenBuses]
  );

  // Choosing a bus some other way (search, nearby, favourites...) leaves the trip list and drops the chosen
  // trip; a suggested trip that uses that bus from that stop is still shown
  const trackService = useCallback(
    (serviceNo: string, opts: { direction?: number; stopCode?: string; remember?: boolean } = {}) => {
      setSelectedTripId(null);
      loadRoute(serviceNo, opts);
    },
    [loadRoute]
  );

  // Once live times are in for a new plan, pick the best option and show it on the map
  const tripPlanKey = tripPlan && destination
    ? `${destination.id}|${userLocation.lat},${userLocation.lng}|${tripPlan.options.map((o) => o.id).join(',')}`
    : '';
  const autoSelectedPlanKey = useRef('');
  useEffect(() => {
    if (!tripPlanKey || autoSelectedPlanKey.current === tripPlanKey) return;
    if (rankedTrips.some((t) => t.live.status === 'loading')) return;
    autoSelectedPlanKey.current = tripPlanKey;
    const best = shownTrips[0];
    if (best && best.live.status !== 'not-running') selectTrip(best.option);
    else setSelectedTripId(null);
  }, [tripPlanKey, rankedTrips, shownTrips, selectTrip]);

  const handleSetDestination = useCallback(
    (place: PlaceResult) => {
      rememberPlace(place);
      setDestination(place);
      setSelectedTripId(null);
      setTripServices({});
    },
    [rememberPlace]
  );

  const handleClearDestination = useCallback(() => {
    setDestination(null);
    setSelectedTripId(null);
    setTripServices({});
  }, []);

  // Citymapper's swap: the trip back, from the destination to where this trip starts
  const handleSwapTrip = useCallback(() => {
    if (!destination) return;
    const from = userLocationRef.current;
    applyUserLocation(placeToLocation(destination));
    setDestination({
      id: `swap-${from.lat.toFixed(5)},${from.lng.toFixed(5)}`,
      kind: from.kind ?? 'address',
      name: from.isSimulated ? from.name : 'My GPS location',
      ...(from.address ? { subtitle: from.address } : {}),
      lat: from.lat,
      lng: from.lng,
    });
    setSelectedTripId(null);
    setTripServices({});
  }, [destination, applyUserLocation]);

  const tripState = useMemo<TripPlannerState>(() => {
    if (tripPlan) return { status: 'ready', plan: tripPlan, trips: shownTrips };
    return { status: networkStatus === 'unavailable' ? 'unavailable' : 'loading' };
  }, [tripPlan, shownTrips, networkStatus]);

  // Road-following lines for the chosen trip's bus legs (straight stop-to-stop lines until they load)
  const [tripRoadPaths, setTripRoadPaths] = useState<{
    key: string;
    legs: ({ path: [number, number][]; followsRoads: boolean } | null)[];
  } | null>(null);
  const tripPathKey = selectedTrip ? `${selectedTrip.id}|${selectedTrip.legs.map((l) => l.serviceNo).join('>')}` : '';

  useEffect(() => {
    if (!selectedTrip) return;
    let active = true;
    const key = tripPathKey;
    Promise.all(
      selectedTrip.legs.map(async (leg) => {
        const result = await fetchBusRoute(leg.serviceNo);
        if (result.status !== 'ok') return null;
        const shaped = applyRouteShapes(result.route, await fetchRouteShapes(leg.serviceNo));
        const dir = leg.direction === 2 && shaped.direction2 ? shaped.direction2 : shaped.direction1;
        return legPath(dir, leg.board.code, leg.alight.code);
      })
    ).then((legs) => {
      if (active) setTripRoadPaths({ key, legs });
    });
    return () => {
      active = false;
    };
    // Only when the trip or the buses chosen for it change, not on every new trip object
  }, [tripPathKey]);

  const journey = useMemo<JourneyOverlay | null>(() => {
    if (!network || !destination) return null;
    const from = { lat: userLocation.lat, lng: userLocation.lng, name: userLocation.name };
    const to = { lat: destination.lat, lng: destination.lng, name: destination.name };
    // Close enough to walk: show just the destination and the walk
    if (tripPlan && tripPlan.options.length === 0) {
      return { id: `walk@${from.lat},${from.lng}>${destination.id}`, from, to, legs: [] };
    }
    if (!selectedTrip) return null;
    const road = tripRoadPaths?.key === tripPathKey ? tripRoadPaths.legs : [];
    const pick = ({ code, name, lat, lng }: TripLeg['board']) => ({ code, name, lat, lng });
    return {
      id: `${selectedTrip.id}@${from.lat},${from.lng}>${destination.id}`,
      from,
      to,
      legs: selectedTrip.legs.map((leg, i) => {
        const stops = network.patterns[leg.patternIndex].stops.slice(leg.boardPos, leg.alightPos + 1);
        return {
          serviceNo: leg.serviceNo,
          otherServiceNos: leg.alsoServiceNos,
          board: pick(leg.board),
          alight: pick(leg.alight),
          path: road[i]?.path ?? stops.map((s): [number, number] => [network.stops[s].lat, network.stops[s].lng]),
          followsRoads: road[i]?.followsRoads ?? false,
        };
      }),
      ...(trackedLeg >= 0 ? { activeLeg: trackedLeg } : {}),
    };
  }, [selectedTrip, trackedLeg, tripPlan, network, destination, tripRoadPaths, tripPathKey, userLocation]);

  // Which of the buses that run a leg's stops have no bus due at its boarding stop now (none if not known)
  const notDueAt = useCallback(
    (leg: TripLeg) => {
      const due = servicesDueAt(leg.board.code);
      return due ? legServiceNos(leg).filter((no) => !due.has(no.toUpperCase())) : [];
    },
    [servicesDueAt]
  );

  // The shown trip with the stops of each bus, for showing the other bus of a trip with a change alongside
  // the tracked one (null unless the tracked bus is part of it)
  const tripView = useMemo<TripView | null>(() => {
    if (!network || !destination || !selectedTrip || trackedLeg < 0) return null;
    return {
      id: selectedTrip.id,
      destinationName: destination.name,
      legIndex: trackedLeg,
      legs: selectedTrip.legs.map((leg) => ({
        serviceNo: leg.serviceNo,
        serviceNos: legServiceNos(leg),
        notDueServiceNos: notDueAt(leg),
        towards: leg.towards,
        board: stopRef(leg.board),
        alight: stopRef(leg.alight),
        stops: network.patterns[leg.patternIndex].stops.slice(leg.boardPos, leg.alightPos + 1).map((i) => stopRef(network.stops[i])),
        rideMin: leg.rideMin,
      })),
      transferWalkM: selectedTrip.transferWalkM,
      transferWalkMin: selectedTrip.transferWalkMin,
      walkEndM: selectedTrip.walkEndM,
      walkEndMin: selectedTrip.walkEndMin,
    };
  }, [network, destination, selectedTrip, trackedLeg, notDueAt]);

  // Where to get off the bus being tracked, when a destination is set
  const alightHint = useMemo<AlightHint | null>(() => {
    if (!network || !destination) return null;

    // Part of the shown trip: get off where that trip says, which is the change stop on the first bus of a trip with a change
    if (selectedTrip && tripView) {
      const leg = selectedTrip.legs[tripView.legIndex];
      const isLast = tripView.legIndex === selectedTrip.legs.length - 1;
      return {
        status: 'alight',
        stop: stopRef(leg.alight),
        stopCount: leg.stopCount,
        rideMin: leg.rideMin,
        walkM: isLast ? selectedTrip.walkEndM : selectedTrip.transferWalkM,
        walkMin: isLast ? selectedTrip.walkEndMin : selectedTrip.transferWalkMin,
        destinationName: destination.name,
        trip: tripView,
      };
    }

    // Otherwise the stop on this bus that gets closest to the destination
    const boardIndex = routeDir.stops.findIndex((s) => s.code === selectedStop.code);
    const isLaterStop = (code: string) => routeDir.stops.some((s, i) => i > boardIndex && s.code === code);
    const advice = alightFor(network, currentRoute.serviceNo, direction, selectedStop.code, destination);
    if (advice?.status === 'alight' && isLaterStop(advice.leg.alight.code)) {
      return {
        status: 'alight',
        stop: stopRef(advice.leg.alight),
        stopCount: advice.leg.stopCount,
        rideMin: advice.leg.rideMin,
        walkM: advice.walkEndM,
        walkMin: advice.walkEndMin,
        destinationName: destination.name,
      };
    }
    if (advice?.status === 'not-near') {
      return { status: 'not-near', stop: stopRef(advice.closest), distanceM: advice.distanceM, destinationName: destination.name };
    }
    return null;
  }, [network, destination, currentRoute.serviceNo, direction, routeDir, selectedStop.code, selectedTrip, tripView]);

  // The ride the "Get off now" alarm follows: the tracked bus, from its stop to the one to get off at
  const alarmRide = useMemo<AlarmRide | null>(() => {
    if (alightHint?.status !== 'alight') return null;
    let stops = alightHint.trip?.legs[alightHint.trip.legIndex].stops;
    if (!stops) {
      const from = routeDir.stops.findIndex((s) => s.code === selectedStop.code);
      const to = routeDir.stops.findIndex((s, i) => i > from && s.code === alightHint.stop.code);
      if (from < 0 || to < 0) return null;
      stops = routeDir.stops.slice(from, to + 1).map(stopRef);
    }
    if (stops.length < 2) return null;
    const svc = currentRoute.serviceNo;
    return { key: `${svc}|${stops[0].code}|${stops[stops.length - 1].code}`, serviceNo: svc, stops };
  }, [alightHint, routeDir, selectedStop.code, currentRoute.serviceNo]);
  const getOffAlarm = useGetOffAlarm(alarmRide);

  // What comes after getting off, for the alarm's bubble
  const afterGetOff = useMemo(() => {
    if (alightHint?.status !== 'alight') return undefined;
    const next = alightHint.trip?.legs[alightHint.trip.legIndex + 1];
    if (next) return `then Bus ${next.serviceNo} from ${alightHint.walkM > 0 ? next.board.name : 'the same stop'}`;
    return `then ~${Math.max(1, Math.round(alightHint.walkMin))} min walk to ${alightHint.destinationName}`;
  }, [alightHint]);

  const showTripOnMap = useCallback(() => {
    setActiveTab('map');
    // After the map tab renders
    setTimeout(() => document.getElementById('trip-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  // Route labels and arrival data always describe the current stop/service, including during loading.
  const arrivals = useMemo<BusServiceArrivals>(() => {
    const service = stopServices?.find((item) => item.serviceNo.toUpperCase() === currentRoute.serviceNo.toUpperCase());
    const buses = dataSource === 'FALLBACK_SIMULATED'
      ? generateArrivalTimings(currentRoute.serviceNo, selectedStop.code)
      : { nextBus: service?.nextBus ?? null, nextBus2: service?.nextBus2 ?? null, nextBus3: service?.nextBus3 ?? null };
    return {
      serviceNo: currentRoute.serviceNo,
      operator: currentRoute.operator,
      stopCode: selectedStop.code,
      stopName: selectedStop.name,
      roadName: selectedStop.road,
      destination: routeDir.destination,
      direction,
      ...buses,
      lastUpdated,
    };
  }, [currentRoute.serviceNo, currentRoute.operator, selectedStop, routeDir.destination, direction, stopServices, dataSource, lastUpdated]);

  // Real buses approaching the selected stop, plotted from LTA GPS positions (live data only)
  const incomingBuses = useMemo<IncomingBus[]>(() => {
    if (dataSource !== 'LTA_DATAMALL_V3' || arrivals.serviceNo !== currentRoute.serviceNo) return [];
    return ([arrivals.nextBus, arrivals.nextBus2, arrivals.nextBus3] as const).flatMap((bus, i) =>
      bus && bus.monitored && bus.lat && bus.lng && bus.lat > 1
        ? [
            {
              id: `${arrivals.serviceNo}-${arrivals.stopCode}-${i + 1}`,
              serviceNo: arrivals.serviceNo,
              ordinal: (i + 1) as 1 | 2 | 3,
              lat: bus.lat,
              lng: bus.lng,
              etaMinutes: bus.estimatedMinutes,
              load: bus.load,
              type: bus.type,
              feature: bus.feature,
            },
          ]
        : []
    );
  }, [arrivals, dataSource, currentRoute.serviceNo]);

  // LTA traffic incidents (accidents, roadworks, breakdowns...) near the route being viewed
  const [trafficIncidents, setTrafficIncidents] = useState<TrafficIncident[]>([]);

  useEffect(() => {
    const load = async () => {
      const incidents = await fetchTrafficIncidents();
      if (incidents) setTrafficIncidents(incidents);
    };
    load();
    const timer = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const incidentsOnRoute = useMemo(
    () => trafficIncidents.filter((i) => distanceToPathMeters([i.lat, i.lng], routeDir.path) <= INCIDENT_ROUTE_DISTANCE_M),
    [trafficIncidents, routeDir]
  );

  // NEA weather: one Singapore-wide snapshot, summarised for wherever the user is
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(false);
  const weatherRetries = useRef(0);

  const loadWeather = useCallback(async () => {
    setIsWeatherLoading(true);
    try {
      setWeatherSnapshot(await fetchWeatherSnapshot());
      setWeatherError(false);
    } catch {
      setWeatherError(true);
    } finally {
      setIsWeatherLoading(false);
    }
  }, []);

  // Refresh every 5 minutes (NEA updates readings every 1-5 min; the API caches for 1 min)
  useEffect(() => {
    loadWeather();
    const timer = setInterval(loadWeather, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadWeather]);

  // A cold API instance fetches datasets in batches to respect data.gov.sg's rate limit,
  // so if some are still missing, ask again shortly to fill the gaps
  useEffect(() => {
    if (!weatherSnapshot?.missing.length) {
      weatherRetries.current = 0;
      return;
    }
    if (weatherRetries.current >= 3) return;
    const timer = setTimeout(() => {
      weatherRetries.current += 1;
      loadWeather();
    }, 12000);
    return () => clearTimeout(timer);
  }, [weatherSnapshot, loadWeather]);

  const weather = useMemo(
    () => (weatherSnapshot ? summarizeWeather(weatherSnapshot, userLocation.lat, userLocation.lng) : null),
    [weatherSnapshot, userLocation]
  );

  // Favorites state
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    // Seed default favorite (Bus 72 at Nanyang Poly, towards Tampines)
    return [
      {
        id: 'fav-72-55329',
        serviceNo: '72',
        stopCode: '55329',
        stopName: 'Nanyang Poly',
        roadName: 'Ang Mo Kio Ave 8',
        direction: 1,
        destination: 'Tampines Int',
        savedAt: Date.now(),
      },
    ];
  });

  const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);


  // Live next-bus times for favourites, while they are on screen (the mini card or the modal)
  const favoriteArrivals = useFavoriteArrivals(favorites, isFavoritesModalOpen || activeTab === 'arrivals');

  const saveFavorites = (items: FavoriteItem[]) => {
    setFavorites(items);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  const isCurrentFavorite = useMemo(() => {
    return favorites.some(
      (f) => f.serviceNo === currentRoute.serviceNo && f.stopCode === selectedStop.code
    );
  }, [favorites, currentRoute.serviceNo, selectedStop.code]);

  const handleToggleFavorite = () => {
    if (isCurrentFavorite) {
      saveFavorites(
        favorites.filter(
          (f) => !(f.serviceNo === currentRoute.serviceNo && f.stopCode === selectedStop.code)
        )
      );
    } else {
      const newFav: FavoriteItem = {
        id: `fav-${currentRoute.serviceNo}-${selectedStop.code}-${Date.now()}`,
        serviceNo: currentRoute.serviceNo,
        stopCode: selectedStop.code,
        stopName: selectedStop.name,
        roadName: selectedStop.road,
        direction,
        destination: routeDir.destination,
        savedAt: Date.now(),
      };
      saveFavorites([newFav, ...favorites]);
    }
  };

  const handleRemoveFavorite = (id: string) => {
    saveFavorites(favorites.filter((f) => f.id !== id));
  };

  const handleSelectFavorite = (fav: FavoriteItem) => {
    trackService(fav.serviceNo, { direction: fav.direction, stopCode: fav.stopCode });
  };

  // Handle bus number search submission
  const handleSearchBus = (num: string) => {
    trackService(num, { remember: true });
  };

  const handleSelectStopService = (nearby: NearbyStop, svc: StopService) => {
    trackService(svc.serviceNo, { direction: svc.direction, stopCode: nearby.stop.code });
  };

  const tripCard = destination && (
    <TripPlannerCard
      destination={destination}
      fromName={activeTab === 'map' ? userLocation.name : undefined}
      state={tripState}
      selectedId={selectedTrip?.id ?? null}
      canShowMap={!!journey}
      onSelect={selectTrip}
      onTrackLeg={trackTripLeg}
      onChooseService={chooseTripService}
      notDueAt={notDueAt}
      trackedServiceNo={currentRoute.serviceNo}
      trackedStopCode={selectedStop.code}
      onShowMap={showTripOnMap}
      onClear={handleClearDestination}
    />
  );

  const openWeatherTab = () => selectTab('weather');

  // The next-bus bar on phones opens the full arrivals card, which is on the Arrivals tab
  const showArrivalsCard = () => {
    const scroll = () => document.getElementById(ARRIVALS_CARD_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (activeTab === 'arrivals') return scroll();
    selectTab('arrivals');
    setTimeout(scroll, 50); // after the tab renders
  };

  const selectedStopDistance = stopsWithDistance.find((s) => s.code === selectedStop.code)?.distanceMeters ?? distanceMeters;
  // The walk to the tracked stop: when the trip shown boards there, the trip's own figure (its stop positions can
  // differ by a metre), so the card and the trip work from the same walk
  const walkToStopM =
    selectedTrip && selectedTrip.legs[0].board.code === selectedStop.code ? selectedTrip.walkStartM : selectedStopDistance;
  const isLiveFeed = dataSource === 'LTA_DATAMALL_V3';

  // Citymapper's "Leave within": how long before walking from where the trip starts to the tracked stop, to catch
  // one of its next buses (only when the stop is a walk away)
  const leave = useMemo(
    () =>
      isLiveFeed && walkToStopM <= WALKABLE_STOP_M
        ? leaveWithin(walkToStopM, [arrivals.nextBus, arrivals.nextBus2, arrivals.nextBus3])
        : null,
    [isLiveFeed, walkToStopM, arrivals]
  );

  // The tracked bus's next times, for the bubble over its stop on the map
  const stopEtas = useMemo(
    () =>
      isLiveFeed && arrivals.nextBus
        ? {
            serviceNo: arrivals.serviceNo,
            minutes: [arrivals.nextBus, arrivals.nextBus2, arrivals.nextBus3].flatMap((b) => (b ? [b.estimatedMinutes] : [])),
            live: !!arrivals.nextBus.monitored,
          }
        : null,
    [isLiveFeed, arrivals]
  );

  // Leave now, wait or take an umbrella: the rain around the user (and at the destination) against the walk to the
  // stop, the next buses and when the bus gets there
  const rainAdviceNow = useMemo(() => {
    if (!weatherSnapshot || !weather) return null;
    // The walk to the tracked bus's stop; if that stop is too far from where the trip starts to walk to (a bus
    // tracked elsewhere), the walk to the nearest stop there, without bus times
    const walkable = walkToStopM <= WALKABLE_STOP_M;
    const nearest = nearbyStops?.[0];
    const walkM = walkable ? walkToStopM : nearest && nearest.distanceM <= WALKABLE_STOP_M ? nearest.distanceM : undefined;
    // Within 50 m you're at the stop; otherwise at least a minute's walk (the same walk as "Leave within")
    const walkMin = walkM === undefined ? undefined : walkMinutes(walkM);
    const busMin = walkable
      ? [arrivals.nextBus, arrivals.nextBus2, arrivals.nextBus3].flatMap((b) => (b ? [Math.max(0, b.estimatedMinutes)] : []))
      : [];
    const caught = firstCatchable(walkMin ?? 0, busMin.map((m) => ({ estimatedMinutes: m })));
    const boardIn = Math.max(walkMin ?? 0, caught?.estimatedMinutes ?? 0);

    // When the bus gets to the stop for the destination, and the walk from there
    let end: { arriveInMin: number; walkMin: number } | null = null;
    if (destination && alightHint?.status === 'alight') {
      if (selectedTrip && tripView?.legIndex === 0) {
        end = {
          arriveInMin: boardIn + selectedTrip.travelMin - selectedTrip.walkStartMin - selectedTrip.walkEndMin,
          walkMin: selectedTrip.walkEndMin,
        };
      } else if (walkable && (!alightHint.trip || alightHint.trip.legIndex === alightHint.trip.legs.length - 1)) {
        end = { arriveInMin: boardIn + alightHint.rideMin, walkMin: alightHint.walkMin };
      }
    }
    // A destination this close shares the rain gauges around the user, so it would only repeat what's said here
    const farEnough = destination && calculateDistanceMeters(userLocation.lat, userLocation.lng, destination.lat, destination.lng) > 3000;
    const atDestination: RainAdviceInput['destination'] =
      destination && end && farEnough
        ? {
            name: destination.name,
            nowcast: rainNowcast(weatherSnapshot.rainfall?.history, destination.lat, destination.lng),
            forecast: forecastAt(weatherSnapshot, destination.lat, destination.lng),
            arriveInMin: Math.round(end.arriveInMin),
            walkMin: Math.round(end.walkMin),
          }
        : undefined;

    return rainAdvice({
      here: weather.nowcast ?? { status: 'unknown' },
      area: weather.area,
      forecast: weather.forecast2h?.text,
      lightning: weather.lightning,
      walkMin,
      stopName: walkable ? arrivals.stopName : nearest?.stop.name,
      busServiceNo: walkable ? arrivals.serviceNo : undefined,
      busMin,
      destination: atDestination,
    });
  }, [weatherSnapshot, weather, walkToStopM, nearbyStops, arrivals, destination, alightHint, selectedTrip, tripView, userLocation]);

  // The advice is for where the trip starts (the From row: GPS or a chosen place), so it says so
  const fromPlace = userLocation.name.split('(')[0].trim();
  const rainSource = weatherSnapshot?.rainfall?.history
    ? `For ${fromPlace} · NEA rain gauges ${formatSgTime(weatherSnapshot.rainfall.timestamp)} & 2-hr forecast`
    : weather?.forecast2h
      ? `For ${fromPlace} · NEA 2-hr forecast ${formatSgTime(weather.forecast2h.updated)}`
      : undefined;

  // The advice covers rain and lightning, so the weather beside it on the Arrivals tab leaves those alerts out
  const arrivalsWeather = useMemo(
    () =>
      weather && rainAdviceNow
        ? { ...weather, alerts: weather.alerts.filter((a) => a.kind !== 'rain' && a.kind !== 'lightning' && a.kind !== 'ok') }
        : weather,
    [weather, rainAdviceNow]
  );

  // The live arrivals card (wider screens: on the arrivals, map and stops tabs; phones: on the arrivals tab, where
  // it also shows how far the stop is and saves it, in place of the nearest-stop banner)
  const arrivalsCard = (
    <div id={ARRIVALS_CARD_ID} className="scroll-mt-4 sm:scroll-mt-28">
      <ArrivalDisplay
        arrivals={arrivals}
        activeStop={selectedStop}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        dataSource={dataSource}
        secondsUntilRefresh={secondsUntilRefresh}
        alight={alightHint}
        onTrackLeg={trackTripLegAt}
        onChooseService={chooseTripServiceAt}
        getOffAlarm={alarmRide && getOffAlarm.supported ? getOffAlarm : undefined}
        leave={leave}
        {...(isPhone
          ? {
              stopInfo: {
                distanceM: selectedStopDistance,
                isNearest: selectedStop.code === nearestStop.code,
                onShowNearest: () => handleSelectStop(nearestStop),
              },
              isFavorite: isCurrentFavorite,
              onToggleFavorite: handleToggleFavorite,
            }
          : {})}
      />
    </div>
  );

  // The most serious weather alert worth a look, for a dot on the Weather tab on phones (alerts come most serious first)
  const topWeatherAlert = weather?.alerts[0];
  const weatherAlertTone =
    topWeatherAlert && ['warn', 'bad', 'severe'].includes(topWeatherAlert.tone) ? topWeatherAlert.tone : null;

  // Where from and to, and the bus search: on the Arrivals tab (wider screens: on every bus tab)
  const showTripInputs = activeTab === 'arrivals' || (!isPhone && activeTab !== 'weather');

  // Keep the saved location if GPS fails; a late fix must not override a new manual choice.
  useEffect(() => {
    let active = true;
    const revision = locationRevisionRef.current;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = locationFromGps(pos.coords);
          if (active && locationRevisionRef.current === revision && loc) applyUserLocation(loc);
        },
        () => {
          // Keep the last saved location, or NYP for a first visit.
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    }
    return () => { active = false; };
  }, [applyUserLocation]);

  return (
    <div className="min-h-screen bg-warm-50 text-warm-900 flex flex-col font-sans">
      {/* SBS Transit Navigation Header */}
      <Header
        userLocation={userLocation}
        onOpenLocationPicker={() => setIsLocationModalOpen(true)}
        favoritesCount={favorites.length}
        onOpenFavorites={() => setIsFavoritesModalOpen(true)}
        activeTab={activeTab}
        setActiveTab={selectTab}
        onRefreshAll={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Where the user is starting from and where they're going */}
        {showTripInputs && (
          <LocationBar
            location={userLocation}
            onOpenPicker={() => setIsLocationModalOpen(true)}
            onLocationChange={applyUserLocation}
            network={network}
            destination={destination}
            onSetDestination={handleSetDestination}
            onClearDestination={handleClearDestination}
            onSwap={handleSwapTrip}
            recentPlaces={recentPlaces}
          >
            {/* Leave now, wait or take an umbrella, for where the trip starts */}
            {activeTab === 'arrivals' && rainAdviceNow && (
              <RainAdviceStrip advice={rainAdviceNow} source={rainSource} onOpenWeather={openWeatherTab} />
            )}
          </LocationBar>
        )}

        {/* Trip options follow the destination, except on the map tab where the map comes first (phones: the stop
            list shows the trip itself) */}
        {(activeTab === 'arrivals' || (activeTab === 'stops' && !isPhone)) && tripCard}

        {/* Bus Search Box & Direction Selector */}
        {showTripInputs && (
          <BusSearchBox
            busNumber={searchedBus}
            onSearch={handleSearchBus}
            currentRoute={currentRoute}
            direction={direction}
            setDirection={handleSetDirection}
            nearbyStops={nearbyStops}
            locationName={userLocation.name.split('(')[0].trim()}
            trackedStopCode={selectedStop.code}
            onSelectStopService={handleSelectStopService}
            foldable={isPhone && !!destination}
          />
        )}

        {activeTab !== 'weather' && (isRouteLoading || routeNotice) && (
          <div
            className={`rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs border ${
              routeNotice && !isRouteLoading
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-warm-50 border-warm-200 text-warm-600'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{isRouteLoading ? 'Loading route stops from LTA DataMall...' : routeNotice}</span>
          </div>
        )}

        {/* Nearest Bus Stop Highlight Banner (phones: in the arrivals card; the Stops tab marks the nearest stop) */}
        {activeTab === 'arrivals' && !isPhone && (
          <NearestStopBanner
            nearestStop={nearestStop}
            selectedStop={selectedStop}
            onSelectStop={handleSelectStop}
            distanceMeters={distanceMeters}
            userLocation={userLocation}
            isFavorite={isCurrentFavorite}
            onToggleFavorite={handleToggleFavorite}
            onViewOnMap={() => selectTab('map')}
            onOpenStopsList={() => selectTab('stops')}
          />
        )}

        {/* Dynamic Tab Views */}
        {activeTab === 'arrivals' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Live Arrivals Board */}
            {arrivalsCard}

            <StopServicesBoard
              stop={selectedStop}
              services={stopServices}
              dataSource={dataSource}
              currentServiceNo={currentRoute.serviceNo}
              onSelectService={(serviceNo) => trackService(serviceNo, { stopCode: selectedStop.code })}
            />

            {/* Split row: Map Preview & NEA Weather (phones: the Map tab has the map, and the weather is one row) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
              {!isPhone && (
                <div className="lg:col-span-7">
                  <LiveBusMap
                    route={currentRoute}
                    direction={direction}
                    nearestStop={nearestStop}
                    selectedStop={selectedStop}
                    onSelectStop={handleSelectStop}
                    userLocation={userLocation}
                    incomingBuses={incomingBuses}
                    incidents={incidentsOnRoute}
                    journey={journey}
                    alight={alightHint}
                    etas={stopEtas}
                  />
                </div>
              )}
              <div className="lg:col-span-5 space-y-4 sm:space-y-6">
                {isPhone ? (
                  <WeatherStrip weather={arrivalsWeather} error={weatherError} onOpen={openWeatherTab} />
                ) : (
                  <NEAWeatherWidget
                    weather={arrivalsWeather}
                    isLoading={isWeatherLoading}
                    error={weatherError}
                    onRefreshWeather={loadWeather}
                    onShowAll={openWeatherTab}
                  />
                )}

                {/* Quick Favorites Mini Card */}
                <div className="bg-white rounded-2xl border border-warm-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between pb-2 border-b border-warm-100">
                    <span className="text-xs font-bold text-warm-800 flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 fill-helvetia text-helvetia" />
                      Saved Favourites ({favorites.length})
                    </span>
                    <button
                      onClick={() => setIsFavoritesModalOpen(true)}
                      className="text-xs text-helvetia font-semibold hover:underline"
                    >
                      View All
                    </button>
                  </div>
                  <div className="mt-2 divide-y divide-warm-100">
                    {favorites.slice(0, 3).map((f) => (
                      <div
                        key={f.id}
                        onClick={() => handleSelectFavorite(f)}
                        className="py-2 flex items-center justify-between text-xs hover:bg-warm-50 cursor-pointer rounded-lg px-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-helvetia text-white font-extrabold text-[11px] px-1.5 py-0.5 rounded">
                            {f.serviceNo}
                          </span>
                          <span className="text-warm-800 font-semibold truncate max-w-[140px]">
                            {f.stopName}
                          </span>
                        </div>
                        <NextBusLabel arrival={favoriteArrivals[f.id]} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'map' && (
          <div id="trip-map" className="space-y-4 scroll-mt-4 sm:scroll-mt-32">
            <LiveBusMap
              route={currentRoute}
              direction={direction}
              nearestStop={nearestStop}
              selectedStop={selectedStop}
              onSelectStop={handleSelectStop}
              userLocation={userLocation}
              incomingBuses={incomingBuses}
              incidents={incidentsOnRoute}
              journey={journey}
              alight={alightHint}
              etas={stopEtas}
            />
            {tripCard}
            {/* Quick arrival summary card below the map (phones: the next-bus bar) */}
            {!isPhone && arrivalsCard}
          </div>
        )}

        {activeTab === 'stops' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7">
              <RouteStopsList
                route={currentRoute}
                direction={direction}
                nearestStop={nearestStop}
                selectedStop={selectedStop}
                onSelectStop={handleSelectStop}
                stopsWithDistance={stopsWithDistance}
                alight={alightHint}
                onTrackLeg={trackTripLegAt}
                onChooseService={chooseTripServiceAt}
                onSwitchDirection={isPhone ? () => handleSetDirection(direction === 2 ? 1 : 2) : undefined}
              />
            </div>
            {/* Phones: the next-bus bar shows the arrivals at the stop chosen in the list */}
            {!isPhone && (
              <div className="lg:col-span-5 space-y-4">
                {arrivalsCard}
                <StopServicesBoard
                  stop={selectedStop}
                  services={stopServices}
                  dataSource={dataSource}
                  currentServiceNo={currentRoute.serviceNo}
                  onSelectService={(serviceNo) => trackService(serviceNo, { stopCode: selectedStop.code })}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'weather' && (
          <NEAWeatherWidget
            weather={weather}
            isLoading={isWeatherLoading}
            error={weatherError}
            onRefreshWeather={loadWeather}
            variant="full"
          />
        )}
      </main>

      {/* Phones: the next bus and the tabs pinned to the bottom of the screen (out of the way while typing) */}
      {isPhone && !isTyping && (
        <>
          {activeTab !== 'weather' && (
            <LiveArrivalsBar
              arrivals={arrivals}
              stop={selectedStop}
              dataSource={dataSource}
              alight={alightHint}
              leave={leave}
              alarmLine={
                getOffAlarm.on && alarmRide
                  ? alarmStatus(getOffAlarm, alarmRide.serviceNo, alarmRide.stops[alarmRide.stops.length - 1].name, true)
                  : null
              }
              targetId={ARRIVALS_CARD_ID}
              watchKey={activeTab}
              onOpen={showArrivalsCard}
            />
          )}
          <BottomTabBar activeTab={activeTab} onSelect={selectTab} weatherAlert={weatherAlertTone} />
        </>
      )}

      {/* Corporate Footer (room at the bottom on phones for the next-bus bar and the tabs) */}
      <footer className="mt-12 bg-white border-t border-warm-200 pt-6 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:pb-6 text-xs text-warm-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-helvetia flex items-center justify-center text-lemon font-bold text-[10px]">
              NYP
            </div>
            <span className="font-semibold text-warm-700">BusTrackerSG • A member of NYP Bus</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-warm-500">
            <span>Bus data: LTA DataMall</span>
            <span>•</span>
            <span>Weather: NEA via data.gov.sg</span>
            <span>•</span>
            <span>Map: OneMap (SLA) & OpenStreetMap contributors</span>
          </div>
        </div>
      </footer>

      {/* The get-off alarm going off */}
      {getOffAlarm.alert && alarmRide && (
        <GetOffBanner
          alert={getOffAlarm.alert}
          stop={alarmRide.stops[alarmRide.stops.length - 1]}
          then={afterGetOff}
          onDismiss={getOffAlarm.dismiss}
        />
      )}

      {/* Modals */}
      <FavoritesModal
        isOpen={isFavoritesModalOpen}
        onClose={() => setIsFavoritesModalOpen(false)}
        favorites={favorites}
        arrivals={favoriteArrivals}
        onRemoveFavorite={handleRemoveFavorite}
        onSelectFavorite={handleSelectFavorite}
      />

      <LocationPickerModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        currentLocation={userLocation}
        onSelectLocation={applyUserLocation}
        network={network}
        recentPlaces={recentPlaces}
        onPlaceChosen={rememberPlace}
      />
    </div>
  );
}
