import React, { useEffect, useState } from 'react';
import { Loader2, Locate, MapPin } from 'lucide-react';
import type { UserLocation } from '../types/bus';
import { requestGpsLocation } from '../services/userLocation';
import { PlaceKindIcon } from './PlaceSearch';

interface LocationBarProps {
  location: UserLocation;
  onOpenPicker: () => void;
  onLocationChange: (location: UserLocation) => void;
}

// Where the user is starting from: GPS, a searched place / postal code / stop, or a suggested place
export const LocationBar: React.FC<LocationBarProps> = ({ location, onOpenPicker, onLocationChange }) => {
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGps = !location.isSimulated;

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const useGps = async () => {
    setIsLocating(true);
    setError(null);
    const result = await requestGpsLocation();
    setIsLocating(false);
    if ('error' in result) setError(result.error);
    else onLocationChange(result.location);
  };

  const detail = isGps
    ? location.accuracyMeters !== undefined
      ? `GPS · ±${location.accuracyMeters} m`
      : 'GPS'
    : location.address;

  return (
    <div>
      <div className="bg-green-blue-soft border border-green-blue/25 rounded-xl px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs">
        <button
          onClick={onOpenPicker}
          className="flex items-center gap-2 min-w-0 text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-white/50"
          aria-label={`Your location: ${location.name}. Change location`}
        >
          {isGps ? (
            <Locate className="w-4 h-4 text-green-blue-ink shrink-0" />
          ) : location.kind ? (
            <PlaceKindIcon kind={location.kind} className="w-4 h-4 text-helvetia shrink-0" />
          ) : (
            <MapPin className="w-4 h-4 text-helvetia shrink-0" />
          )}
          <span className="text-warm-600 shrink-0">From</span>
          <span className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
            <strong className="text-warm-900 truncate">{location.name}</strong>
            {detail && <span className="text-[11px] text-warm-500 truncate">{detail}</span>}
          </span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={useGps}
            disabled={isLocating}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg font-bold text-green-blue-ink hover:bg-white/60 disabled:opacity-70"
            title="Use my current GPS position"
            aria-label="Use my current GPS position"
          >
            {isLocating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Locate className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isLocating ? 'Locating…' : 'GPS'}</span>
          </button>
          <button
            onClick={onOpenPicker}
            className="px-2 py-1.5 rounded-lg text-helvetia hover:text-helvetia-700 hover:bg-white/60 font-bold underline"
          >
            Change
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
          {error}
        </p>
      )}
    </div>
  );
};
