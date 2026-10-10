import { BusArrivalInfo, BusLoad, BusRoute, BusStop, BusType, StopServiceArrivals, TrafficIncident } from '../types/bus';
import { calculateDistanceMeters } from '../data/singaporeBuses';
import { loadBusNetwork } from './busNetwork';

export interface NearestStopResult {
  nearestStop: BusStop;
  distanceMeters: number;
  allStopsWithDistance: (BusStop & { distanceMeters: number })[];
}

export function findNearestBusStop(
  route: BusRoute,
  direction: number,
  userLat: number,
  userLng: number
): NearestStopResult {
  const routeDir = direction === 2 && route.direction2 ? route.direction2 : route.direction1;
  const stops = routeDir.stops;

  const stopsWithDistance = stops.map(stop => {
    const dist = calculateDistanceMeters(userLat, userLng, stop.lat, stop.lng);
    return {
      ...stop,
      distanceMeters: dist
    };
  });

  // Sort by distance to find nearest
  const sorted = [...stopsWithDistance].sort((a, b) => a.distanceMeters - b.distanceMeters);
  const nearest = sorted[0] || stopsWithDistance[0];

  return {
    nearestStop: nearest,
    distanceMeters: nearest.distanceMeters,
    allStopsWithDistance: stopsWithDistance
  };
}

// Offline placeholder arrival times, used only when the LTA feed can't be reached (shown as "Simulated")
export function generateArrivalTimings(
  serviceNo: string,
  stopCode: string,
  baseOffsetSeconds: number = 0
): {
  nextBus: BusArrivalInfo;
  nextBus2: BusArrivalInfo;
  nextBus3: BusArrivalInfo;
} {
  const seed = (parseInt(serviceNo.replace(/\D/g, '') || '14', 10) * 31 + parseInt(stopCode.slice(-3) || '12', 10)) % 100;
  
  // Predictable but dynamic arrival times based on current clock minute
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();

  const cycle = (currentMinute * 60 + currentSecond + seed * 13 + baseOffsetSeconds) % 1800; // 30 min loop

  // Next bus (0 - 6 min)
  const min1 = Math.floor((cycle % 420) / 60);
  // Bus 2 (min1 + 5 - 11 min)
  const min2 = min1 + 5 + (seed % 4);
  // Bus 3 (min2 + 7 - 14 min)
  const min3 = min2 + 8 + ((seed * 2) % 5);

  const loads: BusLoad[] = ['SEA', 'SEA', 'SDA', 'SEA', 'LSD', 'SDA'];
  const types: BusType[] = ['DD', 'DD', 'SD', 'DD', 'SD', 'DD'];

  const nextBus: BusArrivalInfo = {
    estimatedMinutes: min1,
    load: loads[seed % loads.length],
    type: types[seed % types.length],
    feature: 'WAB',
  };

  const nextBus2: BusArrivalInfo = {
    estimatedMinutes: min2,
    load: loads[(seed + 1) % loads.length],
    type: types[(seed + 2) % types.length],
    feature: 'WAB',
  };

  const nextBus3: BusArrivalInfo = {
    estimatedMinutes: min3,
    load: loads[(seed + 3) % loads.length],
    type: types[(seed + 4) % types.length],
    feature: 'WAB',
  };

  return { nextBus, nextBus2, nextBus3 };
}

// Parse LTA ISO EstimatedArrival string to countdown minutes
function parseLTAEstimatedMinutes(isoString?: string): number {
  if (!isoString) return 99;
  const etaTime = new Date(isoString).getTime();
  if (isNaN(etaTime)) return 99;
  const diffMs = etaTime - Date.now();
  const mins = Math.round(diffMs / 60000);
  return mins <= 0 ? 0 : mins;
}

function parseBus(raw?: any): BusArrivalInfo | null {
  if (!raw || !raw.EstimatedArrival || !Number.isFinite(Date.parse(raw.EstimatedArrival))) return null;
  const lat = raw.Latitude ? parseFloat(raw.Latitude) : undefined;
  const lng = raw.Longitude ? parseFloat(raw.Longitude) : undefined;
  return {
    estimatedMinutes: parseLTAEstimatedMinutes(raw.EstimatedArrival),
    load: (raw.Load as BusLoad) || 'SEA',
    type: (raw.Type as BusType) || 'SD',
    feature: raw.Feature === 'WAB' ? 'WAB' : '',
    lat,
    lng,
    monitored: raw.Monitored === 1,
  };
}

// Fetch live arrivals for every service at a stop (one LTA BusArrival call, cached 15 s at the CDN).
// Returns null when the live feed is unavailable, including the server's no-key simulation.
export async function fetchStopArrivals(stopCode: string): Promise<StopServiceArrivals[] | null> {
  try {
    const res = await fetch(`/api/bus-arrival?BusStopCode=${encodeURIComponent(stopCode)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.source !== 'LTA_DATAMALL_V3' || data.BusStopCode !== stopCode || !Array.isArray(data.Services)) return null;
    return data.Services.map((svc: any) => ({
      serviceNo: String(svc.ServiceNo),
      operator: svc.Operator,
      destinationCode: svc.NextBus?.DestinationCode || undefined,
      nextBus: parseBus(svc.NextBus),
      nextBus2: parseBus(svc.NextBus2),
      nextBus3: parseBus(svc.NextBus3),
    }));
  } catch {
    return null;
  }
}

export type BusRouteLookup =
  | { status: 'ok'; route: BusRoute }
  | { status: 'not_found' }
  | { status: 'unavailable' };

// Fetch a static JSON file built at deploy time; null if it isn't there (the SPA rewrite serves index.html)
async function fetchStaticJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

let staticRouteIndex: Promise<{ services: string[] } | null> | null = null;

// Fetch the real stop sequence for a service (LTA DataMall BusRoutes + BusStops):
// first from the static copy generated at build time (scripts/build-bus-routes.ts), else from /api/bus-route
export async function fetchBusRoute(serviceNo: string): Promise<BusRouteLookup> {
  const fileName = encodeURIComponent(serviceNo.trim().toUpperCase());
  const staticRoute = await fetchStaticJson<BusRoute>(`/bus-routes/${fileName}.json`);
  if (staticRoute?.direction1?.stops?.length) return { status: 'ok', route: staticRoute };

  // If the build produced an index and the service isn't in it, it isn't an LTA service: answer instantly
  staticRouteIndex ??= fetchStaticJson<{ services: string[] }>('/bus-routes/index.json');
  const index = await staticRouteIndex;
  if (index?.services?.length && !index.services.includes(serviceNo.trim().toUpperCase())) {
    return { status: 'not_found' };
  }

  try {
    const controller = new AbortController();
    // A cold serverless instance has to page through all LTA route data, so allow extra time
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`/api/bus-route?ServiceNo=${encodeURIComponent(serviceNo)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'unavailable' };

    const data = await res.json();
    if (!data?.direction1?.stops?.length) return { status: 'unavailable' };
    return { status: 'ok', route: data as BusRoute };
  } catch {
    return { status: 'unavailable' };
  }
}

// Pick the direction whose nearest stop is closest to the user
export function pickNearestDirection(route: BusRoute, userLat: number, userLng: number): number {
  if (!route.direction2) return 1;
  const d1 = findNearestBusStop(route, 1, userLat, userLng).distanceMeters;
  const d2 = findNearestBusStop(route, 2, userLat, userLng).distanceMeters;
  return d2 < d1 ? 2 : 1;
}

// Pick the direction that serves a stop (preferring one where it isn't the terminus), e.g. for favourites
export function pickDirectionForStop(route: BusRoute, stopCode: string): number | undefined {
  const dirs = [route.direction1, route.direction2].map((d, i) => ({ d, dir: i + 1 }));
  const candidates = dirs.filter(({ d }) => d?.stops.some((s) => s.code === stopCode));
  const notTerminus = candidates.find(({ d }) => d!.stops[d!.stops.length - 1].code !== stopCode);
  return (notTerminus ?? candidates[0])?.dir;
}

let stopNamesPromise: Promise<Record<string, string>> | null = null;

// Stop code -> name for every LTA stop, from the bus network built at deploy time (empty if it isn't there)
export function fetchStopNames(): Promise<Record<string, string>> {
  stopNamesPromise ??= loadBusNetwork().then((network) => {
    if (!network) stopNamesPromise = null; // try again next time
    return network ? Object.fromEntries(network.stops.map((s) => [s.code, s.name])) : {};
  });
  return stopNamesPromise;
}

// Live LTA traffic incidents across Singapore; null if unavailable
export async function fetchTrafficIncidents(): Promise<TrafficIncident[] | null> {
  try {
    const res = await fetch('/api/traffic-incidents', { signal: AbortSignal.timeout(10000) });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    const data = await res.json();
    return Array.isArray(data?.incidents) ? data.incidents : null;
  } catch {
    return null;
  }
}
