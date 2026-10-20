import { BusRoute, BusStop, RouteDirection } from '../types/bus';
import { calculateDistanceMeters } from '../../shared/geo/distance.ts';

import type { RouteShape } from '../../shared/transit/shapes';

// Endpoints of an OSM route line must sit within this distance of the LTA origin/destination stops
const MAX_ENDPOINT_OFFSET_M = 1000;
// ...and nearly every LTA stop must be close to the line, otherwise the OSM route is outdated
const MAX_STOP_OFFSET_M = 100;
const MIN_STOP_COVERAGE = 0.9;

// Approximate metres from a point to a line segment (equirectangular projection; fine at city scale)
function distanceToSegmentMeters(p: [number, number], a: [number, number], b: [number, number]): number {
  return projectOnSegment(p, a, b).offsetM;
}

// Shortest distance in metres from a point to a polyline
export function distanceToPathMeters(p: [number, number], path: [number, number][]): number {
  if (path.length === 1) return calculateDistanceMeters(p[0], p[1], path[0][0], path[0][1]);
  let min = Infinity;
  for (let i = 1; i < path.length; i++) {
    min = Math.min(min, distanceToSegmentMeters(p, path[i - 1], path[i]));
  }
  return min;
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

// A point on a line: the segment it falls on and how far along it (0–1), so points compare in riding order
interface PathPosition {
  seg: number;
  t: number;
  point: [number, number];
  offsetM: number; // from the stop to this point
}

// Stops this far from a pass of the line count as served on that pass
const PASS_RADIUS_M = MAX_STOP_OFFSET_M;
// Farther passes considered for a stop (beyond PASS_RADIUS_M)
const FALLBACK_CANDIDATES = 3;
// Cost (as metres of offset) of leaving a stop unplaced; above it a stop is skipped rather than forced onto the line
const SKIP_COST_M = 300;
// How many stops back an in-order match may come from (skipping the ones between)
const MAX_SKIPPED_STOPS = 8;

const along = (p: PathPosition) => p.seg + p.t;

// Closest point of a segment to p (equirectangular projection; fine at city scale)
function projectOnSegment(p: [number, number], a: [number, number], b: [number, number]) {
  const k = Math.cos((p[0] * Math.PI) / 180);
  const ax = a[1] * k, ay = a[0];
  const dx = b[1] * k - ax, dy = b[0] - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq ? Math.max(0, Math.min(1, ((p[1] * k - ax) * dx + (p[0] - ay) * dy) / lenSq)) : 0;
  const point: [number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return { t, point, offsetM: Math.hypot(ax + t * dx - p[1] * k, ay + t * dy - p[0]) * 111320 };
}

// Where a stop could sit on the line: the closest point of each pass that goes near it, plus the few closest
// points of passes that come within skipping distance (e.g. a line ending a little short of the interchange).
// A loop route that uses the same road twice gives two candidates.
function candidatePositions(stop: BusStop, path: [number, number][]): PathPosition[] {
  const p: [number, number] = [stop.lat, stop.lng];
  const onSegs = path.slice(1).map((b, i) => ({ seg: i, ...projectOnSegment(p, path[i], b) }));

  const passes: PathPosition[] = [];
  let pass: PathPosition | null = null;
  for (const s of onSegs) {
    if (s.offsetM <= PASS_RADIUS_M) {
      if (!pass || s.offsetM < pass.offsetM) pass = s;
    } else if (pass) {
      passes.push(pass);
      pass = null;
    }
  }
  if (pass) passes.push(pass);

  // Farther passes: where the line turns back towards the stop without coming near
  const dips = onSegs.filter(
    (s, i) =>
      s.offsetM > PASS_RADIUS_M &&
      s.offsetM <= SKIP_COST_M &&
      s.offsetM <= (onSegs[i - 1]?.offsetM ?? Infinity) &&
      s.offsetM <= (onSegs[i + 1]?.offsetM ?? Infinity)
  );
  return [...passes, ...dips.sort((a, b) => a.offsetM - b.offsetM).slice(0, FALLBACK_CANDIDATES)];
}

// Places every stop on the line in riding order, as close to it as possible overall (one pass per stop).
// Matching each stop to its nearest point on its own goes wrong on loop routes, where the way out and the way
// back share roads: a stop can be a few metres nearer the return pass, and every later stop is then pushed past
// it. A stop that can't be placed in order (or only far from the line) is left out as null.
export function matchStopsToPath(stops: BusStop[], path: [number, number][]): (PathPosition | null)[] {
  const n = stops.length;
  if (n === 0 || path.length < 2) return stops.map(() => null);
  const cands = stops.map((stop) => candidatePositions(stop, path));
  // best[k][c]: lowest total cost with stop k placed at its candidate c (and earlier stops placed or skipped)
  const best: { cost: number; prev: [number, number] | null }[][] = cands.map((cs) => cs.map(() => ({ cost: Infinity, prev: null })));

  for (let k = 0; k < n; k++) {
    cands[k].forEach((c, ci) => {
      let cost = SKIP_COST_M * k; // every earlier stop skipped
      let prev: [number, number] | null = null;
      for (let j = k - 1; j >= Math.max(0, k - 1 - MAX_SKIPPED_STOPS); j--) {
        const skipped = SKIP_COST_M * (k - j - 1);
        cands[j].forEach((cj, cji) => {
          const total = best[j][cji].cost + skipped;
          if (along(cj) <= along(c) && total < cost) {
            cost = total;
            prev = [j, cji];
          }
        });
      }
      best[k][ci] = { cost: cost + c.offsetM, prev };
    });
  }

  let end: [number, number] | null = null;
  let endCost = SKIP_COST_M * n; // nothing placed
  for (let k = 0; k < n; k++) {
    best[k].forEach((b, ci) => {
      const total = b.cost + SKIP_COST_M * (n - 1 - k);
      if (total < endCost) {
        endCost = total;
        end = [k, ci];
      }
    });
  }

  const matched: (PathPosition | null)[] = stops.map(() => null);
  for (let at: [number, number] | null = end; at; at = best[at[0]][at[1]].prev) {
    const c = cands[at[0]][at[1]];
    if (c.offsetM <= SKIP_COST_M) matched[at[0]] = c;
  }
  return matched;
}

// The part of a direction's line ridden between two of its stops, following the roads when the line does.
// Stops are placed on the line in riding order, so loop services are cut at the right pass.
export function legPath(
  dir: RouteDirection,
  boardCode: string,
  alightCode: string
): { path: [number, number][]; followsRoads: boolean } | null {
  const stops = dir.stops;
  const from = stops.findIndex((s) => s.code === boardCode);
  const to = from < 0 ? -1 : stops.findIndex((s, k) => k > from && s.code === alightCode);
  if (to < 0) return null;
  const straight = stops.slice(from, to + 1).map((s): [number, number] => [s.lat, s.lng]);
  if (dir.pathSource !== 'OPENSTREETMAP' || dir.path.length < 2) return { path: straight, followsRoads: false };

  // A board or alight stop that couldn't be placed starts or ends the line at the nearest placed stop of the leg
  const matched = matchStopsToPath(stops, dir.path).slice(from, to + 1);
  const start = matched.find((m) => m !== null);
  const end = [...matched].reverse().find((m) => m !== null);
  if (!start || !end || along(end) <= along(start)) return { path: straight, followsRoads: false };
  return {
    path: [straight[0], start.point, ...dir.path.slice(start.seg + 1, end.seg + 1), end.point, straight[straight.length - 1]],
    followsRoads: true,
  };
}
