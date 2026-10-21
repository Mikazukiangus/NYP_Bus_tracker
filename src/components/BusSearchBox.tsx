import React, { useEffect, useState } from 'react';
import { Search, ArrowRightLeft, X, MapPinned, ChevronDown } from 'lucide-react';
import { BusRoute } from '../types/bus';
import type { NearbyStop, StopService } from '../features/network/model';
import { operatorName } from './ArrivalBits';

interface BusSearchBoxProps {
  busNumber: string; // the bus number last searched for ('' if none yet), not the tracked bus
  onSearch: (busNo: string) => void;
  currentRoute: BusRoute;
  direction: number;
  setDirection: (dir: number) => void;
  // Bus stops nearest the user's location with their services; null while loading, undefined if unavailable
  nearbyStops: NearbyStop[] | null | undefined;
  locationName: string;
  trackedStopCode: string;
  onSelectStopService: (stop: NearbyStop, service: StopService) => void;
  // Starts folded into one line (on phones once a destination is set, since the trip card picks the bus)
  foldable?: boolean;
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
  foldable = false,
}) => {
  const [inputVal, setInputVal] = useState(busNumber);
  const [showAllStops, setShowAllStops] = useState(false);
  const [unfolded, setUnfolded] = useState(false);

  useEffect(() => setUnfolded(false), [foldable]);

  // A new location starts with just the nearest few stops again
  useEffect(() => setShowAllStops(false), [nearbyStops?.[0]?.stop.code]);

  // Show the number as LTA writes it once it's found (72a as 72A)
  useEffect(() => {
    setInputVal(busNumber);
  }, [busNumber]);

  // Once a bus is picked, a foldable box folds away again so its arrivals are right below
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      onSearch(inputVal.trim());
      if (foldable) setUnfolded(false);
    }
  };

  const shownStops = nearbyStops ? (showAllStops ? nearbyStops : nearbyStops.slice(0, COLLAPSED_STOPS)) : [];

  const dir1 = currentRoute.direction1;
  const dir2 = currentRoute.direction2;

  const currentDirData = direction === 2 && dir2 ? dir2 : dir1;
  const shortName = (name: string) => name.replace(' Bus Interchange', '').replace(' Interchange', '');

  if (foldable && !unfolded) {
    return (
      <div className="bg-white rounded-2xl border border-warm-200/90 shadow-sm">
        <button
          type="button"
          onClick={() => setUnfolded(true)}
          aria-expanded={false}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
        >
          <Search className="w-4 h-4 text-warm-500 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-warm-700 uppercase tracking-wider">Find a bus</span>
            <span className="block text-xs text-warm-600 truncate">Another bus number, or a bus at a stop near you</span>
          </span>
          <span
            className="bg-helvetia text-white font-extrabold text-xs px-2 py-1 rounded-lg shrink-0"
            title={`Tracking Bus ${currentRoute.serviceNo} to ${currentDirData.destination}`}
          >
            Bus {currentRoute.serviceNo}
          </span>
          <ChevronDown className="w-4 h-4 text-helvetia shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-warm-200/90 shadow-sm p-3.5 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-xs font-semibold text-warm-700 uppercase tracking-wider">Find a bus</h2>
        {foldable && (
          <button
            type="button"
            onClick={() => setUnfolded(false)}
            aria-expanded={true}
            className="text-xs font-semibold text-helvetia flex items-center gap-1 -my-1 py-1"
          >
            Hide <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          </button>
        )}
      </div>
      {/* Bus number */}
      <form onSubmit={handleSubmit} className="relative md:max-w-md">
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
            placeholder="Type a bus number"
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

      {/* Bus stops nearest the user's location, with the services that stop there */}
      <section className="mt-3 sm:mt-4" aria-label={`Nearest bus stops to ${locationName}`}>
        <h3 className="text-[11px] font-semibold text-warm-600 flex items-center gap-1 mb-1.5 min-w-0">
          <MapPinned className="w-3.5 h-3.5 text-green-blue-ink shrink-0" />
          <span className="shrink-0">Nearest bus stops</span>{' '}
          <span className="font-normal text-warm-500 truncate">to {locationName}</span>
        </h3>
        {/* What the number buttons do, said where they are */}
        {nearbyStops && nearbyStops.length > 0 && (
          <p className="-mt-0.5 mb-1.5 text-[11px] text-warm-500">Tap a bus number to see when it comes.</p>
        )}

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
                            onClick={() => {
                              onSelectStopService(nearby, svc);
                              if (foldable) setUnfolded(false);
                            }}
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
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-helvetia text-white font-extrabold text-sm px-2.5 py-1 rounded-lg shadow-2xs shrink-0">
              Bus {currentRoute.serviceNo}
            </span>
            {/* On phones the direction buttons share this row (the operator is on the arrivals card) */}
            <div className={`text-xs ${dir2 ? 'hidden sm:block' : ''}`}>
              <span className="text-warm-500">Run by </span>
              <span className="font-semibold text-warm-800">{operatorName(currentRoute.operator)}</span>
              <span className="text-warm-300 mx-1.5">•</span>
              <span className="text-warm-500 font-medium">{currentRoute.category} Service</span>
            </div>
          </div>

          {dir2 && (
            <div className="flex items-center bg-warm-100 p-1 rounded-xl gap-1 text-xs font-semibold flex-1 min-w-0 sm:flex-none sm:max-w-[60%]">
              <button
                type="button"
                onClick={() => setDirection(1)}
                className={`flex-1 sm:flex-none min-w-0 justify-center px-3 py-2 sm:py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  direction === 1
                    ? 'bg-lemon text-helvetia-950 shadow-xs font-bold'
                    : 'text-warm-600 hover:text-warm-900'
                }`}
              >
                <span className="truncate">To {shortName(dir1.destination)}</span>
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
                <span className="truncate">To {shortName(dir2.destination)}</span>
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
