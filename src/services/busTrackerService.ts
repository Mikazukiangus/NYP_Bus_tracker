import { BusArrivalInfo, BusLoad, BusRoute, BusStop, BusType } from '../types/bus';
import { calculateDistanceMeters } from '../data/singaporeBuses';

// Generate consistent bus registration numbers matching Singapore standard
function generateBusReg(serviceNo: string, index: number): string {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'P', 'R', 'S', 'T', 'U', 'Y', 'Z'];
  const num = 3000 + (parseInt(serviceNo.replace(/\D/g, '') || '10', 10) * 17 + index * 123) % 6900;
  const checksum = letters[(num + index) % letters.length];
  return `SBS ${num}${checksum}`;
}

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

// Generate realistic Singapore LTA/SBS Transit arrival times
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
    busReg: generateBusReg(serviceNo, 1),
    speedKmH: 28 + (seed % 18)
  };

  const nextBus2: BusArrivalInfo = {
    estimatedMinutes: min2,
    load: loads[(seed + 1) % loads.length],
    type: types[(seed + 2) % types.length],
    feature: 'WAB',
    busReg: generateBusReg(serviceNo, 2),
    speedKmH: 32 + ((seed + 2) % 15)
  };

  const nextBus3: BusArrivalInfo = {
    estimatedMinutes: min3,
    load: loads[(seed + 3) % loads.length],
    type: types[(seed + 4) % types.length],
    feature: 'WAB',
    busReg: generateBusReg(serviceNo, 3),
    speedKmH: 35 + ((seed + 1) % 12)
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

// Fetch bus arrivals from our /api/bus-arrival endpoint (which queries LTA DataMall v3)
export async function fetchLTABusArrivals(
  serviceNo: string,
  stopCode: string,
  baseOffsetSeconds: number = 0
): Promise<{
  nextBus: BusArrivalInfo | null;
  nextBus2: BusArrivalInfo | null;
  nextBus3: BusArrivalInfo | null;
  source: 'LTA_DATAMALL_V3' | 'FALLBACK_SIMULATED';
}> {
  try {
    const url = `/api/bus-arrival?BusStopCode=${encodeURIComponent(stopCode)}&ServiceNo=${encodeURIComponent(serviceNo)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const service = data?.Services?.find(
        (s: { ServiceNo: string }) => s.ServiceNo.toUpperCase() === serviceNo.toUpperCase()
      ) || data?.Services?.[0];

      if (service) {
        const parseBus = (busRaw?: any, index: number = 1): BusArrivalInfo | null => {
          if (!busRaw || !busRaw.EstimatedArrival) return null;
          return {
            estimatedMinutes: parseLTAEstimatedMinutes(busRaw.EstimatedArrival),
            load: (busRaw.Load as BusLoad) || 'SEA',
            type: (busRaw.Type as BusType) || 'SD',
            feature: busRaw.Feature === 'WAB' ? 'WAB' : '',
            busReg: generateBusReg(serviceNo, index),
            lat: busRaw.Latitude ? parseFloat(busRaw.Latitude) : undefined,
            lng: busRaw.Longitude ? parseFloat(busRaw.Longitude) : undefined,
            speedKmH: 30 + (index * 4),
            monitored: busRaw.Monitored === 1,
          };
        };

        return {
          nextBus: parseBus(service.NextBus, 1),
          nextBus2: parseBus(service.NextBus2, 2),
          nextBus3: parseBus(service.NextBus3, 3),
          source: data.source || 'LTA_DATAMALL_V3',
        };
      }
    }
  } catch (err) {
    // Graceful fallback to client generator
  }

  const generated = generateArrivalTimings(serviceNo, stopCode, baseOffsetSeconds);
  return {
    ...generated,
    source: 'FALLBACK_SIMULATED',
  };
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
