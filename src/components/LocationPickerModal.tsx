import React, { useEffect, useState } from 'react';
import { UserLocation } from '../types/bus';
import { SINGAPORE_LOCATIONS } from '../data/singaporeBuses';
import { requestGpsLocation } from '../services/userLocation';
import type { BusNetwork } from '../services/busNetwork';
import { PlaceResult, placeToLocation } from '../services/placeSearch';
import { PlaceSearch, PlaceKindIcon } from './PlaceSearch';
import { X, Navigation, Locate, MapPin, Check, Loader2, GraduationCap, Clock } from 'lucide-react';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: UserLocation;
  onSelectLocation: (location: UserLocation) => void;
  network: BusNetwork | null;
  recentPlaces: PlaceResult[];
  onPlaceChosen: (place: PlaceResult) => void;
}

const sameSpot = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, tolerance = 0.0002) =>
  Math.abs(a.lat - b.lat) < tolerance && Math.abs(a.lng - b.lng) < tolerance;

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onSelectLocation,
  network,
  recentPlaces,
  onPlaceChosen,
}) => {
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setGeoError(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const nypLocation = SINGAPORE_LOCATIONS.find((l) => l.name.includes('Nanyang Polytechnic')) ?? SINGAPORE_LOCATIONS[0];
  const isNypSelected = currentLocation.isSimulated && sameSpot(currentLocation, nypLocation, 0.0005);
  // Typing straight away is the fastest path on a computer; on phones the keyboard would hide the GPS option
  const autoFocusSearch = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 640px)').matches;

  const choose = (loc: UserLocation) => {
    onSelectLocation(loc);
    onClose();
  };

  const choosePlace = (place: PlaceResult) => {
    onPlaceChosen(place);
    choose(placeToLocation(place));
  };

  const handleUseGps = async () => {
    setIsLocating(true);
    setGeoError(null);
    const result = await requestGpsLocation();
    setIsLocating(false);
    if ('error' in result) setGeoError(result.error);
    else choose(result.location);
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center sm:p-4 bg-warm-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-picker-title"
        className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl border border-warm-200 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh]"
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-warm-50 border-b border-warm-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-helvetia text-white flex items-center justify-center shrink-0">
              <Navigation className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 id="location-picker-title" className="text-base font-black text-helvetia leading-tight">
                Set your location
              </h2>
              <p className="text-xs text-warm-500">Nearby stops, buses, weather and trips start from here</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close location picker"
            className="p-1.5 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-warm-200 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Search: address, place, postal code or bus stop */}
          <div>
            <PlaceSearch
              network={network}
              onSelect={choosePlace}
              variant="inline"
              label="Search for a location"
              placeholder="Address, place, postal code or bus stop"
              autoFocus={autoFocusSearch}
              inputClassName="py-3 text-sm font-semibold"
            />
            <p className="mt-1.5 text-[11px] text-warm-500">
              e.g. <span className="font-semibold text-warm-600">560123</span>,{' '}
              <span className="font-semibold text-warm-600">Ang Mo Kio Hub</span> or stop{' '}
              <span className="font-semibold text-warm-600">55329</span>
            </p>
          </div>

          {/* GPS */}
          <div>
            <button
              onClick={handleUseGps}
              disabled={isLocating}
              className={`w-full p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all ${
                !currentLocation.isSimulated
                  ? 'bg-green-blue-soft border-green-blue/40 text-green-blue-ink'
                  : 'bg-green-blue-ink hover:bg-helvetia-800 border-green-blue-ink text-white'
              }`}
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Getting your GPS position…</span>
                </>
              ) : (
                <>
                  <Locate className="w-4 h-4" />
                  <span>{!currentLocation.isSimulated ? 'Update my GPS position' : 'Use my current GPS position'}</span>
                </>
              )}
            </button>
            {geoError && (
              <div role="alert" className="mt-2 text-xs text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                {geoError}
              </div>
            )}
          </div>

          {/* Recent places */}
          {recentPlaces.length > 0 && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-warm-500 mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Recent
              </h3>
              <div className="rounded-xl border border-warm-200 divide-y divide-warm-100 overflow-hidden">
                {recentPlaces.map((place) => {
                  const selected = currentLocation.isSimulated && sameSpot(currentLocation, place);
                  return (
                    <button
                      key={place.id}
                      onClick={() => choosePlace(place)}
                      className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left ${
                        selected ? 'bg-helvetia-50' : 'bg-white hover:bg-warm-50'
                      }`}
                    >
                      <PlaceKindIcon kind={place.kind} className="w-4 h-4 text-green-blue-ink shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-warm-900 truncate">{place.name}</span>
                        {place.subtitle && <span className="block text-xs text-warm-500 truncate">{place.subtitle}</span>}
                      </span>
                      {selected && <Check className="w-4 h-4 text-helvetia shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Featured: NYP */}
          <button
            onClick={() => choose(nypLocation)}
            className={`w-full text-left rounded-xl p-3.5 border transition-all flex items-center justify-between gap-3 ${
              isNypSelected
                ? 'bg-helvetia-900 text-white border-helvetia-950 shadow-md ring-2 ring-helvetia-300'
                : 'bg-gradient-to-r from-helvetia-50 via-helvetia-100/60 to-helvetia-50 hover:bg-helvetia-100/80 border-helvetia-200 text-helvetia-950'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isNypSelected ? 'bg-white/20 text-white' : 'bg-helvetia text-white'
                }`}
              >
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-extrabold text-sm leading-tight">Nanyang Polytechnic (NYP)</div>
                <p className={`text-xs mt-0.5 ${isNypSelected ? 'text-helvetia-200' : 'text-warm-600'}`}>
                  Ang Mo Kio Ave 8 • Next to Yio Chu Kang MRT
                </p>
              </div>
            </div>
            <span
              className={`text-xs font-bold px-2 py-1 rounded-lg shrink-0 ${
                isNypSelected ? 'bg-lemon text-helvetia-950' : 'bg-white text-helvetia border border-helvetia-200'
              }`}
            >
              {isNypSelected ? 'Current' : 'Use'}
            </span>
          </button>

          {/* Suggested places */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-warm-500 mb-1.5">Suggested places</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SINGAPORE_LOCATIONS.filter((loc) => loc !== nypLocation).map((loc) => {
                const isSelected = currentLocation.isSimulated && sameSpot(currentLocation, loc);
                return (
                  <button
                    key={loc.name}
                    onClick={() => choose(loc)}
                    className={`p-2.5 text-left rounded-xl border transition-all flex items-start justify-between gap-2 text-xs ${
                      isSelected
                        ? 'bg-helvetia-50 border-helvetia text-helvetia font-bold ring-1 ring-helvetia'
                        : 'border-warm-200 hover:bg-warm-50 text-warm-700'
                    }`}
                  >
                    <span className="flex items-start gap-2 min-w-0">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warm-500" />
                      <span className="truncate">{loc.name}</span>
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-helvetia shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-3 bg-warm-50 border-t border-warm-200 flex items-center justify-between gap-3">
          <span className="text-[11px] text-warm-500 truncate min-w-0">
            Current: <strong className="text-warm-800">{currentLocation.name.split('(')[0].trim()}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-warm-800 hover:bg-warm-900 text-white text-xs font-semibold rounded-xl shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
