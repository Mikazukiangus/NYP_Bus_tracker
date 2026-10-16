import React, { useLayoutEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { AlightHint, ArrivalDataSource, BusServiceArrivals, BusStop } from '../types/bus';
import type { LeaveWithin } from '../services/leaveWithin';
import { BOTTOM_BAR_HEIGHT } from './AppTabs';
import { Minutes } from './ArrivalBits';

interface LiveArrivalsBarProps {
  arrivals: BusServiceArrivals;
  stop: BusStop;
  dataSource: ArrivalDataSource;
  alight?: AlightHint | null;
  leave?: LeaveWithin | null; // when to set off to catch one of these buses
  targetId: string; // the element holding the full arrivals card, when the tab has one
  watchKey: string; // changes when that element is swapped (e.g. the tab), to watch the new one
  onOpen: () => void; // show the full arrivals card
}

// Share of the arrivals card that must be on screen for the bar to step aside
const VISIBLE_SHARE = 0.35;

// Phones: the tracked bus's next arrivals pinned above the tab bar, on tabs without the arrivals card and while
// the card is scrolled away. Tapping it shows the card.
export const LiveArrivalsBar: React.FC<LiveArrivalsBarProps> = ({ arrivals, stop, dataSource, alight, leave, targetId, watchKey, onOpen }) => {
  const [hasCard, setHasCard] = useState(false);
  const [cardOnScreen, setCardOnScreen] = useState(true);

  // Before paint, so switching tabs doesn't flash the bar over a card that is on screen
  useLayoutEffect(() => {
    const card = document.getElementById(targetId);
    setHasCard(!!card);
    setCardOnScreen(true);
    if (!card || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setCardOnScreen(entry.isIntersecting && entry.intersectionRatio >= VISIBLE_SHARE),
      // Leave out the tab bar and this bar at the bottom (the header isn't pinned on phones)
      { rootMargin: '0px 0px -120px 0px', threshold: [0, VISIBLE_SHARE] }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [targetId, watchKey]);

  if (hasCard && cardOnScreen) return null;

  const later = [arrivals.nextBus2, arrivals.nextBus3].filter((b) => b !== null).map((b) => (b.estimatedMinutes <= 0 ? 'Arr' : b.estimatedMinutes));
  const offAt = alight?.status === 'alight' ? ` · off at ${alight.stop.name}` : '';
  const isLive = dataSource === 'LTA_DATAMALL_V3';
  // Citymapper's "Leave within", or else the same wording as the arrivals card: a GPS-tracked bus, a timetable
  // estimate, or no live feed
  const status =
    dataSource === 'LOADING'
      ? 'Loading'
      : !isLive
        ? 'Simulated'
        : !arrivals.nextBus
          ? 'No bus due'
          : leave?.status === 'leave'
            ? leave.inMin <= 1
              ? 'Leave now'
              : `Leave within ${leave.inMin}\u00a0min`
            : arrivals.nextBus.monitored
              ? 'Live GPS'
              : 'Scheduled';

  return (
    <div
      className="sm:hidden fixed inset-x-0 z-30 px-3 pb-2 pointer-events-none"
      style={{ bottom: `calc(${BOTTOM_BAR_HEIGHT} + env(safe-area-inset-bottom))` }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Bus ${arrivals.serviceNo} at ${stop.name}: show live arrivals`}
        className="pointer-events-auto w-full bg-helvetia-950 text-white rounded-2xl shadow-lg ring-1 ring-white/10 px-3 py-2 flex items-center gap-3 text-left"
      >
        <span className="min-w-[2.75rem] text-center bg-lemon text-helvetia-950 font-black text-sm px-2 py-1 rounded-lg shrink-0">
          {arrivals.serviceNo}
        </span>
        <span className="min-w-0 flex-1 text-[11px] leading-snug">
          <span className="block font-semibold truncate">at {stop.name}</span>
          <span className={`block truncate ${leave?.status === 'leave' && isLive ? 'text-lemon font-bold' : 'text-helvetia-200'}`}>
            {status}
            {offAt}
          </span>
        </span>
        <span className="text-right shrink-0 leading-tight">
          {arrivals.nextBus ? (
            <Minutes
              min={arrivals.nextBus.estimatedMinutes}
              signal={isLive && arrivals.nextBus.monitored ? 'live' : undefined}
              signalClassName="text-lemon"
              arrClassName="text-lemon"
            />
          ) : (
            <span className="block text-lg font-black">{dataSource === 'LOADING' ? '…' : '–'}</span>
          )}
          {later.length > 0 && <span className="block text-[11px] text-helvetia-200">then {later.join(', ')}</span>}
        </span>
        <ChevronUp className="w-4 h-4 text-lemon shrink-0" />
      </button>
    </div>
  );
};
