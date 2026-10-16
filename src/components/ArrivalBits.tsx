import React from 'react';
import { Clock } from 'lucide-react';
import { BusArrivalInfo, BusLoad } from '../types/bus';

export const formatEta = (minutes: number) => (minutes <= 0 ? 'Arr' : `${minutes} min`);

// Citymapper's live sign: a dot sending out arcs, beside times from a bus's live GPS position (the arcs pulse
// unless reduced motion is on). Green-blue on light surfaces, lemon on dark ones.
export const LiveSignal: React.FC<{ className?: string; title?: string }> = ({ className = 'w-3 h-3', title }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3.5}
    strokeLinecap="round"
    className={`shrink-0 ${className}`}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    {title && <title>{title}</title>}
    <circle cx="5" cy="19" r="2.75" fill="currentColor" stroke="none" />
    <path className="live-signal-arc1" d="M5 11.5a7.5 7.5 0 0 1 7.5 7.5" />
    <path className="live-signal-arc2" d="M5 4a15 15 0 0 1 15 15" />
  </svg>
);

const MINUTES_SIZE = {
  sm: { num: 'text-base', unit: 'text-[10px] ml-0.5', icon: 'w-2.5 h-2.5 mr-0.5' },
  md: { num: 'text-xl tracking-tight', unit: 'text-[11px] ml-0.5', icon: 'w-3 h-3 mr-0.5' },
  lg: { num: 'text-3xl @2xl:text-4xl tracking-tight', unit: 'text-sm @2xl:text-base ml-1', icon: 'w-3.5 h-3.5 mr-0.5 mt-0.5' },
} as const;

// A time as Citymapper shows it: a big number with a small "min", and the live sign (or a clock for a timetable
// estimate) at its top left
export const Minutes: React.FC<{
  min: number;
  signal?: 'live' | 'scheduled'; // left out: no sign
  size?: keyof typeof MINUTES_SIZE;
  signalClassName?: string; // colour of the live sign (green-blue on light surfaces)
  arrClassName?: string; // colour of "Arr" (a bus arriving now)
  className?: string;
}> = ({ min, signal, size = 'md', signalClassName = 'text-green-blue', arrClassName = 'text-green-blue-ink', className = '' }) => {
  const s = MINUTES_SIZE[size];
  return (
    <span className={`inline-flex items-baseline leading-none font-black ${className}`}>
      {signal === 'live' && <LiveSignal className={`self-start ${s.icon} ${signalClassName}`} title="Live GPS" />}
      {signal === 'scheduled' && (
        <Clock className={`self-start ${s.icon} opacity-50`} strokeWidth={3} role="img" aria-label="Scheduled" />
      )}
      {min <= 0 ? (
        <span className={`${s.num} ${arrClassName}`}>Arr</span>
      ) : (
        <>
          <span className={s.num}>{min}</span>
          <span className={`${s.unit} font-bold opacity-70`}>min</span>
        </>
      )}
    </span>
  );
};

// How full a bus is, in steps: one with seats free, two standing, three nearly full
export const LOAD_INFO: Record<BusLoad, { level: number; label: string; short: string; fill: string }> = {
  SEA: { level: 1, label: 'Seats available', short: 'Seats', fill: 'bg-green-blue' },
  SDA: { level: 2, label: 'Standing available', short: 'Standing', fill: 'bg-amber-500' },
  LSD: { level: 3, label: 'Limited standing', short: 'Limited', fill: 'bg-rose-500' },
};

// SG BusLeh's load bars and Google Maps' crowding levels: a three-step bar under a time, coloured by how full the
// bus is, so a row of times can be read at a glance. emptyClassName: the unlit steps (lighter on dark surfaces).
export const LoadMeter: React.FC<{ load: BusLoad; className?: string; emptyClassName?: string }> = ({
  load,
  className = '',
  emptyClassName = 'bg-warm-200',
}) => {
  const info = LOAD_INFO[load];
  return (
    <span role="img" aria-label={info.label} title={info.label} className={`inline-flex items-center gap-0.5 shrink-0 ${className}`}>
      {[1, 2, 3].map((step) => (
        <span key={step} className={`w-2.5 h-1.5 rounded-full ${step <= info.level ? info.fill : emptyClassName}`} />
      ))}
    </span>
  );
};

// Whether LTA's estimate is based on the bus's live GPS position or only on the timetable
export const TrackingBadge: React.FC<{ bus: Pick<BusArrivalInfo, 'monitored'>; compact?: boolean }> = ({ bus, compact }) =>
  bus.monitored ? (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold text-green-blue-ink"
      title="Estimate from the bus's live GPS position"
    >
      <LiveSignal className="w-3 h-3 text-green-blue" />
      {compact ? 'GPS' : 'Live GPS'}
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold text-warm-500"
      title="No GPS fix yet (e.g. bus still at the interchange): estimate is from the timetable"
    >
      <Clock className="w-3 h-3 shrink-0" />
      {compact ? 'Sched.' : 'Scheduled'}
    </span>
  );
