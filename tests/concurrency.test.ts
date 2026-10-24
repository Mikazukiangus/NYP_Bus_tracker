import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serialLocks } from './fixtures/locks';
import { createConfig } from '../config/schema';
import { createDatasetStore } from '../server/lta/datasets';
import { createWeatherService } from '../server/weather/service';
import { neaFixture } from './fixtures/nea';
import { createFavoritesStore } from '../src/features/saved/data/favoritesStore';
import { createRecentPlacesStore } from '../src/features/places/data/recentPlacesStore';
import { type FavoriteCandidate, sameFavorite, toggleFavorite } from '../src/features/saved/domain/favorites';
import { addRecentPlace } from '../src/features/places/domain/recentPlaces';
import type { PreferenceLocks } from '../src/services/atomicPreferences';
import type { PlaceResult } from '../src/features/places/model';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function memory(initial: string | null = null) {
  let raw = initial;
  return { getItem: () => raw, setItem(_key: string, value: string) { raw = value; } };
}
const candidate = (serviceNo: string): FavoriteCandidate => ({ serviceNo, stopCode: '54351', direction: 1, stopName: 'NYP', roadName: 'AMK', destination: 'Terminus' });
const save = (item: FavoriteCandidate) => (items: Parameters<typeof toggleFavorite>[0]) => items.some(row => sameFavorite(row, item)) ? items : toggleFavorite(items, item, 1000);
const place = (id: string): PlaceResult => ({ id, kind: 'place', name: id, lat: 1.38, lng: 103.85 });

test('a slow dataset refresh remains single-flight beyond TTL and cache lifetime begins at completion', async () => {
  let time = 1000, calls = 0;
  const gate = deferred<void>(), settings = { ...createConfig().lta, pageConcurrency: 1 };
  const store = createDatasetStore(settings, async () => { calls++; await gate.promise; return Response.json({ value: [] }); }, () => time);
  const first = store.getDatasets('fixture');
  await Promise.resolve(); assert.equal(calls, 3);
  time += settings.datasetTtlMs + 1;
  assert.equal(store.getDatasets('fixture'), first);
  assert.equal(calls, 3);
  gate.resolve(); const snapshot = await first;
  assert.equal(snapshot.loadedAt, time);
  time += settings.datasetTtlMs - 1;
  assert.equal(await store.getDatasets('fixture'), snapshot);
  assert.equal(calls, 3);
});

test('failed refreshes never publish partial collection indexes and a burst shares one recovery', async () => {
  let bad = false, time = 1000, calls = 0;
  const settings = { ...createConfig().lta, pageConcurrency: 1 };
  const store = createDatasetStore(settings, async input => {
    calls++;
    return bad && String(input).includes('BusRoutes') ? new Response('', { status: 401 }) : Response.json({ value: [] });
  }, () => time);
  const old = await store.getDatasets('fixture');
  time += settings.datasetTtlMs; bad = true;
  const failed = await Promise.allSettled(Array.from({ length: 20 }, () => store.getDatasets('fixture')));
  assert.ok(failed.every(result => result.status === 'rejected'));
  assert.equal(calls, 6);
  bad = false;
  const recovered = await Promise.all(Array.from({ length: 20 }, () => store.getDatasets('fixture')));
  assert.equal(calls, 9);
  assert.ok(recovered.every(snapshot => snapshot === recovered[0] && snapshot !== old));
});

test('overlapping weather refreshes join each dataset and cannot consume spare budget with duplicate writes', async () => {
  let time = 100000, hold = false;
  const gate = deferred<void>(), counts = new Map<string, number>();
  const settings = { ...createConfig().weather, apiKey: 'fixture', keyedBudget: 12 };
  const service = createWeatherService(settings, 'https://fixture.invalid', { now: () => time, request: async input => {
    const url = new URL(String(input)); const path = url.pathname + url.search;
    counts.set(path, (counts.get(path) ?? 0) + 1);
    if (hold) await gate.promise;
    const body = neaFixture(); body.data.items[0].forecasts[0].forecast = hold ? 'Cloudy' : 'Fair';
    return Response.json(body);
  } });
  await service.snapshot(); counts.clear(); time += settings.summaryTtlMs + 1; hold = true;
  const a = service.snapshot(), b = service.snapshot(), c = service.snapshot();
  await Promise.resolve();
  assert.equal(counts.size, 10); // Observations + summaries; 24-hour/four-day cache entries remain fresh.
  assert.ok([...counts.values()].every(count => count === 1));
  gate.resolve(); const results = await Promise.all([a, b, c]);
  assert.ok(results.every(result => result.forecast2h?.areas[0].forecast === 'Cloudy'));
  assert.deepEqual(results[1], results[0]); assert.deepEqual(results[2], results[0]);
});

test('weather work still in flight across a quota window is not started a second time', async () => {
  let time = 100000;
  const gate = deferred<void>(), paths: string[] = [], settings = createConfig().weather;
  const service = createWeatherService(settings, 'https://fixture.invalid', { now: () => time, request: async input => {
    const url = new URL(String(input)); paths.push(url.pathname + url.search); await gate.promise; return Response.json(neaFixture());
  } });
  const a = service.snapshot(); await Promise.resolve();
  time += settings.rateWindowMs + 1;
  const b = service.snapshot(); await Promise.resolve();
  assert.equal(paths.length, 10); assert.equal(new Set(paths).size, 10);
  gate.resolve(); await Promise.all([a, b]);
  assert.equal((await service.snapshot()).missing.length, 2);
});

test('independent favorite writers atomically merge distinct saves and idempotent saves of the same bus', async () => {
  const storage = memory('[]'), locks = serialLocks();
  const a = createFavoritesStore(storage, locks), b = createFavoritesStore(storage, locks);
  await Promise.all([a.update(save(candidate('50')), []), b.update(save(candidate('72')), [])]);
  const stored = a.read(); assert.equal(stored.status, 'saved');
  if (stored.status !== 'saved') return;
  assert.deepEqual(stored.items.map(item => item.serviceNo).sort(), ['50', '72']);
  await Promise.all([a.update(save(candidate('45')), []), b.update(save(candidate('45')), [])]);
  const next = a.read(); assert.equal(next.status, 'saved');
  if (next.status === 'saved') assert.equal(next.items.filter(item => item.serviceNo === '45').length, 1);
});

test('independent recent-place writers retain both additions rather than replacing a stale array', async () => {
  const storage = memory(), locks = serialLocks();
  const a = createRecentPlacesStore(storage, locks), b = createRecentPlacesStore(storage, locks);
  await Promise.all([a.update(items => addRecentPlace(place('A'), items), []), b.update(items => addRecentPlace(place('B'), items), [])]);
  const result = a.read(); assert.equal(result.status, 'saved');
  if (result.status === 'saved') assert.deepEqual(result.items.map(item => item.id), ['B', 'A']);
});

test('denied lock admission preserves the old record and explicitly keeps the mutation session-only', async () => {
  const storage = memory('[]');
  const locks = { request: async () => { throw new Error('fixture denied'); } } as unknown as PreferenceLocks;
  const store = createFavoritesStore(storage, locks);
  const result = await store.update(save(candidate('50')), []);
  assert.equal(result.status, 'session-only'); assert.equal(result.items.length, 1);
  assert.deepEqual(store.read(), { status: 'saved', items: [] });
});
