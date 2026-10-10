import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BusRoute,
  BusStop,
  BusServiceArrivals,
  FavoriteItem,
  LiveBus,
  NEAWeather,
  UserLocation
} from './types/bus';
import {
  SINGAPORE_LOCATIONS,
  getOrCreateBusRoute
} from './data/singaporeBuses';
import {
  findNearestBusStop,
  generateArrivalTimings,
  fetchLTABusArrivals,
  fetchBusRoute,
  pickNearestDirection,
  initLiveBuses,
  stepLiveBuses
} from './services/busTrackerService';
import { fetchNEAWeatherData } from './services/neaWeather';
import { Header } from './components/Header';
import { BusSearchBox } from './components/BusSearchBox';
import { NearestStopBanner } from './components/NearestStopBanner';
import { ArrivalDisplay } from './components/ArrivalDisplay';
import { LiveBusMap } from './components/LiveBusMap';
import { RouteStopsList } from './components/RouteStopsList';
import { NEAWeatherWidget } from './components/NEAWeatherWidget';
import { FavoritesModal } from './components/FavoritesModal';
import { LocationPickerModal } from './components/LocationPickerModal';
import { Heart, Compass, Bus, AlertCircle, ArrowUpRight } from 'lucide-react';

const FAVORITES_STORAGE_KEY = 'sbs_transit_favorites_v1';

export default function App() {
  // User Location (Default: Nanyang Polytechnic)
  const [userLocation, setUserLocation] = useState<UserLocation>(SINGAPORE_LOCATIONS[0]);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

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
      setDirection(opts.direction ?? pickNearestDirection(route, loc.lat, loc.lng));
      setSelectedStopCode(opts.stopCode ?? null);
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
    setUserLocation(loc);
    setSelectedStopCode(null);
    setDirection(pickNearestDirection(currentRouteRef.current, loc.lat, loc.lng));
  }, []);

  // Live Moving Buses on the map
  const [liveBuses, setLiveBuses] = useState<LiveBus[]>(() =>
    initLiveBuses(currentRoute, direction)
  );

  // Reset live buses when route or direction changes
  useEffect(() => {
    setLiveBuses(initLiveBuses(currentRoute, direction));
  }, [currentRoute, direction]);

  // Live micro-movement loop for buses on map
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveBuses((prevBuses) => stepLiveBuses(prevBuses, currentRoute, direction));
    }, 2800);

    return () => clearInterval(interval);
  }, [currentRoute, direction]);

  // Real-time Bus Arrival Timings for active selected stop
  const [refreshCount, setRefreshCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataSource, setDataSource] = useState<'LTA_DATAMALL_V3' | 'FALLBACK_SIMULATED'>('LTA_DATAMALL_V3');

  const [arrivals, setArrivals] = useState<BusServiceArrivals>(() => {
    const { nextBus, nextBus2, nextBus3 } = generateArrivalTimings(
      currentRoute.serviceNo,
      selectedStop.code
    );
    return {
      serviceNo: currentRoute.serviceNo,
      operator: currentRoute.operator,
      stopCode: selectedStop.code,
      stopName: selectedStop.name,
      roadName: selectedStop.road,
      destination: currentRoute.direction1.destination,
      direction,
      nextBus,
      nextBus2,
      nextBus3,
      lastUpdated: new Date(),
    };
  });

  useEffect(() => {
    let isCancelled = false;

    const loadArrivals = async () => {
      setIsRefreshing(true);
      try {
        const result = await fetchLTABusArrivals(
          currentRoute.serviceNo,
          selectedStop.code,
          refreshCount * 30
        );
        if (!isCancelled) {
          setDataSource(result.source);
          setArrivals({
            serviceNo: currentRoute.serviceNo,
            operator: currentRoute.operator,
            stopCode: selectedStop.code,
            stopName: selectedStop.name,
            roadName: selectedStop.road,
            destination: routeDir.destination,
            direction,
            nextBus: result.nextBus,
            nextBus2: result.nextBus2,
            nextBus3: result.nextBus3,
            lastUpdated: new Date(),
          });
        }
      } catch (err) {
        console.error('Failed to load arrivals:', err);
      } finally {
        if (!isCancelled) {
          setIsRefreshing(false);
        }
      }
    };

    loadArrivals();
    return () => {
      isCancelled = true;
    };
  }, [currentRoute, selectedStop, direction, refreshCount, routeDir]);

  const handleRefresh = useCallback(() => {
    setRefreshCount((c) => c + 1);
  }, []);

  // NEA Weather state
  const [weather, setWeather] = useState<NEAWeather | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);

  const loadWeather = useCallback(async (lat: number, lng: number) => {
    setIsWeatherLoading(true);
    try {
      const data = await fetchNEAWeatherData(lat, lng);
      setWeather(data);
    } catch {
      // Fallback handled in service
    } finally {
      setIsWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWeather(userLocation.lat, userLocation.lng);
  }, [userLocation, loadWeather]);

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
    loadRoute(fav.serviceNo, { direction: fav.direction, stopCode: fav.stopCode });
  };

  // UI Active Tab: 'arrivals' | 'map' | 'stops' | 'weather'
  const [activeTab, setActiveTab] = useState<'arrivals' | 'map' | 'stops' | 'weather'>('arrivals');

  // Handle bus number search submission
  const handleSearchBus = (num: string) => {
    loadRoute(num);
  };

  // Attempt silent GPS on mount if available
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // If within Singapore bounding box (approx 1.15 to 1.48 lat, 103.6 to 104.05 lng)
          const { latitude, longitude } = pos.coords;
          if (latitude >= 1.15 && latitude <= 1.48 && longitude >= 103.55 && longitude <= 104.1) {
            applyUserLocation({
              name: 'My GPS Location',
              lat: latitude,
              lng: longitude,
              isSimulated: false,
            });
          }
        },
        () => {
          // Fallback to Orchard default
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, [applyUserLocation]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans">
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
        {/* Quick Location & Commuter Bar */}
        <div className="bg-purple-900/5 border border-purple-100 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#602a85] shrink-0" />
            <span className="text-slate-600">Your Current Commute Location:</span>
            <strong className="text-slate-900">{userLocation.name}</strong>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsLocationModalOpen(true)}
              className="text-[#602a85] hover:text-[#502170] font-bold underline"
            >
              Change Location / Use GPS
            </button>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">
              Singapore Bus Interchanges & Stops Live Feed
            </span>
          </div>
        </div>

        {/* Bus Search Box & Direction Selector */}
        <BusSearchBox
          busNumber={busNumber}
          setBusNumber={setBusNumber}
          onSearch={handleSearchBus}
          currentRoute={currentRoute}
          direction={direction}
          setDirection={handleSetDirection}
        />

        {(isRouteLoading || routeNotice) && (
          <div
            className={`rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs border ${
              routeNotice && !isRouteLoading
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{isRouteLoading ? 'Loading route stops from LTA DataMall...' : routeNotice}</span>
          </div>
        )}

        {/* Nearest Bus Stop Highlight Banner */}
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
                  liveBuses={liveBuses}
                />
              </div>
              <div className="lg:col-span-5 space-y-6">
                <NEAWeatherWidget
                  weather={weather}
                  isLoading={isWeatherLoading}
                  onRefreshWeather={() => loadWeather(userLocation.lat, userLocation.lng)}
                />

                {/* Quick Favorites Mini Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />
                      Saved Favourites ({favorites.length})
                    </span>
                    <button
                      onClick={() => setIsFavoritesModalOpen(true)}
                      className="text-xs text-[#602a85] font-semibold hover:underline"
                    >
                      View All
                    </button>
                  </div>
                  <div className="mt-2 divide-y divide-slate-100">
                    {favorites.slice(0, 3).map((f) => (
                      <div
                        key={f.id}
                        onClick={() => handleSelectFavorite(f)}
                        className="py-2 flex items-center justify-between text-xs hover:bg-slate-50 cursor-pointer rounded-lg px-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-[#602a85] text-white font-extrabold text-[11px] px-1.5 py-0.5 rounded">
                            {f.serviceNo}
                          </span>
                          <span className="text-slate-800 font-semibold truncate max-w-[140px]">
                            {f.stopName}
                          </span>
                        </div>
                        <span className="text-slate-400 font-mono text-[11px]">{f.stopCode}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'map' && (
          <div className="space-y-4">
            <LiveBusMap
              route={currentRoute}
              direction={direction}
              nearestStop={nearestStop}
              selectedStop={selectedStop}
              onSelectStop={handleSelectStop}
              userLocation={userLocation}
              liveBuses={liveBuses}
            />
            {/* Quick arrival summary card below the map */}
            <ArrivalDisplay
              arrivals={arrivals}
              activeStop={selectedStop}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              dataSource={dataSource}
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
              />
            </div>
            <div className="lg:col-span-5 space-y-4">
              <ArrivalDisplay
                arrivals={arrivals}
                activeStop={selectedStop}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                dataSource={dataSource}
              />
            </div>
          </div>
        )}

        {activeTab === 'weather' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NEAWeatherWidget
              weather={weather}
              isLoading={isWeatherLoading}
              onRefreshWeather={() => loadWeather(userLocation.lat, userLocation.lng)}
            />
            {/* Weather & Transit Advisory Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">
                Commuter Transit & Rain Guide (Singapore NEA)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Singapore's tropical weather can bring localized sudden rainstorms. SBS Transit stations and key bus stops are equipped with covered linkways and electronic arrival display panels (EADPs).
              </p>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-100 flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#602a85] mt-1 shrink-0" />
                  <span className="text-slate-700">
                    <strong>Nearest Stop Linkway:</strong> {selectedStop.sheltered ? 'This stop has sheltered connection to nearby buildings.' : 'Open stop. Carry an umbrella during wet weather.'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-600 mt-1 shrink-0" />
                  <span className="text-slate-700">
                    <strong>Wet Weather Driving Protocol:</strong> Bus speeds are automatically calibrated for road safety during rain (average 25-35 km/h).
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Corporate Footer */}
      <footer className="mt-12 bg-white border-t border-slate-200 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#602a85] flex items-center justify-center text-white font-bold text-[10px]">
              NYP
            </div>
            <span className="font-semibold text-slate-700">BusTrackerSG • A member of NYP Bus</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-slate-400">
            <span>Data: LTA DataMall & National Environment Agency (NEA)</span>
            <span>•</span>
            <span>Singapore Public Transport Standards (WSH & ISO certified)</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <FavoritesModal
        isOpen={isFavoritesModalOpen}
        onClose={() => setIsFavoritesModalOpen(false)}
        favorites={favorites}
        onRemoveFavorite={handleRemoveFavorite}
        onSelectFavorite={handleSelectFavorite}
      />

      <LocationPickerModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        currentLocation={userLocation}
        onSelectLocation={applyUserLocation}
      />
    </div>
  );
}
