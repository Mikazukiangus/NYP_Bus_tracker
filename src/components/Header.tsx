import React from 'react';
import { Bus, MapPin, Heart, Clock, RefreshCw } from 'lucide-react';
import { UserLocation } from '../types/bus';

interface HeaderProps {
  userLocation: UserLocation;
  onOpenLocationPicker: () => void;
  favoritesCount: number;
  onOpenFavorites: () => void;
  activeTab: 'arrivals' | 'map' | 'stops' | 'weather';
  setActiveTab: (tab: 'arrivals' | 'map' | 'stops' | 'weather') => void;
  onRefreshAll: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  userLocation,
  onOpenLocationPicker,
  favoritesCount,
  onOpenFavorites,
  activeTab,
  setActiveTab,
  onRefreshAll,
  isRefreshing
}) => {
  const [sgTime, setSgTime] = React.useState('');

  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setSgTime(
        now.toLocaleTimeString('en-SG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Singapore'
        }) + ' SGT'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-white border-t-4 border-t-green-blue border-b border-b-warm-200 sticky top-0 z-40 shadow-xs">
      {/* Top corporate bar */}
      <div className="hidden sm:flex bg-helvetia text-white text-xs px-4 py-1.5 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-wide">BusTrackerSG</span>
          <span className="text-helvetia-200 text-[11px] hidden sm:inline">| A member of NYP Bus</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1 text-helvetia-200">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{sgTime || 'Singapore Time'}</span>
          </div>
        </div>
      </div>

      {/* Main header row */}
      <div className="max-w-7xl mx-auto px-4 py-2 sm:py-3 flex items-center justify-between gap-3">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-lemon flex items-center justify-center text-helvetia shadow-sm ring-1 ring-warm-gray/40">
            <Bus className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-bold text-helvetia tracking-tight leading-none">
                BusTrackerSG
              </h1>
              <span className="bg-green-blue-soft text-green-blue-ink text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                Live
              </span>
            </div>
            <p className="text-[11px] text-warm-500 font-medium hidden sm:block">
              Nearest Bus Arrival & Real-Time Tracker
            </p>
          </div>
        </div>

        {/* User Location pill & Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Location button */}
          <button
            onClick={onOpenLocationPicker}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-helvetia-200 bg-helvetia-50/70 hover:bg-helvetia-100/70 transition-colors text-xs text-helvetia-900 group max-w-[220px] lg:max-w-[300px]"
            title="Change your location (preset place or GPS)"
          >
            <MapPin className="w-3.5 h-3.5 text-helvetia shrink-0 group-hover:scale-110 transition-transform" />
            <span className="truncate font-medium text-[11px] sm:text-xs">
              {userLocation.name}
            </span>
            <span className="text-[10px] bg-white px-1 py-0.2 rounded text-helvetia-700 border border-helvetia-200 hidden md:inline">
              Change
            </span>
          </button>

          {/* Refresh button */}
          <button
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="p-2.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-warm-200 hover:bg-warm-50 text-warm-700 transition-colors flex items-center gap-1 text-xs"
            title="Refresh arrival timings"
            aria-label="Refresh arrival timings"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-helvetia' : ''}`} />
            <span className="hidden md:inline font-medium text-[11px]">Refresh</span>
          </button>

          {/* Favorites shortcut */}
          <button
            onClick={onOpenFavorites}
            className="flex items-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-lg bg-helvetia hover:bg-helvetia-700 text-white text-xs font-medium transition-colors shadow-xs"
            title="View saved bus services and stops"
            aria-label="View saved favourites"
          >
            <Heart className="w-3.5 h-3.5 fill-lemon text-lemon" />
            <span className="hidden sm:inline">Favourites</span>
            {favoritesCount > 0 && (
              <span className="bg-lemon text-helvetia-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {favoritesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Navigation tabs */}
      <nav className="max-w-7xl mx-auto px-2 sm:px-4 border-t border-warm-100 flex items-center overflow-x-auto no-scrollbar sm:gap-2">
        <button
          onClick={() => setActiveTab('arrivals')}
          className={`flex-1 sm:flex-none justify-center py-2.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'arrivals'
              ? 'border-helvetia text-helvetia font-semibold'
              : 'border-transparent text-warm-600 hover:text-warm-900'
          }`}
        >
          <span className="sm:hidden">Arrivals</span>
          <span className="hidden sm:inline">Arrival Times</span>
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`flex-1 sm:flex-none justify-center py-2.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'map'
              ? 'border-helvetia text-helvetia font-semibold'
              : 'border-transparent text-warm-600 hover:text-warm-900'
          }`}
        >
          <span className="sm:hidden">Map</span>
          <span className="hidden sm:inline">Live Bus Map</span>
          <span className="w-2 h-2 rounded-full bg-green-blue animate-ping inline-block" />
        </button>
        <button
          onClick={() => setActiveTab('stops')}
          className={`flex-1 sm:flex-none justify-center py-2.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'stops'
              ? 'border-helvetia text-helvetia font-semibold'
              : 'border-transparent text-warm-600 hover:text-warm-900'
          }`}
        >
          <span className="sm:hidden">Stops</span>
          <span className="hidden sm:inline">Route Stops</span>
        </button>
        <button
          onClick={() => setActiveTab('weather')}
          className={`flex-1 sm:flex-none justify-center py-2.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'weather'
              ? 'border-helvetia text-helvetia font-semibold'
              : 'border-transparent text-warm-600 hover:text-warm-900'
          }`}
        >
          <span className="sm:hidden">Weather</span>
          <span className="hidden sm:inline">NEA Weather</span>
        </button>
      </nav>
    </header>
  );
};
