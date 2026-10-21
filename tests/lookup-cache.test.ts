import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { buildBusNetwork } from '../src/features/network/domain/buildNetwork';
import { searchStops, transferNeighbours } from '../src/features/network/domain/queries';
import { serviceDirectionKey } from '../src/features/network/model';
import { favoriteLabels } from '../src/features/saved/domain/labels';
import { createArrivalRepository } from '../src/features/arrivals/data/arrivalRepository';
import { fetchArrivalSnapshot, type ArrivalRequestOptions } from '../src/features/arrivals/client';
import type { ArrivalSnapshot } from '../src/features/arrivals/domain/snapshot';
import type { NetworkFile } from '../shared/transit/network';

const file = (): NetworkFile => ({ generatedAt: '2026-10-21T00:00:00Z', stops: [
  ['01001', 'Start', 'Road', 1.3, 103.8], ['01002', 'Middle', 'Road', 1.301, 103.8], ['01003', 'End', 'Avenue', 1.304, 103.8],
], patterns: [['10a', 1, [0, 1, 0, 2], [0, 1, 1, 4]], ['10a', 2, [2, 1, 0], [0, 3, 1]]] });
const live = (stopCode: string, now: number): ArrivalSnapshot => ({ status: 'available', stopCode, receivedAtMs: now, source: 'LTA_DATAMALL_V3', services: [{
  serviceNo: '10A', operator: 'SBST', nextBus: { estimatedMinutes: 5, estimatedArrivalAtMs: now + 300000, load: 'SEA', feature: '' }, nextBus2: null, nextBus3: null,
}] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('transfer-neighbor index is lazy, radius-specific, ordered and shared only within one network', () => {
  const net = buildBusNetwork(file());
  assert.equal(net.transferNeighboursByRadius.size, 0);
  const nearby = transferNeighbours(net, 0, 200);
  assert.deepEqual(nearby.map(s => s.index), [0, 1]);
  assert.equal(transferNeighbours(net, 0, 200), nearby);
  assert.deepEqual(transferNeighbours(net, 0, 500).map(s => s.index), [0, 1, 2]);
  assert.deepEqual(transferNeighbours(net, 0, 0), [{ index: 0, distanceM: 0 }]);
  const changed = file(); changed.stops[1][3] = 1.4;
  const rebuilt = buildBusNetwork(changed); // Deliberately the same generatedAt, different object/data.
  assert.equal(rebuilt.transferNeighboursByRadius.size, 0);
  assert.deepEqual(transferNeighbours(rebuilt, 0, 200).map(s => s.index), [0]);
  assert.deepEqual(nearby.map(s => s.index), [0, 1]);
  assert.deepEqual(net.patterns[0].stops, [0, 1, 0, 2]); // Loop visits are not deduplicated.
});

test('invalid transfer inputs do not create index entries', () => {
  const net = buildBusNetwork(file());
  for (const [stop, radius] of [[-1, 200], [999, 200], [0, -1], [0, NaN]]) {
    assert.throws(() => transferNeighbours(net, stop, radius), RangeError);
  }
  assert.equal(net.transferNeighboursByRadius.size, 0);
});

test('service/direction index preserves each direction and resolves case-insensitive favorite labels', () => {
  const net = buildBusNetwork(file());
  assert.equal(net.byServiceDirection.size, 2);
  assert.equal(net.byServiceDirection.get(serviceDirectionKey(' 10A ', 2)), net.patterns[1]);
  const item = { id: 'fav', serviceNo: '10A', stopCode: '01002', direction: 2, savedAt: 1, stopName: 'old', roadName: 'old', destination: 'old' };
  assert.equal(favoriteLabels([item], net)[0].destination, 'Start');
  assert.equal(favoriteLabels([{ ...item, direction: 1 }], net)[0].destination, 'End');
  assert.equal(item.destination, 'old');
});

test('exact code lookup keeps leading zeros and existing prefix/name/road/limit behavior', () => {
  const net = buildBusNetwork(file());
  assert.deepEqual(searchStops(net, ' 01002 '), [net.byCode.get('01002')]);
  assert.deepEqual(searchStops(net, '99999'), []);
  assert.deepEqual(searchStops(net, '01002', 0), []);
  assert.deepEqual(searchStops(net, '010', 2).map(s => s.code), ['01001', '01002']);
  assert.deepEqual(searchStops(net, 'middle').map(s => s.code), ['01002']);
  assert.deepEqual(searchStops(net, 'avenue').map(s => s.code), ['01003']);
});

test('arrival callers coalesce one pending request per normalized stop without mixing stops', async () => {
  const a = deferred<ArrivalSnapshot>(), b = deferred<ArrivalSnapshot>();
  const called: string[] = [];
  const repo = createArrivalRepository({ freshnessMs: 15000 }, { now: () => 1000, load: async code => {
    called.push(code); return code === '01001' ? a.promise : b.promise;
  } });
  const first = repo.load('01001');
  assert.equal(repo.load(' 01001 '), first);
  assert.equal(repo.load('01001', { forceRefresh: true }), first);
  const other = repo.load('01002');
  assert.notEqual(other, first);
  await Promise.resolve();
  assert.deepEqual(called, ['01001', '01002']);
  a.resolve(live('01001', 1000)); b.resolve(live('01002', 1000));
  assert.equal((await first).stopCode, '01001'); assert.equal((await other).stopCode, '01002');
});

test('freshness expires at the receipt deadline and cache reads never extend it', async () => {
  let now = 1000, calls = 0;
  const repo = createArrivalRepository({ freshnessMs: 15000 }, { now: () => now, load: async code => { calls++; return live(code, now); } });
  const first = await repo.load('01001');
  now = 10000; assert.equal(await repo.load('01001'), first);
  now = 15999; assert.equal(await repo.load('01001'), first); assert.equal(calls, 1);
  now = 16000; assert.notEqual(await repo.load('01001'), first); assert.equal(calls, 2);
  now = 9000; await repo.load('01001'); assert.equal(calls, 3); // Clock rollback cannot prolong a snapshot.
});

test('manual refresh bypasses fresh data and shares its replacement with other callers', async () => {
  let calls = 0;
  const forced = deferred<ArrivalSnapshot>();
  const options: (ArrivalRequestOptions | undefined)[] = [];
  const repo = createArrivalRepository({ freshnessMs: 15000 }, { now: () => 1000, load: async (code, option) => {
    options.push(option); return ++calls === 1 ? live(code, 1000) : forced.promise;
  } });
  const first = await repo.load('01001');
  const refreshed = repo.load('01001', { forceRefresh: true });
  assert.equal(repo.load('01001'), refreshed);
  await Promise.resolve(); assert.equal(calls, 2); assert.equal(options[1]?.forceRefresh, true);
  forced.resolve(live('01001', 1100));
  assert.notEqual(await refreshed, first);
});

test('a failed forced refresh removes the previous live cache and can recover immediately', async () => {
  let calls = 0;
  const repo = createArrivalRepository({ freshnessMs: 15000 }, { now: () => 1000, load: async code => {
    calls++; if (calls === 2) throw new Error('fixture failure'); return live(code, 1000);
  } });
  await repo.load('01001');
  const failure = await repo.load('01001', { forceRefresh: true });
  assert.equal(failure.status, 'unavailable');
  if (failure.status === 'unavailable') assert.equal(failure.reason, 'network');
  assert.equal((await repo.load('01001')).status, 'available');
  assert.equal(calls, 3);
});

test('empty live responses cache, while simulated, invalid and network failures never become cached success', async () => {
  for (const reason of ['simulated', 'invalid', 'network'] as const) {
    let calls = 0;
    const repo = createArrivalRepository({ freshnessMs: 15000 }, { now: () => 1000, load: async code => {
      calls++; return { status: 'unavailable', stopCode: code, receivedAtMs: 1000, reason, source: reason === 'simulated' ? 'FALLBACK_SIMULATED' : null };
    } });
    assert.equal(await repo.services('01001'), null); assert.equal(await repo.services('01001'), null);
    assert.equal(calls, 2);
  }
  let calls = 0;
  const repo = createArrivalRepository({ freshnessMs: 15000 }, { load: async code => {
    calls++; return { status: 'available', source: 'LTA_DATAMALL_V3', services: [], stopCode: code, receivedAtMs: Date.now() };
  } });
  assert.deepEqual(await repo.services('01001'), []); assert.deepEqual(await repo.services('01001'), []);
  assert.equal(calls, 1);
});

test('cached services age from absolute instants without rewriting the stored snapshot or receipt time', async () => {
  let now = 1000, calls = 0;
  const repo = createArrivalRepository({ freshnessMs: 300000 }, { now: () => now, load: async code => { calls++; return live(code, now); } });
  const snapshot = await repo.load('01001');
  now += 120000;
  assert.equal((await repo.services('01001'))?.[0].nextBus?.estimatedMinutes, 3);
  assert.equal(snapshot.receivedAtMs, 1000);
  if (snapshot.status === 'available') assert.equal(snapshot.services[0].nextBus?.estimatedMinutes, 5);
  assert.equal(calls, 1);
});

test('bounded LRU live caching retains pending requests and isolates separate repository instances', async () => {
  const calls: string[] = [];
  const load = async (code: string) => { calls.push(code); return live(code, 1000); };
  const repo = createArrivalRepository({ freshnessMs: 15000, maxEntries: 2 }, { now: () => 1000, load });
  await repo.load('01001'); await repo.load('01002'); await repo.load('01001');
  await repo.load('01003'); await repo.load('01001'); await repo.load('01002');
  assert.deepEqual(calls, ['01001', '01002', '01003', '01002']);
  const isolated = createArrivalRepository({ freshnessMs: 15000 }, { now: () => 1000, load });
  await isolated.load('01001'); assert.equal(calls.length, 5);
  const pending = deferred<ArrivalSnapshot>();
  let starts = 0;
  const small = createArrivalRepository({ freshnessMs: 15000, maxEntries: 1 }, { now: () => 1000, load: async code => {
    starts++; return code === '01001' ? pending.promise : live(code, 1000);
  } });
  const first = small.load('01001'); await small.load('01002');
  assert.equal(small.load('01001'), first);
  pending.resolve(live('01001', 1000)); await first; assert.equal(starts, 2);
});

test('invalid stop inputs and cross-stop loader results never populate a live cache', async () => {
  let calls = 0;
  const repo = createArrivalRepository({ freshnessMs: 15000 }, { load: async () => { calls++; return live('01002', Date.now()); } });
  assert.equal((await repo.load('bad')).status, 'unavailable'); assert.equal(calls, 0);
  assert.equal((await repo.load('01001')).status, 'unavailable');
  assert.equal((await repo.load('01001')).status, 'unavailable'); assert.equal(calls, 2);
  assert.throws(() => createArrivalRepository({ freshnessMs: -1 }, { load: async code => live(code, 0) }), RangeError);
});

test('manual transport refresh explicitly bypasses browser HTTP caching', async () => {
  const cacheModes: (RequestCache | undefined)[] = [];
  globalThis.fetch = async (_, init) => {
    cacheModes.push(init?.cache);
    return Response.json({ source: 'LTA_DATAMALL_V3', BusStopCode: '01001', Services: [] });
  };
  await fetchArrivalSnapshot('01001'); await fetchArrivalSnapshot('01001', { forceRefresh: true });
  assert.deepEqual(cacheModes, [undefined, 'no-store']);
});
