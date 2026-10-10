// Builds road-following bus route lines from OpenStreetMap (ODbL) into public/route-shapes/<SERVICE>.json.
//
// Public Overpass servers are too slow and flaky to query on every page view, so this runs offline
// (one bulk query for every Singapore bus route) and the output is committed and served from the CDN.
// Re-run occasionally to pick up route changes:  npm run shapes   (or: npm run shapes -- ./saved.json)
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const OVERPASS_INSTANCES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const USER_AGENT = 'BusTrackerSG/1.0 (https://nypbus-tracker.vercel.app)';
// Singapore mainland bounding box (south, west, north, east); stops short of Johor Bahru
const SG_BBOX = '1.15,103.6,1.475,104.1';
const QUERY = `[out:json][timeout:300];relation["type"="route"]["route"="bus"](${SG_BBOX})->.routes;.routes out body;way(r.routes);out geom;`;
const SIMPLIFY_TOLERANCE_DEG = 0.00003; // ~3 m
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/route-shapes');

type LatLng = [number, number];

interface OverpassWay {
  type: 'way';
  id: number;
  geometry?: { lat: number; lon: number }[];
}

interface OverpassRelation {
  type: 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string }[];
}

interface RouteShape {
  osmId: number;
  name?: string;
  from?: string;
  to?: string;
  path: LatLng[];
}

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
    const ends = [key(second[0]), key(second[second.length - 1])];
    const endTouches = ends.includes(key(first[first.length - 1]));
    const startTouches = ends.includes(key(first[0]));
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

    const forward = sqDist(last, way[0]) <= sqDist(last, way[way.length - 1]);
    const oriented = forward ? way : [...way].reverse();
    const startIdx = key(oriented[0]) === key(last) ? 1 : 0;
    for (let j = startIdx; j < oriented.length; j++) line.push(oriented[j]);
  }
  return line;
}

// Iterative Douglas-Peucker to keep files small without visibly changing the line
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
      const t = lenSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
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

async function fetchOverpass(): Promise<{ elements: (OverpassWay | OverpassRelation)[] }> {
  for (const url of OVERPASS_INSTANCES) {
    try {
      console.log(`Querying ${url} (this can take a minute or two)...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({ data: QUERY }).toString(),
        signal: AbortSignal.timeout(330_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`  failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  throw new Error('All Overpass instances failed; try again later.');
}

async function main() {
  // Optionally reuse a previously saved Overpass response instead of querying again
  const savedPath = process.argv[2];
  const data: { elements: (OverpassWay | OverpassRelation)[] } = savedPath
    ? JSON.parse(await readFile(savedPath, 'utf8'))
    : await fetchOverpass();

  const wayGeometry = new Map<number, LatLng[]>();
  const relations: OverpassRelation[] = [];
  for (const el of data.elements) {
    if (el.type === 'way' && el.geometry) {
      wayGeometry.set(el.id, el.geometry.map((g): LatLng => [g.lat, g.lon]));
    } else if (el.type === 'relation') {
      relations.push(el);
    }
  }

  const byService = new Map<string, RouteShape[]>();
  for (const rel of relations) {
    const ref = rel.tags?.ref?.trim().toUpperCase();
    if (!ref || !/^[0-9A-Z]{1,6}$/.test(ref)) continue;

    const ways = (rel.members ?? [])
      .filter((m) => m.type === 'way' && ['', 'forward', 'backward'].includes(m.role))
      .map((m) => wayGeometry.get(m.ref))
      .filter((g): g is LatLng[] => Boolean(g?.length));
    const stitched = stitchWays(ways);
    if (stitched.length < 2) continue;

    const shape: RouteShape = {
      osmId: rel.id,
      name: rel.tags?.name,
      from: rel.tags?.from,
      to: rel.tags?.to,
      path: simplify(stitched, SIMPLIFY_TOLERANCE_DEG).map(([lat, lng]): LatLng => [
        Math.round(lat * 1e5) / 1e5,
        Math.round(lng * 1e5) / 1e5,
      ]),
    };
    byService.set(ref, [...(byService.get(ref) ?? []), shape]);
  }

  // Only rewrite files whose shapes changed (generatedAt = when they last changed), so a scheduled
  // refresh produces a diff only for routes OpenStreetMap actually updated
  await mkdir(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  let totalBytes = 0;
  let changed = 0;
  for (const [serviceNo, shapes] of [...byService].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))) {
    const file = path.join(OUT_DIR, `${serviceNo}.json`);
    const existing = await readFile(file, 'utf8').then((t) => JSON.parse(t), () => null);
    if (existing && JSON.stringify(existing.shapes) === JSON.stringify(shapes)) {
      totalBytes += JSON.stringify(existing).length;
      continue;
    }
    const body = JSON.stringify({
      serviceNo,
      shapes,
      source: 'OPENSTREETMAP',
      attribution: '© OpenStreetMap contributors (ODbL)',
      generatedAt,
    });
    totalBytes += body.length;
    changed++;
    await writeFile(file, body);
  }

  // Remove services that no longer have an OSM route
  let removed = 0;
  for (const name of await readdir(OUT_DIR)) {
    if (name.endsWith('.json') && !byService.has(name.slice(0, -5))) {
      await rm(path.join(OUT_DIR, name));
      removed++;
    }
  }

  console.log(
    `${byService.size} services (${relations.length} OSM relations, ${(totalBytes / 1024 / 1024).toFixed(1)} MB) in ${path.relative(process.cwd(), OUT_DIR)}: ${changed} updated, ${removed} removed`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
