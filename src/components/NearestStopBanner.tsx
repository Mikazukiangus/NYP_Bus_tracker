import React from 'react';
import { MapPin, Navigation, Heart, Map as MapIcon, ChevronRight } from 'lucide-react';
import { BusStop, UserLocation } from '../types/bus';

interface NearestStopBannerProps {
  nearestStop: BusStop;
  selectedStop: BusStop;
  onSelectStop: (stop: BusStop) => void;
  distanceMeters: number;
  userLocation: UserLocation;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onViewOnMap: () => void;
  onOpenStopsList: () => void;
}

export const NearestStopBanner: React.FC<NearestStopBannerProps> = ({
  nearestStop,
  selectedStop,
  onSelectStop,
  distanceMeters,
  userLocation,
  isFavorite,
  onToggleFavorite,
  onViewOnMap,
  onOpenStopsList
}) => {
  const isCurrentlySelected = selectedStop.code === nearestStop.code;

  // Rough walking time: straight-line distance at ~80 m/min. Real paths are usually longer
  // (crossings, overhead bridges), so it is labelled as an estimate.
  const walkingMin = Math.max(1, Math.round(distanceMeters / 80));

  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `${meters}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  return (
    <div className="nearest-stop-banner bg-helvetia rounded-2xl text-white p-4 sm:p-5 shadow-md relative overflow-hidden border-t-4 border-green-blue">
      <div aria-hidden="true" className="absolute right-0 bottom-0 w-20 h-2 bg-lemon pointer-events-none" />

      <div className="relative z-10">
        {/* Top badge row */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-lemon text-helvetia-950 text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs shrink-0">
              <span className="w-2 h-2 rounded-full bg-helvetia animate-ping inline-block" />
              Nearest Bus Stop
            </span>
            <span className="text-helvetia-200 text-xs font-medium truncate">
              to {userLocation.name.split('(')[0].trim()}
            </span>
          </div>

          <button
            onClick={onToggleFavorite}
            className={`p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold shrink-0 ${
              isFavorite
                ? 'bg-lemon text-helvetia-950 shadow-xs'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title={isFavorite ? 'Remove from favourites' : 'Save to favourites'}
            aria-label={isFavorite ? 'Remove from favourites' : 'Save to favourites'}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-helvetia-950' : ''}`} />
            <span className="hidden sm:inline">
              {isFavorite ? 'Favourited' : 'Add to Favs'}
            </span>
          </button>
        </div>

        {/* Stop details */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {nearestStop.name}
              </h2>
              <span className="bg-white/20 text-white font-mono font-bold text-xs px-2 py-0.5 rounded-md">
                {nearestStop.code}
              </span>
            </div>
            <p className="text-helvetia-200 text-sm mt-0.5 font-medium">Along {nearestStop.road}</p>
          </div>

          {/* Distance & Walk pill */}
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl px-3.5 py-2 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-lemon/15 text-lemon flex items-center justify-center shrink-0">
                <Navigation className="w-4 h-4" />
              </div>
              <div>
                <div className="text-lg font-black text-white leading-none">
                  {formatDistance(distanceMeters)}
                </div>
                <div className="text-[11px] text-white font-medium" title="Straight-line distance; the walking route may be longer">
                  ~{walkingMin} min walk · straight line
                </div>
              </div>
            </div>

            <button
              onClick={onViewOnMap}
              className="bg-lemon text-helvetia-950 hover:bg-lemon-hover font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs shrink-0"
            >
              <MapIcon className="w-3.5 h-3.5 text-helvetia" />
              <span>Map View</span>
            </button>
          </div>
        </div>

        {/* Selected stop indicator if user clicked another stop */}
        {!isCurrentlySelected && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs bg-black/15 px-3 py-2 rounded-xl">
            <span className="text-lemon">
              Viewing other stop: <strong>{selectedStop.name} ({selectedStop.code})</strong>
            </span>
            <button
              onClick={() => onSelectStop(nearestStop)}
              className="text-white underline font-semibold hover:text-lemon"
            >
              Switch back to nearest stop
            </button>
          </div>
        )}

        {/* Route stops browsing hint */}
        <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between text-xs text-helvetia-200">
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-helvetia-300 shrink-0" />
            <span className="sm:hidden">Other stops on this route</span>
            <span className="hidden sm:inline">Looking for another stop along this bus route?</span>
          </div>
          <button
            onClick={onOpenStopsList}
            className="text-white hover:text-lemon font-semibold flex items-center gap-0.5 shrink-0 py-1"
          >
            <span>Browse all stops</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
