import React, { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { AlightHint, ArrivalDataSource, BusServiceArrivals, BusStop } from '../types/bus';

interface LiveArrivalsBarProps {
  arrivals: BusServiceArrivals;
  stop: BusStop;
  dataSource: ArrivalDataSource;
  alight?: AlightHint | null;
  targetId: string; // the element holding the full arrivals card
  watchKey: string; // changes when that element is swapped (e.g. the tab), to watch the new one
}

// Share of the arrivals card that must be on screen for the bar to step aside
const VISIBLE_SHARE = 0.35;

const eta = (min: number) => (min <= 0 ? 'Arr' : `${min} min`);

// Phones: the tracked bus's next arrivals pinned to the bottom of the screen while its card is scrolled away.
// Tapping it scrolls back to the card.
export const LiveArrivalsBar: React.FC<LiveArrivalsBarProps> = ({ arrivals, stop, dataSource, alight, targetId, watchKey }) => {
  const [hasCard, setHasCard] = useState(false);
  const [cardOnScreen, setCardOnScreen] = useState(true);

  useEffect(() => {
    const card = document.getElementById(targetId);
    setHasCard(!!card);
    setCardOnScreen(true);
    if (!card || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setCardOnScreen(entry.isIntersecting && entry.intersectionRatio >= VISIBLE_SHARE),
      // Leave out the sticky header at the top and the bar itself at the bottom
      { rootMargin: '-96px 0px -72px 0px', threshold: [0, VISIBLE_SHARE] }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [targetId, watchKey]);

  if (!hasCard || cardOnScreen) return null;

  const later = [arrivals.nextBus2, arrivals.nextBus3].filter((b) => b !== null).map((b) => (b.estimatedMinutes <= 0 ? 'Arr' : b.estimatedMinutes));
  const offAt = alight?.status === 'alight' ? ` · off at ${alight.stop.name}` : '';
  // Same wording as the arrivals card: a GPS-tracked bus, a timetable estimate, or no live feed
  const status =
    dataSource === 'LOADING'
      ? 'Loading'
      : dataSource !== 'LTA_DATAMALL_V3'
        ? 'Simulated'
        : !arrivals.nextBus
          ? 'No bus due'
          : arrivals.nextBus.monitored
            ? 'Live GPS'
            : 'Scheduled';

  return (
    <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none">
      <button
        type="button"
        onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        aria-label={`Bus ${arrivals.serviceNo} at ${stop.name}: show live arrivals`}
        className="pointer-events-auto w-full bg-helvetia-950 text-white rounded-2xl shadow-lg ring-1 ring-white/10 px-3 py-2 flex items-center gap-3 text-left"
      >
        <span className="min-w-[2.75rem] text-center bg-lemon text-helvetia-950 font-black text-sm px-2 py-1 rounded-lg shrink-0">
          {arrivals.serviceNo}
        </span>
        <span className="min-w-0 flex-1 text-[11px] leading-snug">
          <span className="block font-semibold truncate">at {stop.name}</span>
          <span className="block text-helvetia-200 truncate">
            {status}
            {offAt}
          </span>
        </span>
        <span className="text-right shrink-0 leading-tight">
          <span className="block text-lg font-black">
            {arrivals.nextBus ? eta(arrivals.nextBus.estimatedMinutes) : dataSource === 'LOADING' ? '…' : '–'}
          </span>
          {later.length > 0 && <span className="block text-[11px] text-helvetia-200">then {later.join(', ')}</span>}
        </span>
        <ChevronUp className="w-4 h-4 text-lemon shrink-0" />
      </button>
    </div>
  );
};
