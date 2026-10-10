import React, { useEffect, useState } from 'react';
import { Search, ArrowRightLeft, X, MapPinned, Flag, ChevronDown } from 'lucide-react';
import { BusRoute } from '../types/bus';
import type { BusNetwork, NearbyStop, StopService } from '../services/busNetwork';
import type { PlaceResult } from '../services/placeSearch';
import { PlaceSearch } from './PlaceSearch';

interface BusSearchBoxProps {
  busNumber: string;
  onSearch: (busNo: string) => void;
  currentRoute: BusRoute;
  direction: number;
  setDirection: (dir: number) => void;
  // Bus stops nearest the user's location with their services; null while loading, undefined if unavailable
  nearbyStops: NearbyStop[] | null | undefined;
  locationName: string;
  trackedStopCode: string;
  onSelectStopService: (stop: NearbyStop, service: StopService) => void;
  network: BusNetwork | null;
  destination: PlaceResult | null;
  onSetDestination: (place: PlaceResult) => void;
  onClearDestination: () => void;
  recentPlaces: PlaceResult[];
}

// Nearest stops shown before "Show more"
const COLLAPSED_STOPS = 3;

const formatMetres = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

export const BusSearchBox: React.FC<BusSearchBoxProps> = ({
  busNumber,
  onSearch,
  currentRoute,
  direction,
  setDirection,
  nearbyStops,
  locationName,
  trackedStopCode,
  onSelectStopService,
  network,
  destination,
  onSetDestination,
  onClearDestination,
  recentPlaces,
}) => {
  const [inputVal, setInputVal] = useState(busNumber);
  const [showAllStops, setShowAllStops] = useState(false);

  // A new location starts with just the nearest few stops again
  useEffect(() => setShowAllStops(false), [nearbyStops?.[0]?.stop.code]);

  // Keep the input in sync when the service changes elsewhere (e.g. a favourite is opened)
  useEffect(() => {
    setInputVal(busNumber);
  }, [busNumber]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      onSearch(inputVal.trim());
    }
  };

  const shownStops = nearbyStops ? (showAllStops ? nearbyStops : nearbyStops.slice(0, COLLAPSED_STOPS)) : [];

  const dir1 = currentRoute.direction1;
  const dir2 = currentRoute.direction2;

  const currentDirData = direction === 2 && dir2 ? dir2 : dir1;

  return (
    <div className="bg-white rounded-2xl border border-warm-200/90 shadow-sm p-3.5 sm:p-5">
      <h2 className="text-xs font-semibold text-warm-700 uppercase tracking-wider mb-2">Find Bus Service</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
        {/* Bus number */}
        <form onSubmit={handleSubmit} className="relative">
          <label htmlFor="bus-search-input" className="block text-[11px] font-semibold text-warm-600 mb-1">
            Bus number
          </label>
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-warm-500 pointer-events-none flex items-center">
              <Search className="w-5 h-5" />
            </div>
            <input
              id="bus-search-input"
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="e.g. 72"
              enterKeyHint="search"
              className="w-full pl-11 pr-24 py-3 bg-warm-50 border border-warm-300 rounded-xl text-base sm:text-lg font-bold text-warm-900 placeholder:text-warm-500 placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-helvetia focus:border-transparent transition-all"
              autoComplete="off"
            />

            {inputVal && (
              <button
                type="button"
                aria-label="Clear bus number"
                onClick={() => {
                  setInputVal('');
                }}
                className="absolute right-20 text-warm-500 hover:text-warm-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              className="absolute right-1.5 px-4 py-2 bg-lemon hover:bg-lemon-hover text-helvetia-950 rounded-lg text-sm font-bold transition-all shadow-xs"
            >
              Track
            </button>
          </div>
        </form>

        {/* Destination */}
        <div>
          <span className="block text-[11px] font-semibold text-warm-600 mb-1">Where to?</span>
          <PlaceSearch
            network={network}
            onSelect={onSetDestination}
            onClear={onClearDestination}
            value={destination?.name ?? ''}
            recent={recentPlaces}
            label="Destination"
            placeholder="Place, address or postal code"
            icon={<Flag className="w-5 h-5" />}
            inputClassName="py-3 text-base font-semibold"
          />
        </div>
      </div>

      {/* Bus stops nearest the user's location, with the services that stop there */}
      <section className="mt-3 sm:mt-4" aria-label={`Nearest bus stops to ${locationName}`}>
        <h3 className="text-[11px] font-semibold text-warm-600 flex items-center gap-1 mb-1.5 min-w-0">
          <MapPinned className="w-3.5 h-3.5 text-green-blue-ink shrink-0" />
          <span className="shrink-0">Nearest bus stops</span>{' '}
          <span className="font-normal text-warm-500 truncate">to {locationName}</span>
        </h3>

        {nearbyStops === null ? (
          <div className="rounded-xl border border-warm-200 divide-y divide-warm-100 animate-pulse" aria-label="Loading nearby bus stops">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-3 py-2.5 flex items-center gap-3">
                <span className="h-4 w-40 rounded bg-warm-100" />
                <span className="h-6 w-24 rounded-lg bg-warm-100" />
              </div>
            ))}
          </div>
        ) : nearbyStops === undefined ? (
          <p className="text-xs text-warm-600">
            Nearby bus stops can't be loaded right now. You can still track a bus by its number.
          </p>
        ) : nearbyStops.length === 0 ? (
          <p className="text-xs text-warm-600">No bus stops found within 2 km of this location.</p>
        ) : (
          <>
            <ul className="rounded-xl border border-warm-200 divide-y divide-warm-100">
              {shownStops.map((nearby) => {
                const { stop, distanceM, services } = nearby;
                return (
                  <li key={stop.code} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    <div className="flex items-baseline gap-1.5 min-w-0 sm:w-60 sm:shrink-0">
                      <span className="text-sm font-semibold text-warm-900 truncate">{stop.name}</span>
                      <span className="font-mono text-[11px] text-warm-500 shrink-0">{stop.code}</span>
                      <span className="text-[11px] text-warm-500 shrink-0">· {formatMetres(distanceM)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {services.map((svc) => {
                        const isActive =
                          currentRoute.serviceNo.toUpperCase() === svc.serviceNo.toUpperCase() && trackedStopCode === stop.code;
                        return (
                          <button
                            key={svc.serviceNo}
                            type="button"
                            onClick={() => onSelectStopService(nearby, svc)}
                            title={`Bus ${svc.serviceNo} towards ${svc.towards}`}
                            aria-label={`Bus ${svc.serviceNo} from ${stop.name}, towards ${svc.towards}`}
                            aria-pressed={isActive}
                            className={`min-w-[2.75rem] px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-bold transition-all ${
                              isActive ? 'bg-helvetia text-white shadow-xs' : 'bg-warm-100 hover:bg-warm-200 text-warm-700'
                            }`}
                          >
                            {svc.serviceNo}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
            {nearbyStops.length > COLLAPSED_STOPS && (
              <button
                type="button"
                onClick={() => setShowAllStops((v) => !v)}
                className="mt-1.5 text-xs font-semibold text-helvetia hover:underline flex items-center gap-1"
              >
                {showAllStops ? 'Show fewer stops' : `Show ${nearbyStops.length - COLLAPSED_STOPS} more nearby stops`}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllStops ? 'rotate-180' : ''}`} />
              </button>
            )}
          </>
        )}
      </section>

      {/* Route Direction Switcher */}
      <div className="mt-2.5 pt-3 sm:mt-4 sm:pt-3.5 border-t border-warm-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-helvetia text-white font-extrabold text-sm px-2.5 py-1 rounded-lg shadow-2xs shrink-0">
              Bus {currentRoute.serviceNo}
            </span>
            <div className="text-xs">
              <span className="text-warm-500">Operator: </span>
              <span className="font-semibold text-warm-800">{currentRoute.operator}</span>
              <span className="text-warm-300 mx-1.5">•</span>
              <span className="text-warm-500 font-medium">{currentRoute.category} Service</span>
            </div>
          </div>

          {dir2 && (
            <div className="flex items-center bg-warm-100 p-1 rounded-xl gap-1 text-xs font-semibold w-full sm:w-auto sm:max-w-[60%]">
              <button
                type="button"
                onClick={() => setDirection(1)}
                className={`flex-1 sm:flex-none min-w-0 justify-center px-3 py-2 sm:py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  direction === 1
                    ? 'bg-lemon text-helvetia-950 shadow-xs font-bold'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                <span className="truncate">To {dir1.destination.replace(' Bus Interchange', '').replace(' Interchange', '')}</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection(2)}
                className={`flex-1 sm:flex-none min-w-0 justify-center px-3 py-2 sm:py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  direction === 2
                    ? 'bg-lemon text-helvetia-950 shadow-xs font-bold'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                <ArrowRightLeft className="w-3 h-3 opacity-60 shrink-0" />
                <span className="truncate">To {dir2.destination.replace(' Bus Interchange', '').replace(' Interchange', '')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Current Destination banner */}
        <div className="mt-2 text-xs text-warm-600 bg-helvetia-50/50 border border-helvetia-100 rounded-lg px-3 py-1.5 hidden sm:flex items-center justify-between">
          <div className="truncate">
            <span className="text-helvetia-900 font-medium hidden sm:inline">Origin: </span>
            <span className="text-warm-700">{currentDirData.origin}</span>
            <span className="mx-2 text-helvetia-400">➔</span>
            <span className="text-helvetia-900 font-medium hidden sm:inline">Destination: </span>
            <span className="text-warm-900 font-semibold">{currentDirData.destination}</span>
          </div>
          <span className="text-[11px] text-helvetia-700 font-medium shrink-0 ml-2">
            {currentDirData.stops.length} stops
          </span>
        </div>
      </div>
    </div>
  );
};
