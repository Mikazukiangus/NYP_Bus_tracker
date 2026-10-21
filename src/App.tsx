import { sameStopCall } from '../shared/transit/stopCalls';
import { ARRIVALS_CARD_ID, useAppNavigation } from './app/useAppNavigation';
import { useJourneyPlan } from './features/journey/useJourneyPlan';
import { useJourneyGeometry } from './features/journey/useJourneyGeometry';
import { buildJourney, buildTripView, buildAlightHint, buildAlarmRide, buildAfterGetOff } from './features/journey/presentation';
import { buildCommuteAdvice, WALKABLE_STOP_M } from './features/weather/commuteAdvice';
import { useWeatherSnapshot } from './features/weather/useWeatherSnapshot';
import { useRouteIncidents } from './features/incidents/useRouteIncidents';
import { useSavedBuses } from './features/saved/application/useSavedBuses';
import { useBusNetwork } from './features/network/application/useBusNetwork';
import { useTrackedRoute } from './features/tracking/useTrackedRoute';
import { useUserLocation } from './features/location/useUserLocation';

import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo } from 'react';
import { BusServiceArrivals, FavoriteItem, IncomingBus, UserLocation } from './types/bus';

import { generateArrivalTimings } from './features/arrivals/simulatedArrivals';

import type { NearbyStop, StopService } from './features/network/model';

import { useRecentPlaces } from './features/places/application/useRecentPlaces';

import { summarizeWeather } from './features/weather/summary';
import { formatSgTime } from './features/weather/presentation';

import { leaveWithin } from './services/leaveWithin';
import { Header } from './components/Header';
import { BusSearchBox } from './components/BusSearchBox';
import { NearestStopBanner } from './components/NearestStopBanner';
import { ArrivalDisplay } from './components/ArrivalDisplay';
import { StopServicesBoard } from './components/StopServicesBoard';
import { RouteStopsList } from './components/RouteStopsList';
import { NEAWeatherWidget, WeatherStrip } from './components/NEAWeatherWidget';
import { LiveArrivalsBar } from './components/LiveArrivalsBar';
import { BottomTabBar } from './components/AppTabs';
import { FavoritesModal, NextBusLabel } from './components/FavoritesModal';
import { LocationPickerModal } from './components/LocationPickerModal';
import { LocationBar } from './components/LocationBar';
import { RainAdviceStrip } from './components/RainAdviceStrip';
import { TripPlannerCard } from './components/TripPlannerCard';
import { useFavoriteArrivals } from './services/favoriteArrivals';
import { useStopArrivals } from './services/useStopArrivals';
import { useIsPhone } from './services/useIsPhone';
import { useTextEntry } from './services/useTextEntry';

import { useGetOffAlarm } from './services/useGetOffAlarm';
import { GetOffBanner, alarmStatus } from './components/GetOffAlarm';
import { Heart, CircleAlert } from 'lucide-react';

// The map and Leaflet are a quarter of the app's code, so they load on their own: the times show without waiting
// for them, and the map is fetched while the page is idle (below) so the phone Map tab opens at once
const loadLiveBusMap = () => import('./components/LiveBusMap');
const LiveBusMap = lazy(() => loadLiveBusMap().then((m) => ({ default: m.LiveBusMap })));

// Holds the map's place, at its size, while its code loads
const MapPlaceholder: React.FC = () => (
  <div className="bg-white rounded-2xl border border-warm-200 overflow-hidden shadow-sm" aria-busy="true">
    <div className="px-3 sm:px-4 py-3 bg-warm-50 border-b border-warm-200 text-sm font-bold text-warm-500">Loading map…</div>
    <div className="w-full h-[calc(100dvh-18rem)] min-h-[320px] max-h-[520px] max-sm:max-h-none sm:h-[460px] lg:h-[520px] bg-warm-100 animate-pulse" />
  </div>
);

export default function App() {
  const { userLocation, isDefaultLocation, selectLocation, requestStartupGps } = useUserLocation();
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  // Fetch the map's code once the first screen is drawn, so it's ready before anyone opens the Map tab
  useEffect(() => {
    const whenIdle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 1500));
    whenIdle(() => void loadLiveBusMap());
  }, []);

  const { network, networkStatus, nearbyStops, stopNames } = useBusNetwork(userLocation);
  const { searchedBus, direction, currentRoute, isRouteLoading, routeNotice, routeDir,
    nearestStop, distanceMeters, stopsWithDistance, selectedStop, loadRoute,
    handleSelectStop, handleSetDirection, retarget } = useTrackedRoute(userLocation, nearbyStops);

  const { activeTab, selectTab, revealArrivals, showTripOnMap, showArrivalsCard } = useAppNavigation();
  // Phones get a shorter page: the tabs in a bar at the bottom, each tab showing only what it's for, folded
  // sections, and a bar with the next bus
  const isPhone = useIsPhone();
  const isTyping = useTextEntry();

  // Real-time Bus Arrival Timings for active selected stop
  const { services: stopServices, dataSource, lastUpdated, isRefreshing, secondsUntilRefresh, refresh: handleRefresh } =
    useStopArrivals(selectedStop.code);

  // Coordinate the two feature owners in one event; neither hook imports the other.
  const applyUserLocation = useCallback((loc: UserLocation) => {
    selectLocation(loc);
    retarget(loc);
  }, [selectLocation, retarget]);

  // Places chosen recently as a start or destination
  const { recentPlaces, rememberPlace } = useRecentPlaces();

  const { destination, tripPlan, selectedTrip, trackedLeg, selectTrip, trackTripLeg,
    trackTripLegAt, chooseTripService, chooseTripServiceAt, trackService, handleSetDestination,
    handleClearDestination, handleSwapTrip, tripState, notDueAt } = useJourneyPlan({
      network, networkStatus, userLocation, currentRoute, routeDir, selectedStop,
      dataSource, stopServices, loadRoute, rememberPlace, applyUserLocation,
    });

  const { tripRoadPaths, tripPathKey } = useJourneyGeometry(selectedTrip);

  const journey = useMemo(
    () => buildJourney({ network, destination, userLocation, selectedTrip, trackedLeg, tripPlan, tripRoadPaths, tripPathKey }),
    [selectedTrip, trackedLeg, tripPlan, network, destination, tripRoadPaths, tripPathKey, userLocation]
  );

  // The shown trip with the stops of each bus, for showing the other bus of a trip with a change alongside
  // the tracked one (null unless the tracked bus is part of it)
  const tripView = useMemo(
    () => buildTripView({ network, destination, selectedTrip, trackedLeg, notDueAt }),
    [network, destination, selectedTrip, trackedLeg, notDueAt]
  );

  // Where to get off the bus being tracked, when a destination is set
  const alightHint = useMemo(
    () => buildAlightHint({ network, destination, selectedTrip, tripView, routeDir, selectedStop, currentRoute, direction }),
    [network, destination, currentRoute.serviceNo, direction, routeDir, selectedStop.code, selectedTrip, tripView]
  );

  // The ride the "Get off now" alarm follows: the tracked bus, from its stop to the one to get off at
  const alarmRide = useMemo(
    () => buildAlarmRide({ alightHint, routeDir, selectedStop, currentRoute }),
    [alightHint, routeDir, selectedStop.code, currentRoute.serviceNo]
  );
  const getOffAlarm = useGetOffAlarm(alarmRide);

  // What comes after getting off, for the alarm's bubble
  const afterGetOff = useMemo(
    () => buildAfterGetOff({ alightHint }),
    [alightHint]
  );

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

  const incidentsOnRoute = useRouteIncidents(routeDir.path);

  const { weatherSnapshot, isWeatherLoading, weatherError, loadWeather } = useWeatherSnapshot();

  const weather = useMemo(
    () => (weatherSnapshot ? summarizeWeather(weatherSnapshot, userLocation.lat, userLocation.lng) : null),
    [weatherSnapshot, userLocation]
  );

  const { favorites, isCurrentFavorite, handleToggleFavorite, handleRemoveFavorite } =
    useSavedBuses(currentRoute.serviceNo, selectedStop, direction, routeDir.destination, undefined, undefined, network);
  const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);
  const favoriteArrivals = useFavoriteArrivals(favorites, isFavoritesModalOpen || activeTab === 'arrivals');

  const handleSelectFavorite = (fav: FavoriteItem) => {
    trackService(fav.serviceNo, { direction: fav.direction, stopCode: fav.stopCode, stopCall: { patternId: `${fav.serviceNo.toUpperCase()}:${fav.direction}`, stopCode: fav.stopCode, occurrence: fav.occurrence ?? 1, sequence: 1 } });
    revealArrivals();
  };

  // Handle bus number search submission (a number that isn't a bus stays put, so its notice is seen)
  const handleSearchBus = (num: string) => {
    trackService(num, { remember: true }).then((found) => found && revealArrivals());
  };

  const handleSelectStopService = (nearby: NearbyStop, svc: StopService) => {
    trackService(svc.serviceNo, { direction: svc.direction, stopCode: nearby.stop.code });
    revealArrivals();
  };

  const handleSelectBoardService = (serviceNo: string) => {
    trackService(serviceNo, { stopCode: selectedStop.code });
    revealArrivals();
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
  const rainAdviceNow = useMemo(
    () => buildCommuteAdvice({ weatherSnapshot, weather, walkToStopM, nearbyStops, arrivals, destination, alightHint, selectedTrip, tripView, userLocation }),
    [weatherSnapshot, weather, walkToStopM, nearbyStops, arrivals, destination, alightHint, selectedTrip, tripView, userLocation]
  );

  // The advice is for where the trip starts (the From row: GPS or a chosen place), so it says so
  // The place's short name, or for a GPS position words that read well in a sentence ("For where you are")
  const fromPlace = (userLocation.source !== 'gps') ? userLocation.name.split('(')[0].trim() : null;
  const rainSource = weatherSnapshot?.rainfall?.history
    ? `For ${fromPlace ?? 'where you are'} · NEA rain gauges ${formatSgTime(weatherSnapshot.rainfall.timestamp)} & 2-hr forecast`
    : weather?.forecast2h
      ? `For ${fromPlace ?? 'where you are'} · NEA 2-hr forecast ${formatSgTime(weather.forecast2h.updated)}`
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
                isNearest: sameStopCall(selectedStop, nearestStop),
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

  useEffect(() => requestStartupGps(applyUserLocation), [requestStartupGps, applyUserLocation]);

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
            isDefault={isDefaultLocation}
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
            locationName={fromPlace ?? 'you'}
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
            <CircleAlert className="w-4 h-4 shrink-0" />
            <span>{isRouteLoading ? 'Loading the bus\'s stops…' : routeNotice}</span>
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
              stopNames={stopNames}
              dataSource={dataSource}
              currentServiceNo={currentRoute.serviceNo}
              onSelectService={handleSelectBoardService}
            />

            {/* Split row: Map Preview & NEA Weather (phones: the Map tab has the map, and the weather is one row) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
              {!isPhone && (
                <div className="lg:col-span-7">
                  <Suspense fallback={<MapPlaceholder />}>
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
                  </Suspense>
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
                      Saved buses ({favorites.length})
                    </span>
                    <button
                      onClick={() => setIsFavoritesModalOpen(true)}
                      className="text-xs text-helvetia font-semibold hover:underline"
                    >
                      See all
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
            <Suspense fallback={<MapPlaceholder />}>
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
            </Suspense>
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
                  stopNames={stopNames}
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
