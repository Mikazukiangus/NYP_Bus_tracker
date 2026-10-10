import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AlightHint,
  BusRoute,
  BusStop,
  BusServiceArrivals,
  FavoriteItem,
  IncomingBus,
  JourneyOverlay,
  TrafficIncident,
  UserLocation
} from './types/bus';
import type { WeatherSnapshot } from './types/weather';
import {
  SINGAPORE_LOCATIONS,
  getOrCreateBusRoute
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
import { TripLeg, TripOption, alightFor, liveDeparture, planTrips, tripScore } from './services/tripPlanner';
import { PlaceResult, addRecentPlace, loadRecentPlaces } from './services/placeSearch';
import { useStopsArrivals } from './services/useStopsArrivals';
import { fetchWeatherSnapshot, summarizeWeather } from './services/neaWeather';
import { Header } from './components/Header';
import { BusSearchBox } from './components/BusSearchBox';
import { NearestStopBanner } from './components/NearestStopBanner';
import { ArrivalDisplay } from './components/ArrivalDisplay';
import { StopServicesBoard } from './components/StopServicesBoard';
import { LiveBusMap } from './components/LiveBusMap';
import { RouteStopsList } from './components/RouteStopsList';
import { NEAWeatherWidget } from './components/NEAWeatherWidget';
import { FavoritesModal, NextBusLabel } from './components/FavoritesModal';
import { LocationPickerModal } from './components/LocationPickerModal';
import { LocationBar } from './components/LocationBar';
import { RankedTrip, TripPlannerCard, TripPlannerState } from './components/TripPlannerCard';
import { useFavoriteArrivals } from './services/favoriteArrivals';
import { useStopArrivals } from './services/useStopArrivals';
import { loadSavedLocation, locationFromGps, saveUserLocation } from './services/userLocation';
import { Heart, AlertCircle } from 'lucide-react';

const FAVORITES_STORAGE_KEY = 'sbs_transit_favorites_v1';
// Incidents within this distance of the route line are shown on the map
const INCIDENT_ROUTE_DISTANCE_M = 150;

export default function App() {
  // Restore the last location immediately while requesting a fresh GPS fix.
  const [userLocation, setUserLocation] = useState<UserLocation>(() => loadSavedLocation() ?? SINGAPORE_LOCATIONS[0]);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const locationRevisionRef = useRef(0);

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  // Active Bus Service & Route (Default: 72, which stops at NYP on Ang Mo Kio Ave 8 / Ave 5).
  // The bundled route is only an offline placeholder until the real LTA route loads.
  const [busNumber, setBusNumber] = useState<string>('72');
  const [direction, setDirection] = useState<number>(1);
  const [currentRoute, setCurrentRoute] = useState<BusRoute>(() => getOrCreateBusRoute('72'));
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const routeRequestId = useRef(0);
  const currentRouteRef = useRef(currentRoute);
  currentRouteRef.current = currentRoute;

  // UI Active Tab: 'arrivals' | 'map' | 'stops' | 'weather'
  const [activeTab, setActiveTab] = useState<'arrivals' | 'map' | 'stops' | 'weather'>('arrivals');

  // Selected stop code (null = follow the nearest stop; user can pick any other stop)
  const [selectedStopCode, setSelectedStopCode] = useState<string | null>(null);

  // Load a service's real stop sequence from LTA DataMall, falling back to bundled data if offline
  const loadRoute = useCallback(
    async (serviceNo: string, opts: { direction?: number; stopCode?: string } = {}) => {
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
      setBusNumber(route.serviceNo);
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

  useEffect(() => {
    loadRoute('72');
  }, [loadRoute]);

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

  // Places chosen recently as a start or destination
  const [recentPlaces, setRecentPlaces] = useState<PlaceResult[]>(() => loadRecentPlaces());
  const rememberPlace = useCallback((place: PlaceResult) => {
    setRecentPlaces((current) => addRecentPlace(place, current));
  }, []);

  // Trip planning: buses from the user's location to a destination
  const [destination, setDestination] = useState<PlaceResult | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  const tripPlan = useMemo(
    () => (network && destination ? planTrips(network, userLocation, destination) : null),
    [network, destination, userLocation.lat, userLocation.lng]
  );

  // Live departures at each option's boarding stop, refreshed while a destination is set
  const tripBoardStops = useMemo(() => tripPlan?.options.map((o) => o.legs[0].board.code) ?? [], [tripPlan]);
  const tripArrivals = useStopsArrivals(tripBoardStops, !!tripPlan);

  // Ranked by door-to-door time using live waits where known; options with no bus due go last
  const rankedTrips = useMemo<RankedTrip[]>(() => {
    if (!tripPlan) return [];
    const ranked = tripPlan.options.map((option) => ({
      option,
      live: liveDeparture(option, tripArrivals[option.legs[0].board.code]),
    }));
    return ranked.sort((a, b) => {
      const diff = tripScore(a.option, a.live) - tripScore(b.option, b.live);
      return Number.isNaN(diff) ? 0 : diff;
    });
  }, [tripPlan, tripArrivals]);

  const selectedTrip = useMemo(
    () => tripPlan?.options.find((o) => o.id === selectedTripId) ?? null,
    [tripPlan, selectedTripId]
  );

  // Track the first bus of a trip at its boarding stop
  const selectTrip = useCallback(
    (option: TripOption) => {
      setSelectedTripId(option.id);
      const leg = option.legs[0];
      loadRoute(leg.serviceNo, { direction: leg.direction, stopCode: leg.board.code });
    },
    [loadRoute]
  );

  const trackTripLeg = useCallback(
    (leg: TripLeg) => loadRoute(leg.serviceNo, { direction: leg.direction, stopCode: leg.board.code }),
    [loadRoute]
  );

  // Choosing a bus some other way (search, nearby, favourites...) leaves the trip list but stops showing a trip
  const trackService = useCallback(
    (serviceNo: string, opts: { direction?: number; stopCode?: string } = {}) => {
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
    const best = rankedTrips[0];
    if (best && best.live.status !== 'not-running') selectTrip(best.option);
    else setSelectedTripId(null);
  }, [tripPlanKey, rankedTrips, selectTrip]);

  const handleSetDestination = useCallback(
    (place: PlaceResult) => {
      rememberPlace(place);
      setDestination(place);
      setSelectedTripId(null);
    },
    [rememberPlace]
  );

  const handleClearDestination = useCallback(() => {
    setDestination(null);
    setSelectedTripId(null);
  }, []);

  const tripState = useMemo<TripPlannerState>(() => {
    if (tripPlan) return { status: 'ready', plan: tripPlan, trips: rankedTrips };
    return { status: networkStatus === 'unavailable' ? 'unavailable' : 'loading' };
  }, [tripPlan, rankedTrips, networkStatus]);

  // Road-following lines for the chosen trip's bus legs (straight stop-to-stop lines until they load)
  const [tripRoadPaths, setTripRoadPaths] = useState<{
    tripId: string;
    legs: ({ path: [number, number][]; followsRoads: boolean } | null)[];
  } | null>(null);

  useEffect(() => {
    if (!selectedTrip) return;
    let active = true;
    Promise.all(
      selectedTrip.legs.map(async (leg) => {
        const result = await fetchBusRoute(leg.serviceNo);
        if (result.status !== 'ok') return null;
        const shaped = applyRouteShapes(result.route, await fetchRouteShapes(leg.serviceNo));
        const dir = leg.direction === 2 && shaped.direction2 ? shaped.direction2 : shaped.direction1;
        return legPath(dir, leg.board.code, leg.alight.code);
      })
    ).then((legs) => {
      if (active) setTripRoadPaths({ tripId: selectedTrip.id, legs });
    });
    return () => {
      active = false;
    };
  }, [selectedTrip]);

  const journey = useMemo<JourneyOverlay | null>(() => {
    if (!network || !destination) return null;
    const from = { lat: userLocation.lat, lng: userLocation.lng, name: userLocation.name };
    const to = { lat: destination.lat, lng: destination.lng, name: destination.name };
    // Close enough to walk: show just the destination and the walk
    if (tripPlan && tripPlan.options.length === 0) {
      return { id: `walk@${from.lat},${from.lng}>${destination.id}`, from, to, legs: [] };
    }
    if (!selectedTrip) return null;
    const road = tripRoadPaths?.tripId === selectedTrip.id ? tripRoadPaths.legs : [];
    const pick = ({ code, name, lat, lng }: TripLeg['board']) => ({ code, name, lat, lng });
    return {
      id: `${selectedTrip.id}@${from.lat},${from.lng}>${destination.id}`,
      from,
      to,
      legs: selectedTrip.legs.map((leg, i) => {
        const stops = network.patterns[leg.patternIndex].stops.slice(leg.boardPos, leg.alightPos + 1);
        return {
          serviceNo: leg.serviceNo,
          board: pick(leg.board),
          alight: pick(leg.alight),
          path: road[i]?.path ?? stops.map((s): [number, number] => [network.stops[s].lat, network.stops[s].lng]),
          followsRoads: road[i]?.followsRoads ?? false,
        };
      }),
    };
  }, [selectedTrip, tripPlan, network, destination, tripRoadPaths, userLocation]);

  // Where to get off the bus being tracked, when a destination is set
  const alightHint = useMemo<AlightHint | null>(() => {
    if (!network || !destination) return null;
    const svc = currentRoute.serviceNo.toUpperCase();
    const boardIndex = routeDir.stops.findIndex((s) => s.code === selectedStop.code);
    const isLaterStop = (code: string) => routeDir.stops.some((s, i) => i > boardIndex && s.code === code);
    const pick = ({ code, name, road, lat, lng }: TripLeg['alight']) => ({ code, name, road, lat, lng });

    // A suggested trip on this bus from this stop knows where to get off, including where to change buses
    // (the chosen trip first, then direct trips before ones with a change)
    const suggested = tripPlan?.options ?? [];
    const options = [
      ...(selectedTrip ? [selectedTrip] : []),
      ...suggested.filter((o) => o.legs.length === 1),
      ...suggested.filter((o) => o.legs.length > 1),
    ];
    for (const option of options) {
      const i = option.legs.findIndex(
        (leg) =>
          leg.board.code === selectedStop.code &&
          [leg.serviceNo, ...leg.alsoServiceNos].some((s) => s.toUpperCase() === svc) &&
          isLaterStop(leg.alight.code)
      );
      if (i < 0) continue;
      const leg = option.legs[i];
      const next = option.legs[i + 1];
      return {
        status: 'alight',
        stop: pick(leg.alight),
        stopCount: leg.stopCount,
        rideMin: leg.rideMin,
        walkM: next ? option.transferWalkM : option.walkEndM,
        walkMin: next ? option.transferWalkMin : option.walkEndMin,
        destinationName: destination.name,
        ...(next ? { change: { serviceNo: next.serviceNo, stopCode: next.board.code, stopName: next.board.name } } : {}),
      };
    }

    // Otherwise the stop on this bus that gets closest to the destination
    const advice = alightFor(network, currentRoute.serviceNo, direction, selectedStop.code, destination);
    if (advice?.status === 'alight' && isLaterStop(advice.leg.alight.code)) {
      return {
        status: 'alight',
        stop: pick(advice.leg.alight),
        stopCount: advice.leg.stopCount,
        rideMin: advice.leg.rideMin,
        walkM: advice.walkEndM,
        walkMin: advice.walkEndMin,
        destinationName: destination.name,
      };
    }
    if (advice?.status === 'not-near') {
      return { status: 'not-near', stop: pick(advice.closest), distanceM: advice.distanceM, destinationName: destination.name };
    }
    return null;
  }, [network, destination, currentRoute.serviceNo, direction, routeDir, selectedStop.code, selectedTrip, tripPlan]);

  const showTripOnMap = useCallback(() => {
    setActiveTab('map');
    // After the map tab renders
    setTimeout(() => document.getElementById('trip-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  // Real-time Bus Arrival Timings for active selected stop
  const { services: stopServices, dataSource, lastUpdated, isRefreshing, secondsUntilRefresh, refresh: handleRefresh } =
    useStopArrivals(selectedStop.code);

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
    trackService(num);
  };

  const handleSelectStopService = (nearby: NearbyStop, svc: StopService) => {
    trackService(svc.serviceNo, { direction: svc.direction, stopCode: nearby.stop.code });
  };

  const tripCard = destination && (
    <TripPlannerCard
      destination={destination}
      fromName={userLocation.name}
      state={tripState}
      selectedId={selectedTrip?.id ?? null}
      canShowMap={!!journey}
      onSelect={selectTrip}
      onTrackLeg={trackTripLeg}
      trackedServiceNo={currentRoute.serviceNo}
      trackedStopCode={selectedStop.code}
      onShowMap={showTripOnMap}
      onClear={handleClearDestination}
    />
  );

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
        setActiveTab={setActiveTab}
        onRefreshAll={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Where the user is starting from */}
        <LocationBar
          location={userLocation}
          onOpenPicker={() => setIsLocationModalOpen(true)}
          onLocationChange={applyUserLocation}
        />

        {/* Bus Search Box & Direction Selector */}
        <BusSearchBox
          busNumber={busNumber}
          onSearch={handleSearchBus}
          currentRoute={currentRoute}
          direction={direction}
          setDirection={handleSetDirection}
          nearbyStops={nearbyStops}
          locationName={userLocation.name.split('(')[0].trim()}
          trackedStopCode={selectedStop.code}
          onSelectStopService={handleSelectStopService}
          network={network}
          destination={destination}
          onSetDestination={handleSetDestination}
          onClearDestination={handleClearDestination}
          recentPlaces={recentPlaces}
        />

        {/* Trip options sit above the stop details, except on the map tab where the map comes first */}
        {(activeTab === 'arrivals' || activeTab === 'stops') && tripCard}

        {(isRouteLoading || routeNotice) && (
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

        {/* Nearest Bus Stop Highlight Banner */}
        {(activeTab === 'arrivals' || activeTab === 'stops') && (
          <NearestStopBanner
            nearestStop={nearestStop}
            selectedStop={selectedStop}
            onSelectStop={handleSelectStop}
            distanceMeters={distanceMeters}
            userLocation={userLocation}
            isFavorite={isCurrentFavorite}
            onToggleFavorite={handleToggleFavorite}
            onViewOnMap={() => setActiveTab('map')}
            onOpenStopsList={() => setActiveTab('stops')}
          />
        )}

        {/* Dynamic Tab Views */}
        {activeTab === 'arrivals' && (
          <div className="space-y-6">
            {/* Live Arrivals Board */}
            <ArrivalDisplay
              arrivals={arrivals}
              activeStop={selectedStop}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              dataSource={dataSource}
              secondsUntilRefresh={secondsUntilRefresh}
              alight={alightHint}
            />

            <StopServicesBoard
              stop={selectedStop}
              services={stopServices}
              dataSource={dataSource}
              currentServiceNo={currentRoute.serviceNo}
              onSelectService={(serviceNo) => trackService(serviceNo, { stopCode: selectedStop.code })}
            />

            {/* Split row: Map Preview & NEA Weather */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
                />
              </div>
              <div className="lg:col-span-5 space-y-6">
                <NEAWeatherWidget
                  weather={weather}
                  isLoading={isWeatherLoading}
                  error={weatherError}
                  onRefreshWeather={loadWeather}
                  onShowAll={() => {
                    setActiveTab('weather');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />

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
          <div id="trip-map" className="space-y-4 scroll-mt-32">
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
            />
            {tripCard}
            {/* Quick arrival summary card below the map */}
            <ArrivalDisplay
              arrivals={arrivals}
              activeStop={selectedStop}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              dataSource={dataSource}
              secondsUntilRefresh={secondsUntilRefresh}
              alight={alightHint}
            />
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
              />
            </div>
            <div className="lg:col-span-5 space-y-4">
              <ArrivalDisplay
                arrivals={arrivals}
                activeStop={selectedStop}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                dataSource={dataSource}
                secondsUntilRefresh={secondsUntilRefresh}
                alight={alightHint}
              />
              <StopServicesBoard
                stop={selectedStop}
                services={stopServices}
                dataSource={dataSource}
                currentServiceNo={currentRoute.serviceNo}
                onSelectService={(serviceNo) => trackService(serviceNo, { stopCode: selectedStop.code })}
              />
            </div>
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

      {/* Corporate Footer */}
      <footer className="mt-12 bg-white border-t border-warm-200 py-6 text-xs text-warm-500">
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
