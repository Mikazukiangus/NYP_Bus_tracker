// Citymapper's "Leave within N min": how long you have before setting off to catch a bus, from the walk to the stop
// and the next buses due there.

// Walking pace, and how close counts as being at the stop already
export const WALK_M_PER_MIN = 80;
export const AT_STOP_M = 50;

export type LeaveWithin =
  | { status: 'at-stop' }
  | { status: 'leave'; inMin: number; walkMin: number; busMin: number; monitored: boolean } // inMin 0: leave now
  | { status: 'too-soon'; walkMin: number }; // every bus due leaves before you'd get there

// Within 50 m you're at the stop; otherwise at least a minute's walk
export const walkMinutes = (metres: number) => (metres <= AT_STOP_M ? 0 : Math.max(1, Math.round(metres / WALK_M_PER_MIN)));

export function leaveWithin(
  walkM: number,
  buses: ({ estimatedMinutes: number; monitored?: boolean } | null)[]
): LeaveWithin | null {
  const due = buses.filter((b) => b !== null).sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
  if (!due.length) return null;
  const walkMin = walkMinutes(walkM);
  if (walkMin === 0) return { status: 'at-stop' };
  // A minute's slack, as in the trip planner: buses often dwell, and people walk faster when the bus is in sight
  const bus = due.find((b) => b.estimatedMinutes >= walkMin - 1);
  if (!bus) return { status: 'too-soon', walkMin };
  return {
    status: 'leave',
    inMin: Math.max(0, bus.estimatedMinutes - walkMin),
    walkMin,
    busMin: Math.max(0, bus.estimatedMinutes),
    monitored: !!bus.monitored,
  };
}
