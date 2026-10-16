// Citymapper's "Get off now" alarm: where you are along a bus ride, from your GPS position and the stops from where
// you got on to where you get off. A bus here only stops if someone rings the bell, so the first warning comes as
// the bus leaves the stop before yours ("your stop is next") and "Get off now" as it nears yours.

export interface LatLng {
  lat: number;
  lng: number;
}

export const GET_OFF_NOW_M = 250; // along the route to your stop: under a minute on a bus in town
export const AT_STOP_M = 30; // this close before a stop, the bus is at it (so the next stop is the one after)
export const OFF_ROUTE_M = 400; // further than this from the ride, you're not on the bus yet (or on another one)
export const MAX_ACCURACY_M = 150; // coarser fixes (from wifi or phone masts) are ignored
const TIE_M = 40; // a later part of the route passes about as close (a loop): take the earlier part

export type RidePhase = 'off-route' | 'riding' | 'next-stop' | 'get-off';

export interface RideProgress {
  phase: RidePhase;
  segment: number; // between stops[segment] and stops[segment + 1]: pass it back as fromSegment with the next fix
  stopsToGo: number; // stops until yours, counting yours (1: yours is next)
  remainingM: number; // along the route to your stop
}

// stops: from the boarding stop to the one to get off at, in order. fromSegment: the segment of the last fix, so
// the bus is never placed back along the route. Null for a fix too coarse to use.
export function rideProgress(stops: LatLng[], pos: LatLng & { accuracyM?: number }, fromSegment = 0): RideProgress | null {
  const last = stops.length - 1;
  if (last < 1 || (pos.accuracyM ?? 0) > MAX_ACCURACY_M) return null;

  // Flat metres around the position, which is the origin (fine over the length of a bus ride)
  const kx = 111_320 * Math.cos((pos.lat * Math.PI) / 180);
  const ky = 110_540;
  const pts = stops.map((s) => [(s.lng - pos.lng) * kx, (s.lat - pos.lat) * ky] as const);
  const segLen = pts.slice(1).map(([bx, by], k) => Math.hypot(bx - pts[k][0], by - pts[k][1]));
  const remainingFrom = (k: number, t: number) =>
    (1 - t) * segLen[k] + segLen.slice(k + 1).reduce((sum, len) => sum + len, 0);

  const start = Math.min(Math.max(0, fromSegment), last - 1);
  const fits: { k: number; t: number; d: number }[] = [];
  for (let k = start; k < last; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 ? Math.min(1, Math.max(0, -(ax * (bx - ax) + ay * (by - ay)) / len2)) : 0;
    fits.push({ k, t, d: Math.hypot(ax + t * (bx - ax), ay + t * (by - ay)) });
  }
  const best = fits.reduce((a, b) => (b.d < a.d ? b : a));
  if (best.d > OFF_ROUTE_M) {
    return { phase: 'off-route', segment: start, stopsToGo: last - start, remainingM: remainingFrom(start, 0) };
  }

  // A loop: an earlier part of the route passes about as close, so take that one rather than jump ahead
  const { k, t } = fits.find((f) => f.k < best.k - 1 && f.d <= best.d + TIE_M) ?? best;
  const into = t * segLen[k]; // metres past stops[k]
  const remainingM = remainingFrom(k, t);
  const nextStop = Math.min(last, segLen[k] - into <= AT_STOP_M ? k + 2 : k + 1);
  const stopsToGo = last - nextStop + 1;
  // "Get off now" only once the bus has left the stop before yours, so nobody gets off a stop early
  const leftStopBefore = k === last - 1 && into > Math.min(AT_STOP_M, segLen[k] / 2);
  const phase = stopsToGo > 1 ? 'riding' : leftStopBefore && remainingM <= GET_OFF_NOW_M ? 'get-off' : 'next-stop';
  return { phase, segment: k, stopsToGo, remainingM };
}
