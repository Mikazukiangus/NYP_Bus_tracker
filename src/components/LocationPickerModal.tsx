import React, { useState } from 'react';
import { UserLocation } from '../types/bus';
import { SINGAPORE_LOCATIONS } from '../data/singaporeBuses';
import { X, Navigation, Locate, MapPin, Check, Loader2 } from 'lucide-react';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: UserLocation;
  onSelectLocation: (location: UserLocation) => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onSelectLocation
}) => {
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUseRealGps = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        onSelectLocation({
          name: 'My Device GPS Location',
          lat: latitude,
          lng: longitude,
          isSimulated: false,
          accuracyMeters: Math.round(accuracy)
        });
        onClose();
      },
      (err) => {
        setIsLocating(false);
        setGeoError(
          err.code === 1
            ? 'Location permission was denied. You can select any Singapore hub below.'
            : 'Unable to retrieve location. Please choose a preset below.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-[#602a85] flex items-center justify-center">
              <Navigation className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">
                Change Commuter Location
              </h2>
              <p className="text-xs text-slate-500">
                Determines which bus stop is nearest to you
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* GPS Button */}
          <div>
            <button
              onClick={handleUseRealGps}
              disabled={isLocating}
              className="w-full p-3.5 bg-gradient-to-r from-[#602a85] to-[#7832a8] hover:from-[#502170] hover:to-[#682a94] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Detecting GPS Coordinates...</span>
                </>
              ) : (
                <>
                  <Locate className="w-4 h-4 text-emerald-300" />
                  <span>Use Device GPS (Browser Geolocation)</span>
                </>
              )}
            </button>

            {geoError && (
              <div className="mt-2 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                {geoError}
              </div>
            )}
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
              Or pick Singapore commute hub
            </span>
          </div>

          {/* Preset list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SINGAPORE_LOCATIONS.map((loc) => {
              const isSelected =
                Math.abs(currentLocation.lat - loc.lat) < 0.0001 &&
                Math.abs(currentLocation.lng - loc.lng) < 0.0001;

              return (
                <button
                  key={loc.name}
                  onClick={() => {
                    onSelectLocation(loc);
                    onClose();
                  }}
                  className={`p-3 text-left rounded-xl border transition-all flex items-start justify-between gap-2 text-xs ${
                    isSelected
                      ? 'bg-purple-50/80 border-[#602a85] text-[#602a85] font-bold ring-1 ring-[#602a85]'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                    <span className="truncate">{loc.name}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#602a85] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
