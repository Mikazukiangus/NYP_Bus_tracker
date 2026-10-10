import type { Request, Response } from 'express';

// Road-following bus route geometry from OpenStreetMap (ODbL), via the public Overpass API.
// Public Overpass instances are free but often busy, so try a few in turn and cache results hard.
const OVERPASS_INSTANCES: { url: string; timeoutMs: number }[] = [
  { url: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 12000 },
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 12000 },
  { url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', timeoutMs: 20000 },
];
const USER_AGENT = 'BusTrackerSG/1.0 (https://nypbus-tracker.vercel.app)';
// Singapore mainland bounding box (south, west, north, east); stops short of Johor Bahru
const SG_BBOX = '1.15,103.6,1.475,104.1';
const SIMPLIFY_TOLERANCE_DEG = 0.00003; // ~3 m
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type LatLng = [number, number];

interface OverpassMember {
  type: 'node' | 'way' | 'relation';
  role: string;
  geometry?: { lat: number; lon: number }[];
}

interface OverpassRelation {
  type: 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: OverpassMember[];
}

export interface RouteShape {
  osmId: number;
  name?: string;
  from?: string;
  to?: string;
  path: LatLng[];
}

export interface RouteShapeResponse {
  serviceNo: string;
  shapes: RouteShape[];
  source: 'OPENSTREETMAP';
  attribution: string;
}

const memoryCache = new Map<string, { at: number; body: RouteShapeResponse }>();

const key = (p: LatLng) => `${p[0]},${p[1]}`;

function sqDist(a: LatLng, b: LatLng) {
  const dLat = a[0] - b[0];
  const dLng = a[1] - b[1];
  return dLat * dLat + dLng * dLng;
}

// Join a relation's ordered way members into one continuous line, orienting each way to follow on
function stitchWays(ways: LatLng[][]): LatLng[] {
  if (ways.length === 0) return [];

  const line: LatLng[] = [];
  const first = ways[0];
  const second = ways[1];
  // Orient the first way so that its end touches the second way
  if (second && first.length > 1) {
    const endTouches = [second[0], second[second.length - 1]].some((p) => key(p) === key(first[first.length - 1]));
    const startTouches = [second[0], second[second.length - 1]].some((p) => key(p) === key(first[0]));
    line.push(...(startTouches && !endTouches ? [...first].reverse() : first));
  } else {
    line.push(...first);
  }

  for (let i = 1; i < ways.length; i++) {
    const way = ways[i];
    if (way.length === 0) continue;
    const last = line[line.length - 1];
    const isRing = way.length > 2 && key(way[0]) === key(way[way.length - 1]);

    if (isRing) {
      // Roundabout: travel along the ring (one-way, so in node order) from entry to the exit for the next way
      const ring = way.slice(0, -1);
      const entry = ring.findIndex((p) => key(p) === key(last));
      if (entry !== -1) {
        const next = ways[i + 1];
        const exitKeys = next ? new Set([key(next[0]), key(next[next.length - 1])]) : new Set<string>();
        for (let step = 1; step <= ring.length; step++) {
          const p = ring[(entry + step) % ring.length];
          line.push(p);
          if (exitKeys.has(key(p))) break;
        }
        continue;
      }
    }

    const head = way[0];
    const tail = way[way.length - 1];
    const forward = sqDist(last, head) <= sqDist(last, tail);
    const oriented = forward ? way : [...way].reverse();
    const startIdx = key(oriented[0]) === key(last) ? 1 : 0;
    for (let j = startIdx; j < oriented.length; j++) line.push(oriented[j]);
  }
  return line;
}

// Iterative Douglas-Peucker to keep payloads small without visibly changing the line
function simplify(points: LatLng[], tolerance: number): LatLng[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const tolSq = tolerance * tolerance;

  while (stack.length) {
    const [start, end] = stack.pop()!;
    const [ay, ax] = points[start];
    const [by, bx] = points[end];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let maxSq = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const [py, px] = points[i];
      let t = lenSq ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const dSq = ex * ex + ey * ey;
      if (dSq > maxSq) {
        maxSq = dSq;
        index = i;
      }
    }
    if (index !== -1 && maxSq > tolSq) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function toShape(rel: OverpassRelation): RouteShape | null {
  const ways = (rel.members ?? [])
    .filter((m) => m.type === 'way' && ['', 'forward', 'backward'].includes(m.role) && m.geometry?.length)
    .map((m) => m.geometry!.map((g): LatLng => [g.lat, g.lon]));
  const stitched = stitchWays(ways);
  if (stitched.length < 2) return null;
  return {
    osmId: rel.id,
    name: rel.tags?.name,
    from: rel.tags?.from,
    to: rel.tags?.to,
    path: simplify(stitched, SIMPLIFY_TOLERANCE_DEG).map(([lat, lng]): LatLng => [
      Math.round(lat * 1e5) / 1e5,
      Math.round(lng * 1e5) / 1e5,
    ]),
  };
}

async function queryOverpass(serviceNo: string): Promise<OverpassRelation[]> {
  const escaped = serviceNo.replace(/"/g, '');
  const query = `[out:json][timeout:25];relation["type"="route"]["route"="bus"]["ref"="${escaped}"](${SG_BBOX});out geom;`;
  let lastError: unknown;

  for (const instance of OVERPASS_INSTANCES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), instance.timeoutMs);
    try {
      const res = await fetch(instance.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${instance.url} responded ${res.status}`);
      const body = (await res.json()) as { elements?: OverpassRelation[] };
      return (body.elements ?? []).filter((e) => e.type === 'relation');
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('All Overpass instances failed');
}

function send(res: Response | any, status: number, body: unknown, cacheControl?: string) {
  if (cacheControl && res.setHeader) res.setHeader('Cache-Control', cacheControl);
  if (res.status && typeof res.status === 'function') {
    return res.status(status).json(body);
  }
  if (res.writeHead) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body));
  }
  return body;
}

export default async function handler(req: Request | any, res: Response | any) {
  const url = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
  const serviceNo = ((req.query?.ServiceNo || req.query?.serviceNo || url.searchParams.get('ServiceNo') || url.searchParams.get('serviceNo')) as string | undefined)?.trim();

  if (!serviceNo || !/^[0-9A-Za-z]{1,6}$/.test(serviceNo)) {
    return send(res, 400, {
      error: 'Missing or invalid query parameter: ServiceNo',
      usage: '/api/route-shape?ServiceNo=72',
    });
  }

  const cacheKey = serviceNo.toUpperCase();
  const cached = memoryCache.get(cacheKey);
  // Route geometry rarely changes: cache at the edge for 30 days, serve stale while refreshing
  const longCache = 'public, s-maxage=2592000, stale-while-revalidate=2592000';
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return send(res, 200, cached.body, longCache);
  }

  try {
    const relations = await queryOverpass(serviceNo);
    const shapes = relations.map(toShape).filter((s): s is RouteShape => s !== null);
    const body: RouteShapeResponse = {
      serviceNo,
      shapes,
      source: 'OPENSTREETMAP',
      attribution: '© OpenStreetMap contributors (ODbL)',
    };
    memoryCache.set(cacheKey, { at: Date.now(), body });
    // An empty result may just mean OSM hasn't mapped this service yet; recheck daily
    return send(res, 200, body, shapes.length ? longCache : 'public, s-maxage=86400');
  } catch (err) {
    console.error('Failed to load route shape from Overpass:', err);
    return send(res, 502, { error: 'Route geometry is temporarily unavailable from OpenStreetMap.' }, 'public, s-maxage=60');
  }
}
