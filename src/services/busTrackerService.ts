import { BusArrivalInfo, BusLoad, BusRoute, BusStop, BusType, LiveBus } from '../types/bus';
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

// Fetch the real stop sequence for a service from /api/bus-route (LTA DataMall BusRoutes + BusStops)
export async function fetchBusRoute(serviceNo: string): Promise<BusRouteLookup> {
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

// Generate live moving buses along the route coordinates
export function initLiveBuses(route: BusRoute, direction: number): LiveBus[] {
  const routeDir = direction === 2 && route.direction2 ? route.direction2 : route.direction1;
  const path = routeDir.path;
  const stops = routeDir.stops;

  if (path.length === 0) return [];

  const busCount = Math.max(3, Math.min(5, Math.floor(stops.length / 3)));
  const buses: LiveBus[] = [];

  for (let i = 0; i < busCount; i++) {
    // Distribute buses along the path
    const fraction = (i / busCount) + 0.1;
    const pathIdx = Math.floor(fraction * (path.length - 1)) % path.length;
    const currentCoord = path[pathIdx];
    const nextIdx = Math.min(pathIdx + 1, path.length - 1);
    const nextCoord = path[nextIdx];

    // Compute heading in degrees
    const dy = nextCoord[0] - currentCoord[0];
    const dx = nextCoord[1] - currentCoord[1];
    let heading = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
    if (heading < 0) heading += 360;

    const stopIdx = Math.min(Math.floor(fraction * stops.length), stops.length - 1);
    const nextStop = stops[Math.min(stopIdx + 1, stops.length - 1)];

    const loads: BusLoad[] = ['SEA', 'SDA', 'SEA', 'LSD', 'SEA'];
    const types: BusType[] = ['DD', 'DD', 'SD', 'DD', 'SD'];

    buses.push({
      id: `bus-${route.serviceNo}-${direction}-${i}`,
      serviceNo: route.serviceNo,
      operator: route.operator,
      lat: currentCoord[0],
      lng: currentCoord[1],
      heading,
      speedKmH: 30 + ((i * 7) % 18),
      load: loads[i % loads.length],
      type: types[i % types.length],
      busReg: generateBusReg(route.serviceNo, i + 1),
      direction,
      currentStopIndex: stopIdx,
      nextStopName: nextStop.name,
      nextStopCode: nextStop.code,
      etaMinutesToNextStop: Math.max(1, (i * 3 + 2) % 6)
    });
  }

  return buses;
}

// Micro-step update live buses to simulate real movement along path
export function stepLiveBuses(
  buses: LiveBus[],
  route: BusRoute,
  direction: number
): LiveBus[] {
  const routeDir = direction === 2 && route.direction2 ? route.direction2 : route.direction1;
  const path = routeDir.path;
  const stops = routeDir.stops;

  if (path.length < 2) return buses;

  return buses.map(bus => {
    // Find closest waypoint index
    let bestIdx = 0;
    let minD = Infinity;
    for (let j = 0; j < path.length; j++) {
      const d = Math.hypot(path[j][0] - bus.lat, path[j][1] - bus.lng);
      if (d < minD) {
        minD = d;
        bestIdx = j;
      }
    }

    // Move forward towards next index or loop
    const targetIdx = (bestIdx + 1) % path.length;
    const target = path[targetIdx];
    const current = [bus.lat, bus.lng];

    // Step size (sub-coordinate step)
    const stepRatio = 0.08;
    const newLat = current[0] + (target[0] - current[0]) * stepRatio;
    const newLng = current[1] + (target[1] - current[1]) * stepRatio;

    // Heading calculation
    const dy = target[0] - newLat;
    const dx = target[1] - newLng;
    let heading = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
    if (heading < 0) heading += 360;

    // Fluctuate speed realistically (20 - 48 km/h)
    const speedVariation = (Math.random() - 0.5) * 4;
    const newSpeed = Math.round(Math.max(18, Math.min(52, bus.speedKmH + speedVariation)));

    const stopIdx = Math.min(Math.floor((bestIdx / path.length) * stops.length), stops.length - 1);
    const nextStop = stops[Math.min(stopIdx + 1, stops.length - 1)];

    return {
      ...bus,
      lat: Number(newLat.toFixed(6)),
      lng: Number(newLng.toFixed(6)),
      heading,
      speedKmH: newSpeed,
      nextStopName: nextStop.name,
      nextStopCode: nextStop.code
    };
  });
}
