import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withHook } from './fixtures/hooks';
import { serialLocks } from './fixtures/locks';
import { useTrackedRoute } from '../src/features/tracking/useTrackedRoute';
import { useSavedBuses } from '../src/features/saved/application/useSavedBuses';
import { createFavoritesStore } from '../src/features/saved/data/favoritesStore';
import { useUserLocation } from '../src/features/location/useUserLocation';
import type { BusRoute, UserLocation } from '../src/types/bus';
import type { BusRouteLookup } from '../src/features/tracking/routeRepository';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const stop = { code: '54351', name: 'A', road: 'AMK', lat: 1.38, lng: 103.85 };
const end = { ...stop, code: '54359', name: 'B', lat: 1.39 };
const location: UserLocation = { ...stop, source: 'selected-place' };
const route = (serviceNo: string): BusRoute => ({ serviceNo, operator: 'SBST', category: 'Trunk',
  direction1: { origin: 'A', destination: 'B', stops: [stop, end], path: [[stop.lat, stop.lng], [end.lat, end.lng]] },
  direction2: { origin: 'B', destination: 'A', stops: [end, stop], path: [[end.lat, end.lng], [stop.lat, stop.lng]] },
});

test('a delayed route completion cannot replace a newer manual stop/direction selection', async () => {
  const response = deferred<BusRouteLookup>();
  const loaders = { fetchBusRoute: () => response.promise, fetchRouteShapes: async () => [] };
  await withHook(() => useTrackedRoute(location, null, loaders), async rig => {
    let request!: Promise<boolean>;
    await rig.change(() => { request = rig.read().loadRoute('50', { direction: 1, stopCode: stop.code }); });
    await rig.change(() => { rig.read().handleSetDirection(2); rig.read().handleSelectStop(end); });
    await rig.change(() => response.resolve({ status: 'ok', route: route('50') }));
    assert.equal(await request, true);
    assert.equal(rig.read().currentRoute.serviceNo, '50');
    assert.equal(rig.read().direction, 2);
    assert.equal(rig.read().selectedStop.code, end.code);
    assert.equal(rig.read().isRouteLoading, false);
  });
});

test('only the latest route request commits, and cancellation prevents a cleared trip publishing later', async () => {
  const first = deferred<BusRouteLookup>(), next = deferred<BusRouteLookup>(), cancelled = deferred<BusRouteLookup>();
  const loaders = { fetchBusRoute: (service: string) => service === '50' ? first.promise : service === '72' ? next.promise : cancelled.promise, fetchRouteShapes: async () => [] };
  await withHook(() => useTrackedRoute(location, null, loaders), async rig => {
    let a!: Promise<boolean>, b!: Promise<boolean>, c!: Promise<boolean>;
    await rig.change(() => { a = rig.read().loadRoute('50'); b = rig.read().loadRoute('72'); });
    await rig.change(() => next.resolve({ status: 'ok', route: route('72') }));
    await rig.change(() => first.resolve({ status: 'ok', route: route('50') }));
    assert.equal(await a, false); assert.equal(await b, true);
    assert.equal(rig.read().currentRoute.serviceNo, '72');
    await rig.change(() => { c = rig.read().loadRoute('45'); rig.read().cancelRouteRequest(); });
    await rig.change(() => cancelled.resolve({ status: 'ok', route: route('45') }));
    assert.equal(await c, false); assert.equal(rig.read().currentRoute.serviceNo, '72');
  });
});

test('queued favorite commands survive a failed save and rebase on the latest shared record', async () => {
  let raw = '[]', denied = true;
  const storage = { getItem: () => raw, setItem(_key: string, next: string) { if (denied) throw Error('fixture quota'); raw = next; } };
  const locks = serialLocks(), store = createFavoritesStore(storage, locks);
  let service = '50';
  await withHook(() => useSavedBuses(service, stop, 1, 'Terminus', store), async rig => {
    await rig.change(() => rig.read().handleToggleFavorite());
    assert.equal(rig.read().persistence, 'session-only');
    denied = false;
    const other = createFavoritesStore(storage, locks);
    await rig.change(() => other.update(items => [...items, { id: 'other', serviceNo: '45', stopCode: end.code, direction: 1, stopName: 'B', roadName: 'AMK', destination: 'Terminus', savedAt: 1 }], []));
    service = '72'; await rig.rerender();
    await rig.change(() => rig.read().handleToggleFavorite());
    const stored = store.read(); assert.equal(stored.status, 'saved');
    if (stored.status === 'saved') assert.deepEqual(stored.items.map(item => item.serviceNo).sort(), ['45', '50', '72']);
    assert.equal(rig.read().persistence, 'saved');
  });
});

test('two simultaneous save intents do not toggle each other off, and rapid save/remove keeps the final intent', async () => {
  let raw = '[]'; const storage = { getItem: () => raw, setItem(_key: string, value: string) { raw = value; } };
  const locks = serialLocks(), a = createFavoritesStore(storage, locks), b = createFavoritesStore(storage, locks);
  await withHook(() => ({ a: useSavedBuses('50', stop, 1, 'Terminus', a), b: useSavedBuses('50', stop, 1, 'Terminus', b) }), async rig => {
    await rig.change(async () => { await Promise.all([rig.read().a.handleToggleFavorite(), rig.read().b.handleToggleFavorite()]); });
    assert.equal(rig.read().a.favorites.length, 1);
    assert.equal(rig.read().b.favorites.length, 1);
    await rig.change(async () => {
      // Remove then save before React renders either update.
      const first = rig.read().a.handleToggleFavorite(), second = rig.read().a.handleToggleFavorite();
      await Promise.all([first, second]);
    });
    assert.equal(rig.read().a.isCurrentFavorite, true);
    assert.equal(rig.read().b.isCurrentFavorite, true);
  });
});

test('late GPS fixes cannot overwrite a manual selection or a newer GPS request', async () => {
  const callbacks: PositionCallback[] = [];
  const fix = (latitude: number) => ({ coords: { latitude, longitude: 103.85, accuracy: 5 } } as GeolocationPosition);
  await withHook(useUserLocation, async rig => {
    let first!: ReturnType<typeof rig.read>['requestGps'] extends (...args: any[]) => infer R ? R : never;
    await rig.change(() => { first = rig.read().requestGps(rig.read().selectLocation); });
    await rig.change(() => rig.read().selectLocation({ ...location, name: 'Manual choice' }));
    await rig.change(() => callbacks[0](fix(1.385)));
    assert.deepEqual(await first, { cancelled: true });
    assert.equal(rig.read().userLocation.name, 'Manual choice');
    let older!: typeof first, newer!: typeof first;
    await rig.change(() => { older = rig.read().requestGps(rig.read().selectLocation); newer = rig.read().requestGps(rig.read().selectLocation); });
    await rig.change(() => callbacks[2](fix(1.39)));
    await rig.change(() => callbacks[1](fix(1.381)));
    assert.ok('location' in await newer); assert.deepEqual(await older, { cancelled: true });
    assert.equal(rig.read().userLocation.lat, 1.39);
    const cancel = new AbortController(); let closed!: typeof first;
    await rig.change(() => { closed = rig.read().requestGps(rig.read().selectLocation, cancel.signal); cancel.abort(); callbacks[3](fix(1.382)); });
    assert.deepEqual(await closed, { cancelled: true }); assert.equal(rig.read().userLocation.lat, 1.39);
  }, { navigator: { geolocation: { getCurrentPosition(cb: PositionCallback) { callbacks.push(cb); } } } });
});

test('closing a GPS control aborts selection synchronously, before the delayed callback arrives', async () => {
  const { useGpsRequest } = await import('../src/features/location/useGpsRequest');
  let callback!: PositionCallback;
  await withHook(() => {
    const owner = useUserLocation();
    const control = useGpsRequest(signal => owner.requestGps(owner.selectLocation, signal));
    return { owner, control };
  }, async rig => {
    let action!: Promise<boolean>;
    const original = rig.read().owner.userLocation;
    await rig.change(() => { action = rig.read().control.start(); rig.read().control.cancel(); });
    await rig.change(() => callback({ coords: { latitude: 1.39, longitude: 103.85, accuracy: 5 } } as GeolocationPosition));
    assert.equal(await action, false);
    assert.deepEqual(rig.read().owner.userLocation, original);
    assert.equal(rig.read().control.isLocating, false);
  }, { navigator: { geolocation: { getCurrentPosition(cb: PositionCallback) { callback = cb; } } } });
});

test('cancelling an old trip does not cancel an unrelated service lookup needed by the current view', async () => {
  const response = deferred<BusRouteLookup>();
  const loaders = { fetchBusRoute: () => response.promise, fetchRouteShapes: async () => [] };
  await withHook(() => useTrackedRoute(location, null, loaders), async rig => {
    let request!: Promise<boolean>;
    await rig.change(() => { request = rig.read().loadRoute('50'); rig.read().cancelRouteRequest(true); });
    await rig.change(() => response.resolve({ status: 'ok', route: route('50') }));
    assert.equal(await request, true);
    assert.equal(rig.read().currentRoute.serviceNo, '50');
  });
});

test('late arrival ranking cannot replace a manual bus choice, but selecting the destination again starts a new plan intent', async () => {
  const { useJourneyPlan } = await import('../src/features/journey/useJourneyPlan');
  const { buildBusNetwork } = await import('../src/features/network/domain/buildNetwork');
  const gate = deferred<void>(), calls: string[] = [];
  const network = buildBusNetwork({ generatedAt: '2026-10-23T00:00:00Z', stops: [
    ['51001', 'Start', 'Road', 1.3, 103.8], ['51002', 'End', 'Road', 1.33, 103.8],
  ], patterns: [['10', 1, [0, 1], [0, 30]]] });
  const current = route('99');
  const inputs = { network, networkStatus: 'ready' as const, userLocation: { name: 'Start', source: 'selected-place' as const, lat: 1.3, lng: 103.8 },
    currentRoute: current, routeDir: current.direction1, selectedStop: stop, dataSource: 'FALLBACK_SIMULATED' as const, stopServices: null,
    loadRoute: async (service: string) => { calls.push(service); return true; }, cancelRouteRequest() {}, rememberPlace() {}, applyUserLocation() {} };
  const target = { id: 'end', kind: 'place' as const, name: 'End', lat: 1.33, lng: 103.8 };
  await withHook(() => useJourneyPlan(inputs), async rig => {
    await rig.change(() => rig.read().handleSetDestination(target));
    assert.ok(rig.read().tripPlan?.options.length);
    await rig.change(() => rig.read().trackService('99'));
    await rig.change(() => gate.resolve());
    assert.deepEqual(calls, ['99']);
    await rig.change(() => rig.read().handleSetDestination(target));
    assert.equal(calls.at(-1), '10');
    assert.equal(calls.length, 2);
  }, { fetch: async (input: string) => {
    await gate.promise;
    const code = new URL(input, 'https://fixture.invalid').searchParams.get('BusStopCode');
    return Response.json({ BusStopCode: code, source: 'LTA_DATAMALL_V3', Services: [{ ServiceNo: '10', Operator: 'SBST',
      NextBus: { EstimatedArrival: new Date(Date.now() + 300000).toISOString(), Load: 'SEA', Type: 'SD', Feature: '' }, NextBus2: null, NextBus3: null }] });
  } });
});
