import React from 'react';
import { Clock, CloudSun, ListOrdered, LucideIcon, Map as MapIcon } from 'lucide-react';
import type { Tone } from '../types/weather';
import { toneClasses } from '../features/weather/presentation';

export type AppTab = 'arrivals' | 'map' | 'stops' | 'weather';

// The app's four views: the long label for the tab row on wider screens, the short one for the bar on phones
export const APP_TABS: { id: AppTab; label: string; shortLabel: string; icon: LucideIcon }[] = [
  { id: 'arrivals', label: 'Arrival Times', shortLabel: 'Arrivals', icon: Clock },
  { id: 'map', label: 'Live Bus Map', shortLabel: 'Map', icon: MapIcon },
  { id: 'stops', label: 'Route Stops', shortLabel: 'Stops', icon: ListOrdered },
  { id: 'weather', label: 'NEA Weather', shortLabel: 'Weather', icon: CloudSun },
];

// Height of the bottom bar on phones, without the home-indicator inset (the next-bus bar sits on top of it)
export const BOTTOM_BAR_HEIGHT = '3.5rem';

interface BottomTabBarProps {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
  weatherAlert?: Tone | null; // the most serious weather alert worth a look, shown as a dot on the Weather tab
}

// Phones: the views as a row of buttons along the bottom of the screen, like a mobile app
export const BottomTabBar: React.FC<BottomTabBarProps> = ({ activeTab, onSelect, weatherAlert }) => (
  <nav
    aria-label="Views"
    className="sm:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-warm-200 shadow-[0_-2px_10px_rgba(0,43,64,0.06)] pb-[env(safe-area-inset-bottom)]"
  >
    <div className="grid grid-cols-4" style={{ height: BOTTOM_BAR_HEIGHT }}>
      {APP_TABS.map(({ id, shortLabel, icon: Icon }) => {
        const active = id === activeTab;
        const alert = id === 'weather' && weatherAlert ? weatherAlert : null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={alert ? `${shortLabel} (weather alert)` : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${
              active ? 'text-helvetia-950 font-bold' : 'text-warm-600 font-medium'
            }`}
          >
            <span
              className={`relative w-14 h-7 rounded-full flex items-center justify-center transition-colors ${
                active ? 'bg-lemon' : ''
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
              {alert && (
                <span className={`absolute top-0.5 right-3 w-2.5 h-2.5 rounded-full ring-2 ring-white ${toneClasses[alert].dot}`} />
              )}
            </span>
            {shortLabel}
          </button>
        );
      })}
    </div>
  </nav>
);
