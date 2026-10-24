import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTtlCache } from '../shared/cache/ttlCache.ts';
import { createAsyncCache } from '../shared/cache/asyncCache.ts';
import { createOneMapClient } from '../src/features/places/data/oneMapClient';
import { createIncidentService } from '../server/lta/incidents.ts';
import { incidentCacheControl } from '../server/http/cache.ts';
import { createTripPlanCache } from '../src/features/journey/tripPlanCache';
import { buildBusNetwork } from '../src/features/network/domain/buildNetwork';
import { planTrips } from '../src/services/tripPlanner';
import { rankTrips } from '../src/features/journey/selectors';
import { createConfig, createPublicConfig } from '../config/schema.ts';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
const lta = createConfig({ LTA_ACCOUNT_KEY: 'fixture' }).lta;
const makeNet = () => buildBusNetwork({ generatedAt: '2026-10-24T00:00:00.000Z', stops: [
  ['01001', 'Start', 'Road', 1.3, 103.8], ['01002', 'End', 'Road', 1.34, 103.8],
], patterns: [['72', 1, [0, 1], [0, 40]]] });
const from = { lat: 1.3, lng: 103.8 }, to = { lat: 1.34, lng: 103.8 };

test('TTL cache expires from publication, bounds LRU entries and invalidates without extending hits', () => {
  let time = 0;
  const cache = createTtlCache<number>({ freshnessMs: 1000, maxEntries: 2 }, () => time);
  cache.set('a', 0); cache.set('b', 2);
  time = 500; assert.equal(cache.get('a'), 0);
  cache.set('c', 3); assert.equal(cache.get('b'), undefined);
  time = 999; assert.equal(cache.get('a'), 0);
  time = 1000; assert.equal(cache.get('a'), undefined);
  time = 400; assert.equal(cache.get('c'), undefined); // rollback invalidates
  cache.set('a', 1); cache.set('b', 2); cache.invalidate('a');
  assert.equal(cache.get('a'), undefined); assert.equal(cache.get('b'), 2);
  cache.invalidate(); assert.equal(cache.get('b'), undefined);
  const disabled = createTtlCache<number>({ freshnessMs: 0, maxEntries: 1 });
  disabled.set('a', 1); assert.equal(disabled.get('a'), undefined);
  assert.throws(() => createTtlCache({ freshnessMs: NaN, maxEntries: 1 }));
  assert.throws(() => createTtlCache({ freshnessMs: 1, maxEntries: 0 }));
});

test('shared cache timestamps completion and never caches rejected or uncacheable results', async () => {
  let time = 0, calls = 0;
  const cache = createAsyncCache<number | null>({ freshnessMs: 1000, maxEntries: 1 }, v => v !== null, () => time);
  const gate = deferred<number>();
  const load = () => { calls++; return gate.promise; };
  const results = Array.from({ length: 20 }, () => cache.load('key', load));
  time = 5000; gate.resolve(1);
  assert.deepEqual(await Promise.all(results), Array(20).fill(1)); assert.equal(calls, 1);
  time = 5999; assert.equal(await cache.load('key', load), 1);
  time = 6000;
  await assert.rejects(cache.load('key', async () => { throw new Error('failed'); }));
  assert.equal(await cache.load('key', async () => null), null);
  assert.equal(await cache.load('key', async () => 2), 2);
});

test('invalidated old completions cannot repopulate cache or clear a newer pending owner', async () => {
  const cache = createAsyncCache<string>({ freshnessMs: 1000, maxEntries: 1 }, () => true);
  const old = deferred<string>(), fresh = deferred<string>();
  const a = cache.load('key', async () => old.promise);
  cache.invalidate('key');
  let starts = 0;
  const b = cache.load('key', async () => { starts++; return fresh.promise; });
  old.resolve('old'); assert.equal(await a, 'old');
  const c = cache.load('key', async () => { assert.fail('must join newer owner'); });
  fresh.resolve('fresh'); assert.equal(await b, 'fresh'); assert.equal(await c, 'fresh');
  assert.equal(await cache.load('key', async () => 'wrong'), 'fresh'); assert.equal(starts, 1);
});

test('OneMap coalesces bursts, caches valid empty responses and expires/invalidate queries independently', async () => {
  let time = 0, calls = 0;
  const client = createOneMapClient({ url: 'https://fixture.example/search', timeoutMs: 1000, freshnessMs: 1000 }, async (_input, init) => {
    calls++; assert.equal(init?.cache, 'no-store'); return Response.json({ results: [] });
  }, () => time);
  await Promise.all(Array.from({ length: 20 }, () => client.search(' NYP ')));
  for (let i = 0; i < 5; i++) assert.deepEqual(await client.search('NYP'), []);
  assert.equal(calls, 1);
  await client.search('AMK'); assert.equal(calls, 2);
  time = 999; await client.search('NYP'); assert.equal(calls, 2);
  time = 1000; await client.search('NYP'); assert.equal(calls, 3);
  client.invalidate(' NYP '); await client.search('NYP'); assert.equal(calls, 4);
  client.invalidate(); await client.search('NYP'); assert.equal(calls, 5);
});

test('cancelling one search subscriber preserves the other; cancelling all aborts owned I/O and allows retry', async () => {
  const gate = deferred<Response>(); let calls = 0, signal!: AbortSignal;
  const client = createOneMapClient({ url: 'https://fixture.example/search', timeoutMs: 1000 }, async (_url, init) => {
    calls++; signal = init!.signal!; return gate.promise;
  });
  const cancelled = new AbortController();
  const a = client.search('NYP', cancelled.signal), b = client.search('NYP');
  cancelled.abort(); assert.equal(await a, null); assert.equal(signal.aborted, false);
  gate.resolve(Response.json({ results: [] })); assert.deepEqual(await b, []); assert.equal(calls, 1);
  assert.deepEqual(await client.search('NYP'), []); assert.equal(calls, 1);
  assert.equal(await client.search('NYP', cancelled.signal), null);

  let aborted = false;
  const another = createOneMapClient({ url: 'https://fixture.example/search', timeoutMs: 1000 }, async (_url, init) => {
    if (aborted) return Response.json({ results: [] });
    return new Promise((_r, reject) => init!.signal!.addEventListener('abort', () => { aborted = true; reject(init!.signal!.reason); }, { once: true }));
  });
  const controller = new AbortController(), pending = another.search('NYP', controller.signal);
  controller.abort(); assert.equal(await pending, null); assert.equal(aborted, true);
  assert.deepEqual(await another.search('NYP'), []);
});

test('OneMap malformed/auth failures do not cache, and LRU/zero-TTL policies stay bounded', async () => {
  for (const bad of [() => Response.json({ invalid: true }), () => new Response('', { status: 401 })]) {
    let calls = 0;
    const client = createOneMapClient({ url: 'https://fixture.example/search', timeoutMs: 1000 }, async () => ++calls === 1 ? bad() : Response.json({ results: [] }));
    assert.equal(await client.search('NYP'), null);
    assert.deepEqual(await client.search('NYP'), []); assert.equal(calls, 2);
  }
  let calls = 0;
  const client = createOneMapClient({ url: 'https://fixture.example/search', timeoutMs: 1000, maxEntries: 2 }, async () => { calls++; return Response.json({ results: [] }); });
  for (const q of ['AA', 'BB', 'AA', 'CC', 'AA', 'BB']) await client.search(q);
  assert.equal(calls, 4);
  const disabled = createOneMapClient({ url: 'https://fixture.example/search', timeoutMs: 1000, freshnessMs: 0 }, async () => { calls++; return Response.json({ results: [] }); });
  await disabled.search('AA'); await disabled.search('AA'); assert.equal(calls, 6);
});

test('incident callers share one provider request and retain original timestamps until TTL/invalidation', async () => {
  let time = 100000, calls = 0;
  const service = createIncidentService(lta, { now: () => time, request: async () => { calls++; return Response.json({ value: [] }); } });
  const results = await Promise.all(Array.from({ length: 20 }, () => service.incidents()));
  assert.equal(calls, 1);
  time += 119999; assert.deepEqual(await service.incidents(), results[0]); assert.equal(calls, 1);
  time++; const newer = await service.incidents(); assert.equal(calls, 2); assert.notDeepEqual(newer, results[0]);
  service.invalidate(); await service.incidents(); assert.equal(calls, 3);
  time--; await service.incidents(); assert.equal(calls, 4); // no future cache after rollback
});

test('incident invalid data/failures never become cached successes; separate owners and disabled TTL stay isolated', async () => {
  let calls = 0;
  const service = createIncidentService(lta, { request: async () => ++calls === 1 ? Response.json({ bad: true }) : Response.json({ value: [] }) });
  assert.deepEqual(await service.incidents(), { kind: 'unavailable' });
  assert.equal((await service.incidents()).kind, 'ok'); assert.equal(calls, 2);
  const other = createIncidentService({ ...lta, cache: { ...lta.cache, incidentsSeconds: 0 } }, { request: async () => { calls++; return Response.json({ value: [] }); } });
  await other.incidents(); await other.incidents(); assert.equal(calls, 4);
});

test('edge freshness counts provider snapshot age instead of restarting TTL on a memory-cache hit', () => {
  const at = '2026-10-24T00:00:00.000Z', base = Date.parse(at);
  assert.equal(incidentCacheControl(lta.cache, at, base), 'public, s-maxage=120, stale-while-revalidate=300');
  assert.equal(incidentCacheControl(lta.cache, at, base + 60001), 'public, s-maxage=59, stale-while-revalidate=300');
  assert.equal(incidentCacheControl(lta.cache, at, base + 120000), 'public, s-maxage=0, stale-while-revalidate=300');
  assert.equal(incidentCacheControl(lta.cache, at, base - 1), 'no-store');
  assert.equal(incidentCacheControl(lta.cache, 'invalid', base), 'no-store');
});

test('trip plans reuse exact points only and invalidate on network identity/version, TTL and explicit clear', () => {
  let time = 0, calls = 0;
  const cache = createTripPlanCache({ freshnessMs: 1000 }, (...args) => { calls++; return planTrips(...args); }, () => time);
  const net = makeNet(), first = cache.plan(net, from, to);
  assert.equal(cache.plan(net, { ...from }, { ...to }), first); assert.equal(calls, 1);
  cache.plan(net, { ...from, lat: from.lat + .000001 }, to); assert.equal(calls, 2);
  cache.plan(makeNet(), from, to); assert.equal(calls, 3); // same version, rebuilt owner
  net.datasetVersion = 'changed'; cache.plan(net, from, to); assert.equal(calls, 4);
  time = 1000; cache.plan(net, from, to); assert.equal(calls, 5);
  cache.invalidate(net); cache.plan(net, from, to); assert.equal(calls, 6);
  cache.invalidate(); cache.plan(net, from, to); assert.equal(calls, 7);
});

test('trip LRU and disabled caching preserve outputs and reject invalid points before computation', () => {
  let calls = 0;
  const compute: typeof planTrips = (...args) => { calls++; return planTrips(...args); };
  const cache = createTripPlanCache({ freshnessMs: 1000, maxEntries: 1 }, compute);
  const net = makeNet();
  const first = cache.plan(net, from, to);
  assert.deepEqual(first, planTrips(net, from, to));
  cache.plan(net, to, from); cache.plan(net, from, to); assert.equal(calls, 3);
  assert.throws(() => cache.plan(net, { lat: NaN, lng: 103.8 }, to)); assert.equal(calls, 3);
  const disabled = createTripPlanCache({ freshnessMs: 0 }, compute);
  disabled.plan(net, from, to); disabled.plan(net, from, to); assert.equal(calls, 5);
});

test('static trip reuse never freezes live departure estimates or changes cached plans', () => {
  const net = makeNet(), cache = createTripPlanCache({ freshnessMs: 300000 });
  const tripPlan = cache.plan(net, from, to), before = structuredClone(tripPlan);
  assert.ok(tripPlan.options.length);
  const rank = (minutes: number) => rankTrips({ tripPlan, selectedStop: { code: '01001' }, dataSource: 'LTA_DATAMALL_V3', tripArrivals: {},
    stopServices: [{ serviceNo: '72', operator: 'GAS', nextBus: { estimatedMinutes: minutes, load: 'SEA', feature: '' }, nextBus2: null, nextBus3: null }] });
  assert.notDeepEqual(rank(2)[0].live, rank(12)[0].live);
  assert.equal(cache.plan(net, from, to), tripPlan);
  assert.deepEqual(tripPlan, before);
});

test('new public cache TTLs validate independently and zero disables settled reuse', () => {
  const defaults = createPublicConfig();
  assert.equal(defaults.cache.placeSearchSeconds, 300); assert.equal(defaults.cache.tripPlansSeconds, 300);
  for (const key of ['VITE_PLACE_SEARCH_CACHE_SECONDS', 'VITE_TRIP_PLANS_CACHE_SECONDS']) {
    assert.equal(Object.values(createPublicConfig({ [key]: '0' }).cache).filter(v => v === 0).length, 1);
    for (const value of ['-1', '1801', 'bad']) assert.throws(() => createPublicConfig({ [key]: value }), new RegExp(key));
  }
});
