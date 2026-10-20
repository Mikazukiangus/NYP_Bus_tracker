import { rankTrips, trackedLegIndex } from './selectors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BusRoute, BusStop, RouteDirection, StopServiceArrivals, ArrivalDataSource, UserLocation } from '../../types/bus';
import type { BusNetwork } from '../../services/busNetwork';
import { TripLeg, TripOption, legServiceNos, planTrips, withServices } from '../../services/tripPlanner';
import { PlaceResult, placeToLocation } from '../../services/placeSearch';
import { useStopsArrivals } from '../../services/useStopsArrivals';
import type { RankedTrip, TripPlannerState } from './model';

interface JourneyInputs {
  network: BusNetwork | null;
  networkStatus: 'loading' | 'ready' | 'unavailable';
  userLocation: UserLocation;
  currentRoute: BusRoute;
  routeDir: RouteDirection;
  selectedStop: BusStop;
  dataSource: ArrivalDataSource;
  stopServices: StopServiceArrivals[] | null;
  loadRoute: (serviceNo: string, opts?: { direction?: number; stopCode?: string; remember?: boolean }) => Promise<boolean>;
  rememberPlace: (place: PlaceResult) => void;
  applyUserLocation: (location: UserLocation) => void;
}

export function useJourneyPlan({ network, networkStatus, userLocation, currentRoute, routeDir, selectedStop, dataSource, stopServices, loadRoute, rememberPlace, applyUserLocation }: JourneyInputs) {
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
  const rankedTrips = useMemo(() => rankTrips({ tripPlan, selectedStop, dataSource, stopServices, tripArrivals }), [tripPlan, tripArrivals, selectedStop.code, dataSource, stopServices]);

  // Which leg of a trip the tracked bus is, from the tracked stop (-1 if it isn't part of that trip)
  const legOfTrackedBus = useCallback((option: TripOption) =>
    trackedLegIndex(option, currentRoute.serviceNo, routeDir, selectedStop.code),
    [currentRoute.serviceNo, routeDir, selectedStop.code]);

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
      return loadRoute(serviceNo, opts);
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
    const from = userLocation;
    applyUserLocation(placeToLocation(destination));
    setDestination({
      id: `swap-${from.lat.toFixed(5)},${from.lng.toFixed(5)}`,
      kind: from.kind ?? 'address',
      name: from.isSimulated ? from.name : 'Your location',
      ...(from.address ? { subtitle: from.address } : {}),
      lat: from.lat,
      lng: from.lng,
    });
    setSelectedTripId(null);
    setTripServices({});
  }, [destination, userLocation, applyUserLocation]);

  const tripState = useMemo<TripPlannerState>(() => {
    if (tripPlan) return { status: 'ready', plan: tripPlan, trips: shownTrips };
    return { status: networkStatus === 'unavailable' ? 'unavailable' : 'loading' };
  }, [tripPlan, shownTrips, networkStatus]);

  // Which of the buses that run a leg's stops have no bus due at its boarding stop now (none if not known)
  const notDueAt = useCallback(
    (leg: TripLeg) => {
      const due = servicesDueAt(leg.board.code);
      return due ? legServiceNos(leg).filter((no) => !due.has(no.toUpperCase())) : [];
    },
    [servicesDueAt]
  );

  return { destination, tripPlan, selectedTrip, trackedLeg, selectTrip, trackTripLeg, trackTripLegAt, chooseTripService, chooseTripServiceAt, trackService, handleSetDestination, handleClearDestination, handleSwapTrip, tripState, notDueAt };
}
