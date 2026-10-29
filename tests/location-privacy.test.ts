import test from 'node:test';
import assert from 'node:assert/strict';
import * as locationService from '../src/services/userLocation.ts';
import { useUserLocation } from '../src/features/location/useUserLocation.ts';
import { withHook } from './fixtures/hooks.ts';
import { locationExport } from '../src/features/location/locationExport.ts';
import { createRecentPlacesStore, RECENT_PLACES_KEY } from '../src/features/places/data/recentPlacesStore.ts';
import { useRecentPlaces } from '../src/features/places/application/useRecentPlaces.ts';
import { serialLocks } from './fixtures/locks.ts';
test('clearing a remembered location removes only its storage key and cancels a pending GPS selection', async () => {
  assert.equal(typeof locationService.forgetSavedLocation, 'function');
  const entries = new Map([['unrelated', 'keep']]);
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
  locationService.saveUserLocation({ name: 'Private place', lat: 1.35, lng: 103.85, source: 'gps' }, storage);
  let callback!: PositionCallback;
  await withHook(useUserLocation, async rig => {
    let selected = false;
    const pending = rig.read().requestGps(() => { selected = true; });
    await rig.change(() => { rig.read().forgetLocation(); });
    callback({ coords: { latitude: 1.35, longitude: 103.85, accuracy: 10 } } as GeolocationPosition);
    assert.deepEqual(await pending, { cancelled: true });
    assert.equal(selected, false);
    assert.equal(entries.has(locationService.LOCATION_STORAGE_KEY), false);
    assert.equal(entries.get('unrelated'), 'keep');
    assert.equal(rig.read().userLocation.source, 'default');
    assert.equal(rig.read().userLocation.name.includes('Nanyang Polytechnic'), true);
  }, { navigator: { geolocation: { getCurrentPosition(cb: PositionCallback) { callback = cb; } } }, window: { localStorage: storage } });
});

test('location exports explicitly select data and do not include unrelated storage or unknown properties', () => {
  const place = { id: 'private-place', kind: 'place', name: 'Private place', lat: 1.35, lng: 103.85, token: 'never-export-extra', placeRef: { provider: 'preset', id: 'p', secret: 'never-export-extra' } };
  const entries = new Map([
    [locationService.LOCATION_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, location: { ...place, source: 'selected-place' } })],
    [RECENT_PLACES_KEY, JSON.stringify({ schemaVersion: 2, places: [place] })], ['unrelated', 'never-export-extra'],
  ]);
  const result = locationExport({ getItem: key => entries.get(key) ?? null }, 1000);
  assert.equal(result.location?.name, place.name);
  assert.equal(result.recentPlaces.length, 1);
  assert.equal(result.exportedAt, new Date(1000).toISOString());
  assert.doesNotMatch(JSON.stringify(result), /never-export-extra/);
  assert.throws(() => locationExport({ getItem() { throw new Error('private internal detail'); } }));
});

test('clearing recent places runs after queued writes and reports blocked persistence honestly', async () => {
  let raw: string | null = null;
  let blocked = false;
  const storage = { getItem() { return raw; }, setItem(_key: string, value: string) { if (blocked) throw new Error('blocked'); raw = value; } };
  const store = createRecentPlacesStore(storage, serialLocks());
  await withHook(() => useRecentPlaces(store), async rig => {
    let cleared!: Promise<boolean>;
    await rig.change(() => {
      void rig.read().rememberPlace({ id: 'p', kind: 'place', name: 'Private place', lat: 1.35, lng: 103.85 });
      cleared = rig.read().clearRecentPlaces();
    });
    await rig.change(async () => { assert.equal(await cleared, true); });
    assert.deepEqual(store.read(), { status: 'saved', items: [] });
    await rig.change(() => rig.read().rememberPlace({ id: 'p', kind: 'place', name: 'Private place', lat: 1.35, lng: 103.85 }));
    blocked = true;
    await rig.change(async () => { assert.equal(await rig.read().clearRecentPlaces(), false); });
    assert.deepEqual(rig.read().recentPlaces, []);
  });
});

test('a clear in another tab invalidates this tab’s pending GPS and resets its current location', async () => {
  let callback!: PositionCallback;
  await withHook(useUserLocation, async rig => {
    let pending!: ReturnType<ReturnType<typeof rig.read>['requestGps']>;
    let selected = false;
    await rig.change(() => {
      rig.read().selectLocation({ name: 'Private place', lat: 1.35, lng: 103.85, source: 'gps' });
      pending = rig.read().requestGps(() => { selected = true; });
    });
    await rig.change(() => {
      window.dispatchEvent(Object.assign(new window.Event('storage'), { key: locationService.LOCATION_STORAGE_KEY, newValue: null }));
      callback({ coords: { latitude: 1.35, longitude: 103.85, accuracy: 10 } } as GeolocationPosition);
    });
    assert.deepEqual(await pending, { cancelled: true });
    assert.equal(selected, false);
    assert.equal(rig.read().userLocation.source, 'default');
  }, { navigator: { geolocation: { getCurrentPosition(cb: PositionCallback) { callback = cb; } } } });
  assert.equal(locationService.forgetSavedLocation({ removeItem() { throw new Error('private storage detail'); } }).status, 'session-only');
});
