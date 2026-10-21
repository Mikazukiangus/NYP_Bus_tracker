import type { BusRoute, BusStop, RouteDirection, NormalizedBusRoute } from './routes.ts';
import type { NetworkFile } from './network.ts';
import type { RouteShape } from './shapes.ts';
import { annotateStopCalls } from './stopCalls.ts';
import { record, stopCode, serviceNo, finite, timestamp, coordinate, direction, validArtifact } from './validation.ts';

export function parseRouteIndex(raw: unknown): string[] | null {
  if (!record(raw) || !validArtifact(raw) || !Array.isArray(raw.services) || !raw.services.length || !raw.services.every(serviceNo)) return null;
  return raw.services.map(service => service.toUpperCase());
}

export function parseNetwork(raw: unknown): NetworkFile | null {
  if (!record(raw) || !validArtifact(raw) || !timestamp(raw.generatedAt) || !Array.isArray(raw.stops) || !raw.stops.length || !Array.isArray(raw.patterns)) return null;
  const codes = new Set<string>();
  for (const s of raw.stops) {
    if (!Array.isArray(s) || s.length !== 5 || !stopCode(s[0]) || codes.has(s[0]) || typeof s[1] !== 'string' || !s[1].trim() || typeof s[2] !== 'string' || !coordinate(s[3], s[4])) return null;
    codes.add(s[0]);
  }
  const patterns = new Set<string>();
  for (const p of raw.patterns) {
    if (!Array.isArray(p) || p.length !== 4 || !serviceNo(p[0]) || !direction(p[1]) || !Array.isArray(p[2]) || !Array.isArray(p[3]) || p[2].length < 2 || p[2].length !== p[3].length) return null;
    const key = `${p[0].toUpperCase()}:${p[1]}`;
    if (patterns.has(key)) return null;
    patterns.add(key);
    if (p[2].some(i => !Number.isInteger(i) || i < 0 || i >= (raw.stops as unknown[]).length) || p[3].some(d => !Number.isInteger(d) || d < 0) || p[3][0] !== 0) return null;
  }
  return { schemaVersion: 1, generatedAt: raw.generatedAt, datasetVersion: typeof raw.datasetVersion === 'string' ? raw.datasetVersion : raw.generatedAt,
    stops: raw.stops as NetworkFile['stops'], patterns: raw.patterns.map(p => [p[0].toUpperCase(), p[1], p[2], p[3]]) as NetworkFile['patterns'] };
}
function validTimes(v: unknown): boolean {
  if (v === null) return true;
  // LTA uses 2400 for midnight on the service day.
  return Array.isArray(v) && v.length === 2 && v.every(t => typeof t === 'string' && /^(?:[01]\d|2[0-3])[0-5]\d$|^2400$/.test(t));
}
function parseDirection(raw: unknown): RouteDirection | null {
  if (!record(raw) || typeof raw.origin !== 'string' || typeof raw.destination !== 'string' || !Array.isArray(raw.stops) || !raw.stops.length || !validPath(raw.path) || (raw.pathSource !== undefined && raw.pathSource !== 'OPENSTREETMAP')) return null;
  const stops: BusStop[] = [];
  let previousSequence = 0;
  let previousDistance = 0;
  for (const s of raw.stops) {
    if (!record(s) || !stopCode(s.code) || typeof s.name !== 'string' || !s.name.trim() || typeof s.road !== 'string' || !coordinate(s.lat, s.lng)) return null;
    if (s.distanceM !== undefined && (!finite(s.distanceM) || s.distanceM < previousDistance)) return null;
    if (finite(s.distanceM)) previousDistance = s.distanceM;
    if (s.call !== undefined) {
      if (!record(s.call) || !Number.isInteger(s.call.sequence) || (s.call.sequence as number) <= previousSequence) return null;
      previousSequence = s.call.sequence as number;
    }
    if (s.firstLastBus !== undefined && (!record(s.firstLastBus) || !['weekday', 'saturday', 'sunday'].every(day => validTimes((s.firstLastBus as Record<string, unknown>)[day])))) return null;
    stops.push({ code: s.code, name: s.name, road: s.road, lat: s.lat as number, lng: s.lng as number,
      ...(s.call ? { call: s.call as unknown as NonNullable<BusStop['call']> } : {}),
      ...(s.firstLastBus ? { firstLastBus: s.firstLastBus as BusStop['firstLastBus'] } : {}),
      ...(s.distanceM !== undefined ? { distanceM: s.distanceM as number } : {}) });
  }
  return { origin: raw.origin, destination: raw.destination, stops, path: raw.path as [number, number][], ...(raw.pathSource ? { pathSource: 'OPENSTREETMAP' } : {}) };
}
export function parseRoute(raw: unknown, expectedService: string, expectedVersion?: string): NormalizedBusRoute | null {
  if (!record(raw) || !validArtifact(raw) || !serviceNo(raw.serviceNo) || raw.serviceNo.toUpperCase() !== expectedService.trim().toUpperCase() || !['SBST','SMRT','TTS','GAS'].includes(raw.operator as string) || !['Trunk','Feeder','Express','Other'].includes(raw.category as string)) return null;
  const version = typeof raw.datasetVersion === 'string' ? raw.datasetVersion : typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined;
  if (expectedVersion && version !== expectedVersion) return null;
  if (raw.source !== undefined && raw.source !== 'LTA_DATAMALL' && raw.source !== 'OFFLINE') return null;
  if (raw.rawCategory !== undefined && typeof raw.rawCategory !== 'string') return null;
  const direction1 = parseDirection(raw.direction1);
  const direction2 = raw.direction2 === undefined ? undefined : parseDirection(raw.direction2);
  if (!direction1 || direction2 === null) return null;
  return annotateStopCalls({ serviceNo: raw.serviceNo.toUpperCase(), operator: raw.operator as BusRoute['operator'], category: raw.category as BusRoute['category'],
    direction1, ...(direction2 ? { direction2 } : {}), schemaVersion: 1, ...(version ? { datasetVersion: version } : {}),
    ...(typeof raw.generatedAt === 'string' ? { generatedAt: raw.generatedAt } : {}),
    ...(typeof raw.rawCategory === 'string' ? { rawCategory: raw.rawCategory } : {}), ...(raw.source ? { source: raw.source as BusRoute['source'] } : {}) });
}
function validPath(v: unknown): boolean {
  return Array.isArray(v) && v.length >= 1 && v.every(p => Array.isArray(p) && p.length === 2 && coordinate(p[0], p[1]));
}
export function parseShapes(raw: unknown, expectedService: string): RouteShape[] | null {
  if (!record(raw) || !validArtifact(raw) || !Array.isArray(raw.shapes) || (raw.serviceNo !== undefined && raw.serviceNo !== expectedService.toUpperCase())) return null;
  if (raw.shapes.some(s => !record(s) || !finite(s.osmId) || !Number.isSafeInteger(s.osmId) || s.osmId <= 0 || (s.name !== undefined && typeof s.name !== 'string') || !validPath(s.path))) return null;
  return raw.shapes.map(s => ({ osmId: s.osmId, ...(s.name !== undefined ? { name: s.name } : {}), path: s.path }));
}
