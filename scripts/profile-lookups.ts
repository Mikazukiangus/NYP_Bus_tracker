// Local CPU profiler. The uncached comparison runs in a disposable module, never in the app.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildBusNetwork } from '../src/features/network/domain/buildNetwork.ts';
import { parseNetwork } from '../shared/transit/parsers.ts';
import { nearestStops, searchStops } from '../src/features/network/domain/queries.ts';
import { planTrips } from '../src/services/tripPlanner.ts';
import { favoriteLabels } from '../src/features/saved/domain/labels.ts';
import { SINGAPORE_LOCATIONS } from '../src/data/locations.ts';
import type { FavoriteItem } from '../src/types/bus';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(path.join(tmpdir(), 'bustrackersg-profile-'));
let consumed = 0;
function summarize(name: string, times: number[], repeats = 1) {
  times.sort((a, b) => a - b);
  return { name, samples: times.length, repeats, medianMs: times[Math.floor(times.length * .5)],
    p95Ms: times[Math.ceil(times.length * .95) - 1], maxMs: times.at(-1) };
}
function benchmark(name: string, samples: number, repeats: number, fn: (i: number) => unknown) {
  for (let i = 0; i < Math.min(40, samples); i++) fn(i);
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    for (let j = 0; j < repeats; j++) {
      const value = fn(i + j);
      consumed += Array.isArray(value) ? value.length : Number(Boolean(value));
    }
    times.push((performance.now() - start) / repeats);
  }
  return summarize(name, times, repeats);
}

try {
  const parsed = parseNetwork(JSON.parse(await readFile(path.join(root, 'public/bus-routes/network.json'), 'utf8')));
  assert.ok(parsed, 'Generate valid local route data before profiling');
  const net = buildBusNetwork(parsed);
  const locations = SINGAPORE_LOCATIONS;
  const pairs = [[0,3], [0,6], [0,9], [1,10], [2,12], [3,15], [4,17], [5,19]]
    .map(([a, b]) => ({ from: locations[a], to: locations[b] }));
  const queries = ['55329', '54351', '53', 'nanyang', 'bishan', 'orchard', 'interchange', 'zz-no-match'];
  const favorites: FavoriteItem[] = Array.from({ length: 20 }, (_, i) => net.patterns[(19 + i * 37) % net.patterns.length])
    .map((p, i) => ({ id: `sample-${i}`, serviceNo: p.serviceNo, stopCode: net.stops[p.stops[0]].code,
      direction: p.direction, stopName: 'cached', roadName: 'cached', destination: 'cached', savedAt: 1 }));

  // Compare with the preceding per-plan neighbor cache while retaining the identical route algorithm.
  const sourceFile = path.join(root, 'src/services/tripPlanner.ts');
  let source = await readFile(sourceFile, 'utf8');
  source = source.replace(/from (['"])(\.[^'"]+)\1/g, (_, q, p) => `from ${q}${path.resolve(path.dirname(sourceFile), p)}${q}`);
  const indexedLookup = 'const neighbours = (stopIndex: number) => transferNeighbours(net, stopIndex, TRANSFER_RADIUS_M);';
  assert.ok(source.includes(indexedLookup), 'Profiler comparison hook no longer matches tripPlanner.ts');
  source = source.replace(indexedLookup, `const neighbourCache = new Map<number, { index: number; distanceM: number }[]>();
    const neighbours = (stopIndex: number) => {
      let list = neighbourCache.get(stopIndex);
      if (!list) {
        const stop = net.stops[stopIndex];
        list = stopsWithin(net, stop.lat, stop.lng, TRANSFER_RADIUS_M).map(({ stop, distanceM }) => ({ index: stop.index, distanceM }));
        neighbourCache.set(stopIndex, list);
      }
      return list;
    };`);
  const comparisonPath = path.join(scratch, 'uncached-planner.mts');
  await writeFile(comparisonPath, source);
  const baseline = await import(pathToFileURL(comparisonPath).href);
  for (const pair of pairs) assert.deepEqual(planTrips(net, pair.from, pair.to), baseline.planTrips(net, pair.from, pair.to));
  const scannedLabels = () => favorites.map(item => {
    const stop = net.byCode.get(item.stopCode);
    const pattern = net.patterns.find(p => p.serviceNo.toUpperCase() === item.serviceNo.toUpperCase() && p.direction === item.direction);
    return { ...item, stopName: stop?.name ?? item.stopName, roadName: stop?.road ?? item.roadName,
      destination: pattern ? net.stops[pattern.stops[pattern.stops.length - 1]].name : item.destination };
  });
  assert.deepEqual(favoriteLabels(favorites, net), scannedLabels());
  assert.deepEqual(searchStops(net, '55329'), net.stops.filter(s => s.code.startsWith('55329')).slice(0, 4));
  const results = [
    benchmark('uncached planner baseline', 120, 1, i => baseline.planTrips(net, pairs[i % pairs.length].from, pairs[i % pairs.length].to)),
    benchmark('indexed planner / warm', 120, 1, i => planTrips(net, pairs[i % pairs.length].from, pairs[i % pairs.length].to)),
    benchmark('nearestStops / 20 presets', 200, 10, i => nearestStops(net, locations[i % locations.length].lat, locations[i % locations.length].lng)),
    benchmark('searchStops / mixed queries', 200, 10, i => searchStops(net, queries[i % queries.length])),
    benchmark('exact code scan baseline', 200, 100, () => net.stops.filter(s => s.code.startsWith('55329')).slice(0, 4)),
    benchmark('indexed exact code search', 200, 100, () => searchStops(net, '55329')),
    benchmark('scanned favorite labels / 20 favorites', 200, 10, scannedLabels),
    benchmark('indexed favorite labels / 20 favorites', 200, 10, () => favoriteLabels(favorites, net)),
    benchmark('uncached planner / second baseline', 120, 1, i => baseline.planTrips(net, pairs[i % pairs.length].from, pairs[i % pairs.length].to)),
  ];
  const coldTimes: number[] = [];
  for (let i = 0; i < 24; i++) {
    const coldNet = buildBusNetwork(parsed);
    const pair = pairs[i % pairs.length];
    const start = performance.now();
    const result = planTrips(coldNet, pair.from, pair.to);
    coldTimes.push(performance.now() - start);
    assert.deepEqual(result, baseline.planTrips(coldNet, pair.from, pair.to));
  }
  results.push(summarize('indexed planner / first use on fresh network', coldTimes));
  const byStop = net.transferNeighboursByRadius.get(200);
  console.log(JSON.stringify({
    scope: 'Local CPU timings, not production/browser/HTTP latency. Batched p95 values describe per-batch averages.',
    runtime: process.version, stops: net.stops.length, patterns: net.patterns.length, generatedAt: net.generatedAt,
    scenarios: pairs.map(p => `${p.from.name} -> ${p.to.name}`), results,
    indexCardinality: { serviceDirections: net.byServiceDirection.size, cachedStops: byStop?.size ?? 0,
      neighbourEntries: [...(byStop?.values() ?? [])].reduce((n, v) => n + v.length, 0) },
    baselineOutputsMatch: true, consumed,
  }, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
