import type { BusRoute, BusStop, StopCallRef, NormalizedBusRoute } from './routes.ts';

export function annotateStopCalls(route: BusRoute): NormalizedBusRoute {
  const annotate = (dir: BusRoute['direction1'], direction: 1 | 2) => {
    const seen = new Map<string, number>();
    return { ...dir, stops: dir.stops.map((stop, position) => {
      const occurrence = (seen.get(stop.code) ?? 0) + 1;
      seen.set(stop.code, occurrence);
      return { ...stop, call: { patternId: `${route.serviceNo.toUpperCase()}:${direction}`, stopCode: stop.code,
        sequence: stop.call?.sequence ?? position + 1, occurrence,
        ...(route.datasetVersion ? { datasetVersion: route.datasetVersion } : {}) } };
    }) };
  };
  return { ...route, direction1: annotate(route.direction1, 1), direction2: route.direction2 ? annotate(route.direction2, 2) : undefined };
}

// Resolve across rebuilds by physical stop + occurrence, never by a previous array index.
export function callIndex(stops: BusStop[], stop: { code: string; call?: StopCallRef }): number {
  if (!stop.call) return stops.findIndex(s => s.code === stop.code);
  const ref = stop.call;
  let occurrence = 0;
  return stops.findIndex(s => {
    if (s.code !== stop.code) return false;
    occurrence++;
    return s.call
      ? s.call.patternId === ref.patternId && s.call.occurrence === ref.occurrence
      : occurrence === ref.occurrence;
  });
}
export function sameStopCall(a: BusStop, b: BusStop): boolean {
  return a.code === b.code && (a.call && b.call
    ? a.call.patternId === b.call.patternId && a.call.occurrence === b.call.occurrence : true);
}
