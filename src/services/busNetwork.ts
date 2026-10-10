import type { NetworkFile } from '../types/network';
import { calculateDistanceMeters } from '../data/singaporeBuses';

export interface NetStop {
  index: number;
  code: string;
  name: string;
  road: string;
  lat: number;
  lng: number;
}

// One direction of one service, in stop order
export interface NetPattern {
  index: number;
  serviceNo: string;
  direction: number;
  stops: number[]; // indexes into BusNetwork.stops
  distM: number[]; // cumulative road distance from the first stop, metres
}

export interface BusNetwork {
  generatedAt: string;
  stops: NetStop[];
  byCode: Map<string, NetStop>;
  patterns: NetPattern[];
  patternsAtStop: number[][]; // stop index -> pattern indexes calling there
  grid: Map<string, number[]>; // spatial grid cell -> stop indexes
}

export interface StopWithDistance {
  stop: NetStop;
  distanceM: number;
}

// ~550 m grid cells for nearby-stop lookups
const CELL_DEG = 0.005;
const cellKey = (x: number, y: number) => `${x}:${y}`;

export function buildBusNetwork(file: NetworkFile): BusNetwork {
  const stops = file.stops.map(([code, name, road, lat, lng], index): NetStop => ({ index, code, name, road, lat, lng }));
  const byCode = new Map(stops.map((s) => [s.code, s]));
  const patternsAtStop: number[][] = stops.map(() => []);
  const patterns = file.patterns.map(([serviceNo, direction, stopIdx, hopHm], index): NetPattern => {
    let total = 0;
    const distM = hopHm.map((hop) => (total += hop * 100));
    for (const s of new Set(stopIdx)) patternsAtStop[s]?.push(index);
    return { index, serviceNo, direction, stops: stopIdx, distM };
  });

  const grid = new Map<string, number[]>();
  for (const s of stops) {
    const key = cellKey(Math.floor(s.lng / CELL_DEG), Math.floor(s.lat / CELL_DEG));
    const cell = grid.get(key);
    if (cell) cell.push(s.index);
    else grid.set(key, [s.index]);
  }
  return { generatedAt: file.generatedAt, stops, byCode, patterns, patternsAtStop, grid };
}

let networkPromise: Promise<BusNetwork | null> | null = null;

// Built at deploy time; null when it isn't available (e.g. a local build without an LTA key)
export function loadBusNetwork(): Promise<BusNetwork | null> {
  networkPromise ??= fetch('/bus-routes/network.json', { signal: AbortSignal.timeout(20000) })
    .then(async (res) => {
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
      const file = (await res.json()) as NetworkFile;
      return Array.isArray(file?.stops) && Array.isArray(file?.patterns) && file.stops.length ? buildBusNetwork(file) : null;
    })
    .catch(() => null)
    .then((network) => {
      if (!network) networkPromise = null; // allow a retry later
      return network;
    });
  return networkPromise;
}

// Stops within radiusM of a point, nearest first
export function stopsWithin(net: BusNetwork, lat: number, lng: number, radiusM: number): StopWithDistance[] {
  const reach = Math.ceil(radiusM / 111_000 / CELL_DEG) + 1;
  const cx = Math.floor(lng / CELL_DEG);
  const cy = Math.floor(lat / CELL_DEG);
  const found: StopWithDistance[] = [];
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (const i of net.grid.get(cellKey(cx + dx, cy + dy)) ?? []) {
        const stop = net.stops[i];
        const distanceM = calculateDistanceMeters(lat, lng, stop.lat, stop.lng);
        if (distanceM <= radiusM) found.push({ stop, distanceM });
      }
    }
  }
  return found.sort((a, b) => a.distanceM - b.distanceM);
}

export interface StopService {
  serviceNo: string;
  direction: number;
  towards: string; // last stop of this direction
}

export interface NearbyStop {
  stop: NetStop;
  distanceM: number;
  services: StopService[]; // services that can be boarded here, in number order
}

const NEARBY_STOP_RADII_M = [500, 1000, 2000]; // widened only when there are fewer stops than asked for

// The bus stops nearest a point, each with every service that can be boarded there.
// Returns up to `max` stops (nearest first); stops where buses only terminate are skipped.
export function nearestStops(net: BusNetwork, lat: number, lng: number, max = 8): NearbyStop[] {
  let found: NearbyStop[] = [];
  for (const radiusM of NEARBY_STOP_RADII_M) {
    found = [];
    for (const { stop, distanceM } of stopsWithin(net, lat, lng, radiusM)) {
      const seen = new Set<string>();
      const services: StopService[] = [];
      for (const p of net.patternsAtStop[stop.index]) {
        const pattern = net.patterns[p];
        // Can't board at the last stop of a direction (buses terminate there; loop services start there too)
        if (pattern.stops.indexOf(stop.index) === pattern.stops.length - 1) continue;
        const key = pattern.serviceNo.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        services.push({
          serviceNo: pattern.serviceNo,
          direction: pattern.direction,
          towards: net.stops[pattern.stops[pattern.stops.length - 1]].name,
        });
      }
      if (!services.length) continue;
      services.sort((a, b) => a.serviceNo.localeCompare(b.serviceNo, 'en', { numeric: true }));
      found.push({ stop, distanceM, services });
      if (found.length >= max) return found;
    }
    if (found.length >= Math.min(3, max)) return found;
  }
  return found;
}

// Bus stops matching a 5-digit code (prefix) or a name/road search
export function searchStops(net: BusNetwork, query: string, limit = 4): NetStop[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  if (/^\d{2,5}$/.test(q)) {
    return net.stops.filter((s) => s.code.startsWith(q)).slice(0, limit);
  }
  if (q.length < 3) return [];
  const starts: NetStop[] = [];
  const contains: NetStop[] = [];
  for (const s of net.stops) {
    const name = s.name.toLowerCase();
    if (name.startsWith(q)) starts.push(s);
    else if (name.includes(q) || `${name} ${s.road.toLowerCase()}`.includes(q)) contains.push(s);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
