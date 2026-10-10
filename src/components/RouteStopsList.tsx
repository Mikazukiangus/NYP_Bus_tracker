import React, { useState } from 'react';
import { BusStop, BusRoute } from '../types/bus';
import { Search, ChevronRight, Check } from 'lucide-react';

interface RouteStopsListProps {
  route: BusRoute;
  direction: number;
  nearestStop: BusStop;
  selectedStop: BusStop;
  onSelectStop: (stop: BusStop) => void;
  stopsWithDistance: (BusStop & { distanceMeters: number })[];
}

export const RouteStopsList: React.FC<RouteStopsListProps> = ({
  route,
  direction,
  nearestStop,
  selectedStop,
  onSelectStop,
  stopsWithDistance
}) => {
  const [filterQuery, setFilterQuery] = useState('');

  const routeDir = direction === 2 && route.direction2 ? route.direction2 : route.direction1;

  // Keep each stop's position on the route so numbering stays right while filtering
  const filteredStops = stopsWithDistance.map((s, i) => ({ ...s, sequence: i + 1 })).filter(
    (s) =>
      s.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      s.code.includes(filterQuery) ||
      s.road.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  return (
    <div className="bg-white rounded-2xl border border-warm-200 shadow-sm p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-warm-100">
        <div>
          <h3 className="text-base font-bold text-helvetia">
            Route Stops: Bus {route.serviceNo}
          </h3>
          <p className="text-xs text-warm-500 font-medium">
            From {routeDir.origin} to {routeDir.destination} ({routeDir.stops.length} stops)
          </p>
          <p className="text-[11px] text-warm-500">Distances are straight-line from your location</p>
        </div>

        {/* Filter input */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-warm-500 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search stop name or code..."
            className="w-full pl-9 pr-3 py-1.5 bg-warm-50 border border-warm-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-helvetia"
          />
        </div>
      </div>

      {/* Sequential Stop List */}
      <div className="mt-3 divide-y divide-warm-100 max-h-[500px] overflow-y-auto pr-1">
        {filteredStops.map((stop) => {
          const isNearest = stop.code === nearestStop.code;
          const isSelected = stop.code === selectedStop.code;

          return (
            <button
              type="button"
              key={stop.code}
              onClick={() => onSelectStop(stop)}
              aria-pressed={isSelected}
              className={`w-full text-left p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 ${
                isSelected
                  ? 'bg-helvetia-50/80 border border-helvetia-200 font-semibold'
                  : 'hover:bg-warm-50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Step indicator */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isNearest
                      ? 'bg-lemon text-helvetia-950 shadow-xs ring-1 ring-helvetia/30'
                      : isSelected
                      ? 'bg-helvetia-600 text-white'
                      : 'bg-warm-100 text-warm-600'
                  }`}
                >
                  {isNearest ? '★' : stop.sequence}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-warm-900 truncate">
                      {stop.name}
                    </span>
                    <span className="font-mono text-[11px] bg-warm-100 text-warm-700 px-1.5 py-0.2 rounded font-medium">
                      {stop.code}
                    </span>
                    {isNearest && (
                      <span className="bg-lemon-soft text-helvetia-950 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        Nearest Stop ({formatDistance(stop.distanceMeters)})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-warm-500 mt-0.5">{stop.road}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-warm-500">
                  {formatDistance(stop.distanceMeters)}
                </span>
                {isSelected ? (
                  <Check className="w-4 h-4 text-helvetia" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-warm-300" />
                )}
              </div>
            </button>
          );
        })}

        {filteredStops.length === 0 && (
          <div className="py-8 text-center text-warm-500 text-xs">
            No stops found matching "{filterQuery}"
          </div>
        )}
      </div>
    </div>
  );
};
