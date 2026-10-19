import React, { useEffect, useState } from 'react';
import { ArrowUpDown, Clock, Flag, LoaderCircle, Locate, MapPin } from 'lucide-react';
import type { UserLocation } from '../types/bus';
import type { BusNetwork } from '../services/busNetwork';
import type { PlaceResult } from '../services/placeSearch';
import { requestGpsLocation } from '../services/userLocation';
import { PlaceKindIcon, PlaceSearch } from './PlaceSearch';

interface LocationBarProps {
  location: UserLocation;
  isDefault?: boolean; // the app's starting place (NYP), not one the user gave: offer their own location
  onOpenPicker: () => void;
  onLocationChange: (location: UserLocation) => void;
  network: BusNetwork | null;
  destination: PlaceResult | null;
  onSetDestination: (place: PlaceResult) => void;
  onClearDestination: () => void;
  onSwap?: () => void; // the trip back: the destination becomes the start
  recentPlaces: PlaceResult[];
  children?: React.ReactNode; // under "Where to?" (the rain advice on the Arrivals tab)
}

// Recent places offered as one-tap destinations, like Citymapper's "Get me home" and "Work"
const SHORTCUTS = 4;

// Where the user is starting from (GPS, a searched place / postal code / stop, or a suggested place) and,
// right under it, where they're going: Citymapper's dark trip card, the two joined by a dotted line
export const LocationBar: React.FC<LocationBarProps> = ({
  location,
  isDefault = false,
  onOpenPicker,
  onLocationChange,
  network,
  destination,
  onSetDestination,
  onClearDestination,
  onSwap,
  recentPlaces,
  children,
}) => {
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

  const shortcuts = destination ? [] : recentPlaces.slice(0, SHORTCUTS);

  return (
    <section aria-label="Your trip" className="space-y-2">
      <div className="relative bg-helvetia-950 text-white rounded-2xl shadow-sm px-3 py-3 sm:px-4">
        {/* The dotted line from the start to the destination (longer past the "Not at…?" line) */}
        <span
          aria-hidden="true"
          className={`absolute left-[1.375rem] sm:left-[1.625rem] top-[1.95rem] border-l-2 border-dotted border-white/40 ${
            isDefault && !error ? 'h-[4.1rem]' : 'h-[2.6rem]'
          }`}
        />
        <div className="flex items-center gap-2.5">
          <span className="w-6 flex justify-center shrink-0" aria-hidden="true">
            <span className="w-3 h-3 rounded-full bg-green-blue ring-[3px] ring-green-blue/40" />
          </span>
          <button
            onClick={onOpenPicker}
            className="min-w-0 flex-1 text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-white/10"
            aria-label={`Your location: ${location.name}. Change location`}
          >
            <span className="block text-[10px] font-bold uppercase tracking-wider text-helvetia-300">From</span>
            <span className="flex items-center gap-1.5 min-w-0">
              {isGps ? (
                <Locate className="w-3.5 h-3.5 text-green-blue shrink-0" />
              ) : location.kind ? (
                <PlaceKindIcon kind={location.kind} className="w-3.5 h-3.5 text-helvetia-200 shrink-0" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-helvetia-200 shrink-0" />
              )}
              <strong className="text-sm truncate">{location.name}</strong>
              {detail && <span className="text-[11px] text-helvetia-200 truncate max-sm:hidden">{detail}</span>}
            </span>
          </button>
          <div className="flex items-center gap-1 shrink-0 text-xs">
            <button
              onClick={useGps}
              disabled={isLocating}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg font-bold text-lemon hover:bg-white/10 disabled:opacity-70"
              title="Use my current GPS position"
              aria-label="Use my current GPS position"
            >
              {isLocating ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Locate className="w-4 h-4" />}
              <span className="hidden sm:inline">{isLocating ? 'Locating…' : 'GPS'}</span>
            </button>
            <button onClick={onOpenPicker} className="px-2 py-1.5 rounded-lg font-bold underline hover:bg-white/10">
              Change
            </button>
          </div>
        </div>
        {/* A first visit starts somewhere the user may not be: say so, and offer their own location in words */}
        {isDefault && !error && (
          <p className="mt-1 ml-8 flex flex-wrap items-center gap-x-1.5 text-xs text-helvetia-200">
            Not at {location.name.split('(')[0].trim()}?
            <button
              type="button"
              onClick={useGps}
              disabled={isLocating}
              className="inline-flex items-center gap-1 font-bold text-lemon underline underline-offset-2 disabled:opacity-70"
            >
              {isLocating ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Locate className="w-3.5 h-3.5" />}
              {isLocating ? 'Finding you…' : 'Use my location'}
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 ml-8 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
            {error}
          </p>
        )}
        <div className="mt-2 flex items-end gap-2.5">
          <span className="w-6 h-12 flex items-center justify-center shrink-0" aria-hidden="true">
            <Flag className="w-4 h-4 text-lemon" strokeWidth={2.75} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-helvetia-300 mb-1">Where to?</span>
            <PlaceSearch
              network={network}
              onSelect={onSetDestination}
              onClear={onClearDestination}
              value={destination?.name ?? ''}
              recent={recentPlaces}
              label="Where to?"
              placeholder="Place, address or postal code"
              inputClassName="py-3 text-base font-semibold"
              icon={null}
            />
          </div>
          {destination && onSwap && (
            <button
              type="button"
              onClick={onSwap}
              className="w-10 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0"
              title="Swap: plan the trip back"
              aria-label={`Swap: plan the trip from ${destination.name} back to ${location.name}`}
            >
              <ArrowUpDown className="w-5 h-5" />
            </button>
          )}
        </div>
        {shortcuts.length > 0 && (
          <div className="mt-2.5 ml-8 flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Recent places">
            {shortcuts.map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => onSetDestination(place)}
                className="shrink-0 max-w-[12rem] flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 pl-2 pr-3 py-1.5 text-xs font-semibold"
              >
                <Clock className="w-3.5 h-3.5 text-lemon shrink-0" />
                <span className="truncate">{place.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {children}
    </section>
  );
};
