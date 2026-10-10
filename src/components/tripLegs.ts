import type { AlightHint, TripView } from '../types/bus';

// Each bus of a trip has its own colour, the same on the map, in the trip steps and in the stops list:
// the first bus lemon, the bus after a change green-blue
export const LEG_STYLES = [
  {
    line: 'var(--color-lemon)',
    icon: 'bg-lemon text-helvetia-950', // round step / stop icons
    badge: 'bg-lemon text-helvetia-950', // service number chips
    border: 'border-lemon',
    soft: 'bg-lemon-soft',
  },
  {
    line: 'var(--color-green-blue)',
    icon: 'bg-green-blue text-white',
    badge: 'bg-green-blue-ink text-white',
    border: 'border-green-blue',
    soft: 'bg-green-blue-soft',
  },
] as const;

export const legStyle = (index: number) => LEG_STYLES[Math.min(index, LEG_STYLES.length - 1)];

export type TripLegView = TripView['legs'][number];

// The trip the tracked bus is part of, and the buses either side of it
export function tripLegs(hint: AlightHint | null | undefined) {
  const trip = hint?.status === 'alight' ? hint.trip ?? null : null;
  return {
    trip,
    prev: trip ? trip.legs[trip.legIndex - 1] ?? null : null,
    next: trip ? trip.legs[trip.legIndex + 1] ?? null : null,
  };
}
