import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { useWeatherSnapshot } from '../src/features/weather/useWeatherSnapshot';
import { weatherCatalog } from '../server/weather/catalog';
import { createConfig } from '../config/schema';
import { neaFixture } from './fixtures/nea';
import { useRouteIncidents } from '../src/features/incidents/useRouteIncidents';
import { useSavedBuses } from '../src/features/saved/application/useSavedBuses';
import { createFavoritesStore } from '../src/features/saved/data/favoritesStore';
import { useRecentPlaces } from '../src/features/places/application/useRecentPlaces';
import { useUserLocation } from '../src/features/location/useUserLocation';
import { useGetOffAlarm } from '../src/services/useGetOffAlarm';
import { alarmStatus } from '../src/components/GetOffAlarm';
import type { WeatherSnapshot } from '../src/types/weather';

type Rig<T> = { read(): T; change(action: () => void | Promise<unknown>): Promise<void>; poll(ms: number): Promise<void> };
async function withHook<T>(hook: () => T, run: (rig: Rig<T>) => Promise<void>, overrides: Record<string, unknown> = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  const callbacks = new Map<number, () => unknown>();
  const patches: Record<string, unknown> = { window, document, navigator: {}, IS_REACT_ACT_ENVIRONMENT: true,
    setInterval(fn: () => unknown, delay: number) { callbacks.set(delay, fn); return delay; },
    clearInterval(id: number) { callbacks.delete(id); }, ...overrides };
  const descriptors = new Map(Object.keys(patches).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(patches)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(document.getElementById('root')! as unknown as HTMLElement);
  let value: T;
  function Harness() { value = hook(); return null; }
  const change = async (action: () => void | Promise<unknown>) => { await act(async () => { await action(); }); };
  try {
    await change(() => root.render(createElement(Harness)));
    await run({ read: () => value!, change, poll: ms => change(async () => { await callbacks.get(ms)?.(); }) });
  } finally {
    await change(() => root.unmount());
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function freshWeather() {
  const snapshot: WeatherSnapshot = { fetchedAt: {}, missing: [], stale: [], source: 'NEA_DATA_GOV_SG' };
  for (const d of weatherCatalog(createConfig().weather, Date.now)) {
    (snapshot as any)[d.key] = d.parse(neaFixture());
    snapshot.fetchedAt[d.key] = new Date().toISOString();
  }
  return snapshot;
}
const stop = { code: '54351', name: 'NYP', road: 'AMK', lat: 1.38, lng: 103.85 };
const ride = { key: 'fixture', serviceNo: '50', stops: [stop, { ...stop, code: '54359', lat: 1.384 }] };
const path: [number, number][] = [[1.38, 103.85], [1.39, 103.86]];

test('weather hook retains data, discloses failure, coalesces refreshes and recovers fresh flags', async () => {
  let failing = false, calls = 0;
  await withHook(useWeatherSnapshot, async rig => {
    assert.ok(rig.read().weatherSnapshot);
    assert.deepEqual(rig.read().weatherSnapshot!.stale, []);
    failing = true;
    await rig.change(async () => { await Promise.all([rig.read().loadWeather(), rig.read().loadWeather()]); });
    assert.equal(calls, 3); // initial API, failed API, failed direct fallback
    assert.equal(rig.read().weatherError, true);
    assert.equal(rig.read().weatherSnapshot!.stale.length, 12);
    failing = false;
    await rig.change(() => rig.read().loadWeather());
    assert.equal(rig.read().weatherError, false);
    assert.deepEqual(rig.read().weatherSnapshot!.stale, []);
  }, { fetch: async () => { calls++; return failing ? new Response('', { status: 503 }) : Response.json(freshWeather()); } });
});

test('incident hook distinguishes initial outage, current empty feed, retained stale data and recovery', async () => {
  let status = 503, items: unknown[] = [];
  await withHook(() => useRouteIncidents(path), async rig => {
    assert.equal(rig.read().status, 'unavailable');
    assert.equal(rig.read().fetchedAt, null);
    status = 200;
    await rig.poll(180000);
    assert.equal(rig.read().status, 'ready');
    assert.deepEqual(rig.read().incidents, []);
    items = [{ type: 'Roadworks', lat: 1.38, lng: 103.85, message: 'fixture' }];
    await rig.poll(180000);
    status = 503;
    await rig.poll(180000);
    assert.equal(rig.read().status, 'stale');
    assert.equal(rig.read().incidents.length, 1);
    assert.ok(rig.read().fetchedAt);
    status = 200; items = [];
    await rig.poll(180000);
    assert.equal(rig.read().status, 'ready');
    assert.deepEqual(rig.read().incidents, []);
  }, { fetch: async () => Response.json(status === 200 ? { incidents: items, fetchedAt: new Date().toISOString(), source: 'LTA_DATAMALL' } : {}, { status }) });
});

test('favorites, recent places and location hooks report session-only changes and clear notices after persistence recovers', async () => {
  let denied = true, raw = '[]';
  const storage = { getItem: () => raw, setItem(_key: string, value: string) { if (denied) throw new Error('private storage'); raw = value; } };
  const favorites = createFavoritesStore(storage);
  await withHook(() => useSavedBuses('50', stop, 2, 'Destination', favorites), async rig => {
    await rig.change(() => rig.read().handleToggleFavorite());
    assert.equal(rig.read().isCurrentFavorite, true);
    assert.equal(rig.read().persistence, 'session-only');
    assert.deepEqual(favorites.read(), { status: 'saved', items: [] });
    denied = false;
    await rig.change(() => rig.read().handleToggleFavorite());
    assert.equal(rig.read().persistence, 'saved');
  });
  await withHook(() => useRecentPlaces({ load: () => [], save: () => ({ status: denied ? 'session-only' : 'saved' }) }), async rig => {
    denied = true;
    await rig.change(() => rig.read().rememberPlace({ id: 'nyp', kind: 'place', name: 'NYP', lat: 1.38, lng: 103.85 }));
    assert.equal(rig.read().persistence, 'session-only');
    assert.equal(rig.read().recentPlaces.length, 1);
  });
  await withHook(useUserLocation, async rig => {
    const window = globalThis.window;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    await rig.change(() => rig.read().selectLocation({ ...stop, source: 'selected-place' }));
    assert.equal(rig.read().persistence, 'session-only');
    assert.equal(rig.read().userLocation.name, 'NYP');
    denied = false;
    await rig.change(() => rig.read().selectLocation({ ...stop, source: 'selected-place' }));
    assert.equal(rig.read().persistence, 'saved');
  });
});

test('alarm constructor/audio and wake-lock failures preserve visual alerts with explicit limitations', async () => {
  await withHook(() => useGetOffAlarm(ride), async rig => {
    assert.doesNotMatch(alarmStatus(rig.read(), '50', 'Destination'), /screen stays on/);
    await rig.change(() => rig.read().toggle());
    assert.equal(rig.read().on, true);
    assert.equal(rig.read().sound, 'unavailable');
    assert.equal(rig.read().screen, 'unavailable');
    const message = alarmStatus(rig.read(), '50', 'Destination');
    assert.match(message, /Sound unavailable/);
    assert.match(message, /Screen may turn off/);
    assert.doesNotMatch(message, /private/);
  }, {
    AudioContext: class { constructor() { throw new Error('private audio constructor'); } },
    navigator: { geolocation: { watchPosition() { return 1; }, clearWatch() {} }, wakeLock: { request: async () => { throw new Error('private wake lock'); } } },
  });
});

test('alarm ignores late audio completion from an old activation and tracks loss of a held screen lock', async () => {
  const resumes: ReturnType<typeof deferred<void>>[] = [];
  let ctx: FakeAudio;
  class FakeAudio {
    state = 'suspended'; onstatechange: (() => void) | null = null;
    constructor() { ctx = this; }
    resume() { const result = deferred<void>(); resumes.push(result); return result.promise; }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  class Lock extends EventTarget {
    released = false;
    release() { this.released = true; this.dispatchEvent(new Event('release')); return Promise.resolve(); }
  }
  let lock = new Lock();
  await withHook(() => useGetOffAlarm(ride), async rig => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await rig.change(() => rig.read().toggle());
    assert.equal(rig.read().screen, 'active');
    await rig.change(() => rig.read().toggle());
    await rig.change(() => rig.read().toggle());
    assert.equal(rig.read().screen, 'active');
    await rig.change(() => resumes[0].reject(new Error('old failure')));
    assert.equal(rig.read().sound, 'starting');
    await rig.change(() => { ctx!.state = 'running'; resumes[1].resolve(); });
    assert.equal(rig.read().sound, 'ready');
    await rig.change(() => { ctx!.state = 'suspended'; ctx!.onstatechange?.(); });
    assert.equal(rig.read().sound, 'unavailable');
    await rig.change(() => lock.release());
    assert.equal(rig.read().screen, 'unavailable');
  }, { AudioContext: FakeAudio, navigator: { geolocation: { watchPosition() { return 1; }, clearWatch() {} }, wakeLock: { request: async () => { lock = new Lock(); return lock; } } } });
});

test('alarm still displays the get-off alert if vibration and beep fail during a GPS update', async () => {
  let fix!: PositionCallback;
  class FakeAudio {
    state = 'running'; onstatechange = null;
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createOscillator() { throw new Error('private output failure'); }
  }
  await withHook(() => useGetOffAlarm(ride), async rig => {
    await rig.change(() => rig.read().toggle());
    await rig.change(() => fix({ coords: { latitude: 1.3835, longitude: 103.85, accuracy: 5 } } as GeolocationPosition));
    assert.equal(rig.read().alert, 'get-off');
    assert.equal(rig.read().on, false);
    assert.equal(rig.read().sound, 'unavailable');
    assert.equal(rig.read().vibration, 'unavailable');
  }, { AudioContext: FakeAudio, navigator: { vibrate() { throw Error('private vibration'); }, geolocation: { watchPosition(cb: PositionCallback) { fix = cb; return 1; }, clearWatch() {} } } });
});

test('a wake lock granted after turning the alarm off is released instead of reporting success', async () => {
  const pending = deferred<WakeLockSentinel>();
  let releases = 0;
  await withHook(() => useGetOffAlarm(ride), async rig => {
    await rig.change(() => rig.read().toggle());
    assert.equal(rig.read().screen, 'requesting');
    await rig.change(() => rig.read().toggle());
    await rig.change(() => pending.resolve({ release: async () => { releases++; } } as unknown as WakeLockSentinel));
    assert.equal(releases, 1);
    assert.equal(rig.read().screen, 'idle');
    assert.equal(rig.read().on, false);
  }, { AudioContext: undefined, navigator: { geolocation: { watchPosition() { return 1; }, clearWatch() {} }, wakeLock: { request: () => pending.promise } } });
});
