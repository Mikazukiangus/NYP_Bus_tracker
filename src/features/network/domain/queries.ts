import { calculateDistanceMeters } from '../../../../shared/geo/distance';
import { CELL_DEG, cellKey } from './buildNetwork';
import type { BusNetwork, NetStop, StopWithDistance, NearbyStop, StopService, TransferNeighbour } from '../model';
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

const NEARBY_STOP_RADII_M = [500, 1000, 2000]; // widened only when there are fewer stops than asked for

// Only immutable loaded networks own these lazy indexes. A rebuilt network starts with empty caches.
export function transferNeighbours(net: BusNetwork, stopIndex: number, radiusM: number): readonly TransferNeighbour[] {
  if (!Number.isInteger(stopIndex) || !net.stops[stopIndex] || !Number.isFinite(radiusM) || radiusM < 0) {
    throw new RangeError('Invalid transfer lookup');
  }
  let byStop = net.transferNeighboursByRadius.get(radiusM);
  if (!byStop) {
    byStop = new Map();
    net.transferNeighboursByRadius.set(radiusM, byStop);
  }
  let neighbours = byStop.get(stopIndex);
  if (!neighbours) {
    const stop = net.stops[stopIndex];
    neighbours = stopsWithin(net, stop.lat, stop.lng, radiusM).map(({ stop: nearby, distanceM }) => ({ index: nearby.index, distanceM }));
    byStop.set(stopIndex, neighbours);
  }
  return neighbours;
}

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
  if (/^\d{5}$/.test(q)) {
    const stop = net.byCode.get(q);
    return stop ? [stop].slice(0, limit) : [];
  }
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
