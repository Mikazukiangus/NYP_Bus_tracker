import type { BusRoute, BusStop } from '../../types/bus';
import { calculateDistanceMeters } from '../../../shared/geo/distance';

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
