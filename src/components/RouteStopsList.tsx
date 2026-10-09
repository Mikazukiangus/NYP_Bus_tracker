import React, { useState } from 'react';
import { BusStop, BusRoute } from '../types/bus';
import { Search, MapPin, ShieldCheck, ChevronRight, Check } from 'lucide-react';

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

  const filteredStops = stopsWithDistance.filter(
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Route Stops: Bus {route.serviceNo}
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            From {routeDir.origin} to {routeDir.destination} ({routeDir.stops.length} stops)
          </p>
        </div>

        {/* Filter input */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search stop name or code..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#602a85]"
          />
        </div>
      </div>

      {/* Sequential Stop List */}
      <div className="mt-3 divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
        {filteredStops.map((stop, index) => {
          const isNearest = stop.code === nearestStop.code;
          const isSelected = stop.code === selectedStop.code;

          return (
            <div
              key={stop.code}
              onClick={() => onSelectStop(stop)}
              className={`p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 ${
                isSelected
                  ? 'bg-purple-50/80 border border-purple-200 font-semibold'
                  : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Step indicator */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isNearest
                      ? 'bg-[#602a85] text-white shadow-xs'
                      : isSelected
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isNearest ? '★' : index + 1}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {stop.name}
                    </span>
                    <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                      {stop.code}
                    </span>
                    {isNearest && (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        Nearest Stop ({formatDistance(stop.distanceMeters)})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <span>{stop.road}</span>
                    {stop.sheltered && (
                      <span className="text-emerald-600 flex items-center gap-0.5 text-[11px]">
                        <ShieldCheck className="w-3 h-3" /> Sheltered
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-slate-400">
                  {formatDistance(stop.distanceMeters)}
                </span>
                {isSelected ? (
                  <Check className="w-4 h-4 text-[#602a85]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                )}
              </div>
            </div>
          );
        })}

        {filteredStops.length === 0 && (
          <div className="py-8 text-center text-slate-400 text-xs">
            No stops found matching "{filterQuery}"
          </div>
        )}
      </div>
    </div>
  );
};
