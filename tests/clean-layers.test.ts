import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBusNetwork } from '../src/features/network/domain/buildNetwork';
import { createNetworkRepository } from '../src/features/network/data/networkRepository';
import { searchPlaces } from '../src/features/places/application/searchPlaces';
import { createOneMapClient } from '../src/features/places/data/oneMapClient';
import { addRecentPlace } from '../src/features/places/domain/recentPlaces';
import { loadRecentPlaces, saveRecentPlaces } from '../src/features/places/data/recentPlacesStore';
import type { PlaceResult } from '../src/features/places/model';
import { createFavoritesStore, FAVORITES_STORAGE_KEY } from '../src/features/saved/data/favoritesStore';
import { defaultFavorites, toggleFavorite, removeFavorite } from '../src/features/saved/domain/favorites';
import { serviceDayType } from '../src/features/arrivals/domain/serviceSchedule';

const file = { generatedAt: '2026-10-20T00:00:00Z', stops: [['55329', 'Nanyang Poly', 'Ang Mo Kio Ave 8', 1.379, 103.849] as [string, string, string, number, number]], patterns: [] };
const network = buildBusNetwork(file);
const place: PlaceResult = { id: 'nyp', kind: 'place', name: 'NYP', lat: 1.379, lng: 103.849 };
const memory = (initial: string | null = null) => {
  let value = initial;
  return { getItem: () => value, setItem: (key: string, next: string) => { assert.equal(key, FAVORITES_STORAGE_KEY); value = next; } };
};

test('favorite storage distinguishes absent/corrupt data from an intentionally empty list', () => {
  assert.equal(createFavoritesStore(memory()).read().status, 'missing');
  for (const raw of ['{', 'null', '{}', 'true', '"saved"']) assert.equal(createFavoritesStore(memory(raw)).read().status, 'invalid');
  const store = createFavoritesStore(memory());
  store.save([]);
  assert.deepEqual(store.read(), { status: 'saved', items: [] });
});

test('favorite storage keeps valid legacy items and filters invalid rows; denied storage is harmless', () => {
  const items = defaultFavorites(100);
  const store = createFavoritesStore(memory(JSON.stringify([...items, null, { ...items[0], savedAt: 'wrong' }, { ...items[0], direction: 9 }])));
  assert.equal(store.read().status, 'saved');
  assert.deepEqual((store.read() as { items: unknown[] }).items.map(item => { const { labelSnapshot, ...legacy } = item as typeof items[number]; return legacy; }), items);
  const blocked = createFavoritesStore({ getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } });
  assert.equal(blocked.read().status, 'unavailable');
  assert.doesNotThrow(() => blocked.save(items));
});

test('favorite rules preserve direction-aware identity, empty removal and an explicit deterministic clock', () => {
  const initial = defaultFavorites(100);
  const candidate = { serviceNo: '50', stopCode: '54351', stopName: 'Nanyang Poly', roadName: 'Ang Mo Kio Ave 8', direction: 2, destination: 'Bishan Int' };
  const added = toggleFavorite(initial, candidate, 200);
  assert.equal(added[0].id, 'fav:50:54351:2:1');
  assert.equal(added[0].savedAt, 200);
  assert.deepEqual(initial, defaultFavorites(100));
  assert.equal(toggleFavorite(added, { ...candidate, direction: 1 }, 300).length, 3);
  assert.deepEqual(toggleFavorite(added, candidate, 300), initial);
  assert.deepEqual(removeFavorite(initial, 'fav-72-55329'), []);
});

test('recent-place calculation is pure, with storage failures isolated from usable in-memory state', () => {
  const initial = [place];
  const next = addRecentPlace({ ...place, name: 'Renamed' }, initial);
  assert.equal(initial[0].name, 'NYP');
  assert.equal(next[0].name, 'Renamed');
  assert.doesNotThrow(() => saveRecentPlaces(next, { setItem() { throw Error('quota'); } }));
  assert.deepEqual(loadRecentPlaces({ getItem() { throw Error('blocked'); } }), []);
});

test('search uses five-digit local stops without HTTP; six-digit postcodes reach the injected provider', async () => {
  let calls = 0;
  const remote = async (query: string) => { calls++; assert.equal(query, '560123'); return [place]; };
  const stop = await searchPlaces(' 55329 ', network, remote);
  assert.equal(stop.results[0].id, 'stop:55329');
  assert.equal(calls, 0);
  assert.equal((await searchPlaces('x', network, remote)).status, 'idle');
  assert.equal(calls, 0);
  const postal = await searchPlaces('560123', network, remote);
  assert.equal(calls, 1);
  assert.deepEqual(postal.results, [place]);
});

test('remote search failure retains local stops and differs from a successful empty result', async () => {
  const unavailable = await searchPlaces('nanyang', network, async () => null);
  const empty = await searchPlaces('nanyang', network, async () => []);
  assert.equal(unavailable.addressSearchFailed, true);
  assert.equal(empty.addressSearchFailed, false);
  assert.deepEqual(unavailable.results, empty.results);
  assert.equal(unavailable.results[0].kind, 'stop');
});

test('OneMap adapter encodes queries and combines cancellation with its timeout', async () => {
  const controller = new AbortController();
  let signal: AbortSignal | null | undefined;
  const client = createOneMapClient({ url: 'https://fixture.test/search', timeoutMs: 1000 }, async (input, init) => {
    assert.equal(new URL(String(input)).searchParams.get('searchVal'), 'AMK & YCK');
    signal = init?.signal;
    return Response.json({ results: [] });
  });
  assert.deepEqual(await client.search('AMK & YCK', controller.signal), []);
  assert.equal(signal?.aborted, false);
  controller.abort();
  assert.equal(signal?.aborted, false); // Completed shared work releases this subscriber's listener.
  assert.equal(await client.search('AMK & YCK', controller.signal), null); // An aborted subscriber cannot read a warm hit.
  const unavailable = createOneMapClient({ url: 'https://fixture.test/search', timeoutMs: 1000 }, async () => new Response('', { status: 429 }));
  assert.equal(await unavailable.search('NYP'), null);
});

test('network repository coalesces requests, retains its cache and isolates separate instances', async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return Response.json(file); };
  const settings = { url: 'https://fixture.test/network', timeoutMs: 1000 };
  const repository = createNetworkRepository(settings, request);
  const first = repository.load();
  assert.equal(repository.load(), first);
  const loaded = await first;
  assert.equal(loaded?.byCode.get('55329')?.name, 'Nanyang Poly');
  assert.equal(await repository.load(), loaded);
  assert.equal(calls, 1);
  await createNetworkRepository(settings, request).load();
  assert.equal(calls, 2);
});

test('failed or non-JSON network loads do not poison the shared retryable cache', async () => {
  let calls = 0;
  const repository = createNetworkRepository({ url: 'https://fixture.test/network', timeoutMs: 1000 }, async () => {
    calls++;
    return calls === 1 ? new Response('<html/>', { headers: { 'content-type': 'text/html' } }) : Response.json(file);
  });
  assert.equal(await repository.load(), null);
  assert.ok(await repository.load());
  assert.equal(calls, 2);
});

test('service-day policy changes at 4 am Singapore time across weekend boundaries', () => {
  for (const [time, expected] of [
    ['2026-10-17T03:59:59+08:00', 'weekday'], ['2026-10-17T04:00:00+08:00', 'saturday'],
    ['2026-10-18T03:59:59+08:00', 'saturday'], ['2026-10-18T04:00:00+08:00', 'sunday'],
    ['2026-10-19T03:59:59+08:00', 'sunday'], ['2026-10-19T04:00:00+08:00', 'weekday'],
  ]) assert.equal(serviceDayType(Date.parse(time)), expected);
});
