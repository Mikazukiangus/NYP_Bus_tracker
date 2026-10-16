// Citymapper's "Leave within N min": how long you have before setting off to catch a bus, from the walk to the stop
// and the next buses due there. The arrivals card, the next-bus bar and the trip planner all work it out here, with
// the same walking model and rules, so they always give the same time for the same bus.

export const WALK_M_PER_MIN = 80; // ~4.8 km/h
export const WALK_DETOUR = 1.3; // typical walking route vs straight line
export const AT_STOP_M = 50; // this close (in a straight line), you're at the stop

// Minutes on foot for a straight-line distance, unrounded (for adding up trip times)
export const walkMinutesFor = (straightM: number) => (straightM * WALK_DETOUR) / WALK_M_PER_MIN;

// The walk in whole minutes, as shown: 0 at the stop, otherwise at least a minute
export const walkMinutes = (straightM: number) =>
  straightM <= AT_STOP_M ? 0 : Math.max(1, Math.round(walkMinutesFor(straightM)));

// The first bus you can still reach after a walk of walkMin whole minutes. A minute's slack: buses often dwell, and
// people walk faster when the bus is in sight. Null when every bus due leaves too soon.
export function firstCatchable<B extends { estimatedMinutes: number }>(walkMin: number, buses: B[]): B | null {
  return [...buses].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes).find((b) => b.estimatedMinutes >= walkMin - 1) ?? null;
}

export type LeaveWithin =
  | { status: 'at-stop' }
  | { status: 'leave'; inMin: number; walkMin: number; busMin: number; monitored: boolean } // inMin 0: leave now
  | { status: 'too-soon'; walkMin: number }; // every bus due leaves before you'd get there

export function leaveWithin(
  walkM: number, // straight line to the stop
  buses: ({ estimatedMinutes: number; monitored?: boolean } | null)[]
): LeaveWithin | null {
  const due = buses.filter((b) => b !== null);
  if (!due.length) return null;
  const walkMin = walkMinutes(walkM);
  if (walkMin === 0) return { status: 'at-stop' };
  const bus = firstCatchable(walkMin, due);
  if (!bus) return { status: 'too-soon', walkMin };
  return {
    status: 'leave',
    inMin: Math.max(0, bus.estimatedMinutes - walkMin),
    walkMin,
    busMin: Math.max(0, bus.estimatedMinutes),
    monitored: !!bus.monitored,
  };
}

// The words for it, the same everywhere: "Leave now" with a minute or less to spare
export const leaveLabel = (leave: LeaveWithin | null | undefined) =>
  leave?.status !== 'leave' ? null : leave.inMin <= 1 ? 'Leave now' : `Leave within ${leave.inMin} min`;
