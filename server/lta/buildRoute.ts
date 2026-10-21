import type { BusRoute, BusOperator, BusStop, RouteDirection, FirstLastTimes } from '../../shared/transit/routes.ts';
import { annotateStopCalls } from '../../shared/transit/stopCalls.ts';
import type { Datasets, LTABusStop, LTABusRouteRow } from './types.ts';

function parseOperator(value: string): BusOperator {
  if (value === 'SBST' || value === 'SMRT' || value === 'TTS' || value === 'GAS') return value;
  throw new Error('Unsupported LTA bus operator');
}

function mapCategory(category?: string): BusRoute['category'] {
  const c = (category || '').toUpperCase();
  if (c.includes('FEEDER')) return 'Feeder';
  if (c.includes('EXPRESS')) return 'Express';
  return c.includes('TRUNK') ? 'Trunk' : 'Other';
}

const TIME_RE = /^\d{4}$/;
const firstLast = (first?: string, last?: string): FirstLastTimes =>
  first && last && TIME_RE.test(first) && TIME_RE.test(last) ? [first, last] : null;

function buildDirection(rows: LTABusRouteRow[], stops: Map<string, LTABusStop>): RouteDirection | undefined {
  const ordered = [...rows].sort((a, b) => a.StopSequence - b.StopSequence);
  const routeStops: BusStop[] = [];
  for (const row of ordered) {
    const stop = stops.get(row.BusStopCode);
    if (!stop) continue;
    const times = {
      weekday: firstLast(row.WD_FirstBus, row.WD_LastBus),
      saturday: firstLast(row.SAT_FirstBus, row.SAT_LastBus),
      sunday: firstLast(row.SUN_FirstBus, row.SUN_LastBus),
    };
    routeStops.push({
      call: { patternId: `${row.ServiceNo.toUpperCase()}:${row.Direction}`, sequence: row.StopSequence, occurrence: 1, stopCode: stop.BusStopCode },
      ...(typeof row.Distance === 'number' && Number.isFinite(row.Distance) ? { distanceM: row.Distance * 1000 } : {}),
      code: stop.BusStopCode,
      name: stop.Description,
      road: stop.RoadName,
      lat: stop.Latitude,
      lng: stop.Longitude,
      ...(times.weekday || times.saturday || times.sunday ? { firstLastBus: times } : {}),
    });
  }
  if (routeStops.length === 0) return undefined;
  return {
    origin: routeStops[0].name,
    destination: routeStops[routeStops.length - 1].name,
    stops: routeStops,
    path: routeStops.map((s) => [s.lat, s.lng]),
  };
}

export function buildRoute(serviceNo: string, data: Datasets): BusRoute | null {
  const key = serviceNo.toUpperCase();
  const rows = data.routes.get(key);
  if (!rows || rows.length === 0) return null;

  const direction1 = buildDirection(rows.filter((r) => r.Direction === 1), data.stops);
  const direction2 = buildDirection(rows.filter((r) => r.Direction === 2), data.stops);
  if (!direction1) return null;

  const service = data.services.get(key);
  return annotateStopCalls({
    schemaVersion: 1,
    datasetVersion: new Date(data.loadedAt).toISOString(),
    generatedAt: new Date(data.loadedAt).toISOString(),
    serviceNo: rows[0].ServiceNo,
    operator: parseOperator(rows[0].Operator),
    category: mapCategory(service?.Category),
    ...(service?.Category ? { rawCategory: service.Category } : {}),
    direction1,
    ...(direction2 ? { direction2 } : {}),
    source: 'LTA_DATAMALL',
  });
}
