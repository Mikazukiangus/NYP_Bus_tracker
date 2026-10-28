import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withHook } from './fixtures/hooks';
import { useBusNetwork } from '../src/features/network/application/useBusNetwork';
import { createNetworkRepository, networkRepository } from '../src/features/network/data/networkRepository';
import { useGpsRequest } from '../src/features/location/useGpsRequest';
import type { GpsSelectionResult } from '../src/features/location/useUserLocation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const location = { name: 'Fixture', lat: 1.38, lng: 103.85, source: 'gps' as const };
const networkFile = () => ({ generatedAt: '2026-10-28T00:00:00Z', stops: [
  ['55329', 'Nanyang Poly', 'AMK Ave 8', 1.38, 103.85], ['55321', 'Terminus', 'AMK Ave 8', 1.381, 103.85],
], patterns: [['72', 1, [0, 1], [0, 5]]] });

test('network transport/schema/indexes feed the hook without confusing loading and available nearby stops', async context => {
  const response = deferred<Response>(); let calls = 0;
  const repository = createNetworkRepository({ url: 'https://fixture.invalid/network.json', timeoutMs: 1000 }, async () => { calls++; return response.promise; });
  context.mock.method(networkRepository, 'load', repository.load);
  let currentLocation = location;
  await withHook(() => useBusNetwork(currentLocation), async rig => {
    assert.equal(rig.read().networkStatus, 'loading'); assert.equal(rig.read().nearbyStops, null);
    await rig.change(async () => { response.resolve(Response.json(networkFile())); await repository.load(); });
    assert.equal(rig.read().networkStatus, 'ready');
    assert.equal(rig.read().nearbyStops?.[0].stop.code, '55329');
    assert.deepEqual(rig.read().nearbyStops?.[0].services, [{ serviceNo: '72', direction: 1, towards: 'Terminus' }]);
    assert.equal(rig.read().stopNames['55321'], 'Terminus');
    currentLocation = { ...location, lat: 1.2 };
    await rig.rerender();
    assert.deepEqual(rig.read().nearbyStops, []); // Ready network, no nearby services.
    assert.equal(calls, 1); // Location changes reuse the validated indexed network.
  });
});

test('invalid network data is unavailable, remains retryable and recovers on a later mount', async context => {
  let calls = 0;
  const first = deferred<Response>();
  const repository = createNetworkRepository({ url: 'https://fixture.invalid/network.json', timeoutMs: 1000 }, async () => {
    calls++; return calls === 1 ? first.promise : Response.json(networkFile());
  });
  context.mock.method(networkRepository, 'load', repository.load);
  await withHook(() => useBusNetwork(location), async rig => {
    await rig.change(async () => {
      first.resolve(Response.json({ ...networkFile(), patterns: [['72', 1, [99], [0]]] }));
      await repository.load();
    });
    assert.equal(rig.read().networkStatus, 'unavailable');
    assert.equal(rig.read().nearbyStops, undefined); assert.deepEqual(rig.read().stopNames, {});
  });
  await withHook(() => useBusNetwork(location), async rig => {
    await rig.change(async () => { await repository.load(); });
    assert.equal(rig.read().networkStatus, 'ready'); assert.ok(rig.read().network);
  });
  assert.equal(calls, 2);
});

test('GPS request ownership cancels stale fixes; cancel and disable cannot publish late results', async () => {
  const requests: { result: ReturnType<typeof deferred<GpsSelectionResult>>; signal: AbortSignal }[] = [];
  let enabled = true;
  const selectGps = (signal: AbortSignal) => {
    const result = deferred<GpsSelectionResult>(); requests.push({ result, signal }); return result.promise;
  };
  await withHook(() => useGpsRequest(selectGps, enabled), async rig => {
    let first!: Promise<boolean>, second!: Promise<boolean>;
    await rig.change(() => { first = rig.read().start(); });
    assert.equal(rig.read().isLocating, true);
    await rig.change(() => { second = rig.read().start(); });
    assert.equal(requests[0].signal.aborted, true);
    await rig.change(async () => { requests[0].result.resolve({ error: 'Old failure' }); assert.equal(await first, false); });
    assert.equal(rig.read().isLocating, true); assert.equal(rig.read().error, null);
    await rig.change(() => rig.read().cancel());
    assert.equal(requests[1].signal.aborted, true); assert.equal(rig.read().isLocating, false);
    await rig.change(async () => { requests[1].result.resolve({ location }); assert.equal(await second, false); });
    let third!: Promise<boolean>;
    await rig.change(() => { third = rig.read().start(); });
    enabled = false; await rig.rerender();
    assert.equal(requests[2].signal.aborted, true);
    await rig.change(async () => { requests[2].result.resolve({ location }); assert.equal(await third, false); });
    assert.equal(await rig.read().start(), false); assert.equal(requests.length, 3);
  });
});

test('GPS permission errors expire and a successful retry clears them; unmount aborts active requests', async () => {
  let callback: (() => void) | undefined;
  let signal: AbortSignal | undefined;
  let resolve = (value: GpsSelectionResult) => {};
  await withHook(() => useGpsRequest(async current => {
    signal = current; return new Promise<GpsSelectionResult>(done => { resolve = done; });
  }), async rig => {
    let result!: Promise<boolean>;
    await rig.change(() => { result = rig.read().start(); });
    await rig.change(async () => { resolve({ error: 'Location access denied.' }); assert.equal(await result, false); });
    assert.equal(rig.read().error, 'Location access denied.'); assert.equal(rig.read().isLocating, false);
    await rig.change(() => callback!()); assert.equal(rig.read().error, null);
    await rig.change(() => { result = rig.read().start(); });
    await rig.change(async () => { resolve({ location }); assert.equal(await result, true); });
    assert.equal(rig.read().error, null); assert.equal(rig.read().isLocating, false);
    await rig.change(() => { void rig.read().start(); });
  }, { setTimeout(fn: () => void, ms: number) { assert.equal(ms, 8000); callback = fn; return 1; }, clearTimeout() { callback = undefined; } });
  assert.equal(signal?.aborted, true);
});
