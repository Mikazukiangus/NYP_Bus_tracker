import { BusRoute, BusStop } from '../types/bus';
import { calculateDistanceMeters } from '../data/singaporeBuses';

interface RouteShape {
  osmId: number;
  name?: string;
  path: [number, number][];
}

// Endpoints of an OSM route line must sit within this distance of the LTA origin/destination stops
const MAX_ENDPOINT_OFFSET_M = 1000;
// ...and nearly every LTA stop must be close to the line, otherwise the OSM route is outdated
const MAX_STOP_OFFSET_M = 100;
const MIN_STOP_COVERAGE = 0.9;

// Pre-built from OpenStreetMap by scripts/build-route-shapes.ts and served as static files
export async function fetchRouteShapes(serviceNo: string): Promise<RouteShape[]> {
  try {
    const res = await fetch(`/route-shapes/${encodeURIComponent(serviceNo.toUpperCase())}.json`, {
      signal: AbortSignal.timeout(10000),
    });
    // Unknown services fall through to the SPA's index.html, so check it's really JSON
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return [];
    const data = await res.json();
    return Array.isArray(data?.shapes) ? data.shapes : [];
  } catch {
    return [];
  }
}

// Approximate metres from a point to a line segment (equirectangular projection; fine at city scale)
function distanceToSegmentMeters(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = Math.cos((p[0] * Math.PI) / 180);
  const ax = a[1] * k, ay = a[0];
  const bx = b[1] * k, by = b[0];
  const px = p[1] * k, py = p[0];
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py) * 111320;
}

function stopCoverage(stops: BusStop[], path: [number, number][]): number {
  const near = stops.filter((stop) => {
    for (let i = 1; i < path.length; i++) {
      if (distanceToSegmentMeters([stop.lat, stop.lng], path[i - 1], path[i]) <= MAX_STOP_OFFSET_M) return true;
    }
    return false;
  });
  return near.length / stops.length;
}

function bestShapeFor(stops: BusStop[], shapes: RouteShape[]): [number, number][] | null {
  if (stops.length < 2) return null;
  const origin = stops[0];
  const destination = stops[stops.length - 1];

  const candidates = shapes
    .map((shape) => {
      const start = shape.path[0];
      const end = shape.path[shape.path.length - 1];
      const startOffset = calculateDistanceMeters(start[0], start[1], origin.lat, origin.lng);
      const endOffset = calculateDistanceMeters(end[0], end[1], destination.lat, destination.lng);
      return { shape, startOffset, endOffset };
    })
    .filter((c) => c.startOffset <= MAX_ENDPOINT_OFFSET_M && c.endOffset <= MAX_ENDPOINT_OFFSET_M)
    .sort((a, b) => a.startOffset + a.endOffset - (b.startOffset + b.endOffset));

  for (const { shape } of candidates) {
    if (stopCoverage(stops, shape.path) >= MIN_STOP_COVERAGE) return shape.path;
  }
  return null;
}

// Swap the straight stop-to-stop lines for road-following OSM geometry where it matches the LTA route
export function applyRouteShapes(route: BusRoute, shapes: RouteShape[]): BusRoute {
  if (shapes.length === 0) return route;
  const path1 = bestShapeFor(route.direction1.stops, shapes);
  const path2 = route.direction2 ? bestShapeFor(route.direction2.stops, shapes) : null;
  if (!path1 && !path2) return route;

  return {
    ...route,
    direction1: path1 ? { ...route.direction1, path: path1, pathSource: 'OPENSTREETMAP' } : route.direction1,
    ...(route.direction2
      ? {
          direction2: path2
            ? { ...route.direction2, path: path2, pathSource: 'OPENSTREETMAP' }
            : route.direction2,
        }
      : {}),
  };
}
