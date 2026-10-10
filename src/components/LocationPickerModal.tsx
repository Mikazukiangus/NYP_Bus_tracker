import React, { useState, useMemo } from 'react';
import { UserLocation } from '../types/bus';
import { SINGAPORE_LOCATIONS } from '../data/singaporeBuses';
import { X, Navigation, Locate, MapPin, Check, Loader2, Search, GraduationCap } from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'campus' | 'north' | 'central'>('all');
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const nypLocation = SINGAPORE_LOCATIONS.find((l) => l.name.includes('Nanyang Polytechnic')) || {
    name: 'Nanyang Polytechnic (NYP Campus / AMK Ave 8)',
    lat: 1.3800,
    lng: 103.8489,
    isSimulated: true,
  };

  const filteredLocations = useMemo(() => {
    return SINGAPORE_LOCATIONS.filter((loc) => {
      // Keyword query matching
      const matchesQuery =
        loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (searchQuery.toLowerCase().includes('nyp') && loc.name.toLowerCase().includes('nanyang')) ||
        (searchQuery.toLowerCase().includes('poly') && loc.name.toLowerCase().includes('polytechnic')) ||
        (searchQuery.toLowerCase().includes('amk') && loc.name.toLowerCase().includes('ang mo kio')) ||
        (searchQuery.toLowerCase().includes('yck') && loc.name.toLowerCase().includes('yio chu kang'));

      if (!matchesQuery) return false;

      if (activeCategory === 'campus') {
        return (
          loc.name.includes('Polytechnic') ||
          loc.name.includes('Poly') ||
          loc.name.includes('Campus') ||
          loc.name.includes('NUS') ||
          loc.name.includes('NTU')
        );
      }
      if (activeCategory === 'north') {
        return (
          loc.name.includes('Nanyang') ||
          loc.name.includes('Yio Chu Kang') ||
          loc.name.includes('Ang Mo Kio') ||
          loc.name.includes('Woodlands') ||
          loc.name.includes('Hougang')
        );
      }
      if (activeCategory === 'central') {
        return (
          loc.name.includes('Orchard') ||
          loc.name.includes('Raffles') ||
          loc.name.includes('Bugis') ||
          loc.name.includes('Dhoby') ||
          loc.name.includes('Chinatown')
        );
      }

      return true;
    });
  }, [searchQuery, activeCategory]);

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
            ? 'Location permission was denied. You can select Nanyang Polytechnic or any Singapore hub below.'
            : 'Unable to retrieve location. Please choose a preset below.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const isNypSelected =
    Math.abs(currentLocation.lat - nypLocation.lat) < 0.0005 &&
    Math.abs(currentLocation.lng - nypLocation.lng) < 0.0005;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-warm-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-warm-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-warm-50 border-b border-warm-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-helvetia text-white flex items-center justify-center">
              <Navigation className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-helvetia leading-tight">
                Select Commuter Location
              </h2>
              <p className="text-xs text-warm-500">
                Choose your Singapore starting point or campus
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close location picker"
            className="p-1.5 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-warm-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
          {/* Quick 1-Tap Nanyang Polytechnic Feature Banner */}
          <div
            onClick={() => {
              onSelectLocation(nypLocation);
              onClose();
            }}
            className={`cursor-pointer rounded-xl p-3.5 border transition-all flex items-center justify-between gap-3 ${
              isNypSelected
                ? 'bg-helvetia-900 text-white border-helvetia-950 shadow-md ring-2 ring-helvetia-300'
                : 'bg-gradient-to-r from-helvetia-50 via-helvetia-100/60 to-helvetia-50 hover:bg-helvetia-100/80 border-helvetia-200 text-helvetia-950'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isNypSelected ? 'bg-white/20 text-white' : 'bg-helvetia text-white'
              }`}>
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm leading-tight">
                    Nanyang Polytechnic (NYP)
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                    isNypSelected ? 'bg-lemon text-helvetia-950' : 'bg-lemon-soft text-helvetia-950'
                  }`}>
                    Featured
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${isNypSelected ? 'text-helvetia-200' : 'text-warm-600'}`}>
                  Ang Mo Kio Ave 8 • Next to Yio Chu Kang MRT
                </p>
              </div>
            </div>

            {isNypSelected ? (
              <span className="text-xs bg-lemon text-helvetia-950 font-bold px-2 py-1 rounded-lg">
                Current
              </span>
            ) : (
              <span className="text-xs bg-white text-helvetia font-bold px-2.5 py-1 rounded-lg border border-helvetia-200 shadow-2xs shrink-0">
                Switch Here
              </span>
            )}
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-warm-500 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search location (e.g. Nanyang Polytechnic, NYP, AMK, Orchard)..."
              className="w-full pl-9 pr-3 py-2 bg-warm-50 border border-warm-200 rounded-xl text-xs font-semibold text-warm-900 placeholder:text-warm-500 placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-helvetia"
            />
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-[11px] font-semibold">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
                activeCategory === 'all'
                  ? 'bg-warm-900 text-white'
                  : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
              }`}
            >
              All Hubs ({SINGAPORE_LOCATIONS.length})
            </button>
            <button
              onClick={() => setActiveCategory('campus')}
              className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 flex items-center gap-1 ${
                activeCategory === 'campus'
                  ? 'bg-helvetia text-white'
                  : 'bg-helvetia-50 text-helvetia-800 hover:bg-helvetia-100'
              }`}
            >
              <GraduationCap className="w-3 h-3" />
              <span>NYP & Campuses</span>
            </button>
            <button
              onClick={() => setActiveCategory('north')}
              className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
                activeCategory === 'north'
                  ? 'bg-warm-900 text-white'
                  : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
              }`}
            >
              North (AMK/YCK)
            </button>
            <button
              onClick={() => setActiveCategory('central')}
              className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
                activeCategory === 'central'
                  ? 'bg-warm-900 text-white'
                  : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
              }`}
            >
              Central / City
            </button>
          </div>

          {/* GPS Button */}
          <div>
            <button
              onClick={handleUseRealGps}
              disabled={isLocating}
              className="w-full p-2.5 bg-warm-100 hover:bg-warm-200 text-warm-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-warm-200 transition-all"
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-helvetia" />
                  <span>Detecting GPS Coordinates...</span>
                </>
              ) : (
                <>
                  <Locate className="w-3.5 h-3.5 text-helvetia-600" />
                  <span>Use Browser GPS (Current Physical Location)</span>
                </>
              )}
            </button>

            {geoError && (
              <div className="mt-2 text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
                {geoError}
              </div>
            )}
          </div>

          {/* Preset list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
            {filteredLocations.map((loc) => {
              const isSelected =
                Math.abs(currentLocation.lat - loc.lat) < 0.0002 &&
                Math.abs(currentLocation.lng - loc.lng) < 0.0002;

              const isNyp = loc.name.includes('Nanyang Polytechnic');

              return (
                <button
                  key={loc.name}
                  onClick={() => {
                    onSelectLocation(loc);
                    onClose();
                  }}
                  className={`p-2.5 text-left rounded-xl border transition-all flex items-start justify-between gap-2 text-xs ${
                    isSelected
                      ? 'bg-helvetia-50 border-helvetia text-helvetia font-bold ring-1 ring-helvetia'
                      : isNyp
                      ? 'border-helvetia-200 bg-helvetia-50/40 hover:bg-helvetia-100/50 text-warm-800 font-semibold'
                      : 'border-warm-200 hover:bg-warm-50 text-warm-700'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isNyp ? 'text-helvetia' : 'text-warm-500'}`} />
                    <span className="truncate">{loc.name}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-helvetia shrink-0" />}
                </button>
              );
            })}

            {filteredLocations.length === 0 && (
              <div className="col-span-2 py-8 text-center text-warm-500 text-xs">
                No location found matching "{searchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-warm-50 border-t border-warm-200 flex items-center justify-between">
          <span className="text-[11px] text-warm-500">
            Selected: <strong className="text-warm-800">{currentLocation.name.split('(')[0].trim()}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-warm-800 hover:bg-warm-900 text-white text-xs font-semibold rounded-xl"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
