import React from 'react';
import { Bus, MapPin, Heart, Clock, RefreshCw } from 'lucide-react';
import { UserLocation } from '../types/bus';
import { APP_TABS, AppTab } from './AppTabs';

interface HeaderProps {
  userLocation: UserLocation;
  onOpenLocationPicker: () => void;
  favoritesCount: number;
  onOpenFavorites: () => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
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

  // Phones: the tabs are in a bar at the bottom, so the header scrolls away and leaves the screen to the content
  return (
    <header className="bg-white border-t-4 border-t-green-blue border-b border-b-warm-200 sm:sticky sm:top-0 z-40 shadow-xs">
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

          {/* Refresh button (phones: the arrivals card has one, with the countdown) */}
          <button
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="hidden sm:flex px-2.5 py-1.5 rounded-lg border border-warm-200 hover:bg-warm-50 text-warm-700 transition-colors items-center gap-1 text-xs"
            title="Refresh arrival timings"
            aria-label="Refresh arrival timings"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-helvetia' : ''}`} />
            <span className="hidden md:inline font-medium text-[11px]">Refresh</span>
          </button>

          {/* Saved buses (a word beside the heart: phones have no hover to explain an icon) */}
          <button
            onClick={onOpenFavorites}
            className="flex items-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-lg bg-helvetia hover:bg-helvetia-700 text-white text-xs font-semibold transition-colors shadow-xs"
            title="Your saved buses"
            aria-label={`Saved buses (${favoritesCount})`}
          >
            <Heart className="w-3.5 h-3.5 fill-lemon text-lemon" />
            <span>Saved</span>
            {favoritesCount > 0 && (
              <span className="bg-lemon text-helvetia-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {favoritesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Navigation tabs (phones: BottomTabBar) */}
      <nav className="hidden sm:flex max-w-7xl mx-auto px-4 border-t border-warm-100 items-center gap-2 overflow-x-auto no-scrollbar">
        {APP_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`py-2 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'border-helvetia text-helvetia font-semibold'
                : 'border-transparent text-warm-600 hover:text-warm-900'
            }`}
          >
            {tab.label}
            {tab.id === 'map' && <span className="w-2 h-2 rounded-full bg-green-blue animate-ping inline-block" />}
          </button>
        ))}
      </nav>
    </header>
  );
};
