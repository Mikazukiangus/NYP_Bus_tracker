import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { parseNetwork, parseRoute, parseShapes } from '../shared/transit/parsers';
import { annotateStopCalls, callIndex } from '../shared/transit/stopCalls';
import { parseLocation } from '../shared/geo/locationValidation';
import { createNetworkRepository } from '../src/features/network/data/networkRepository';
import { buildBusNetwork } from '../src/features/network/domain/buildNetwork';
import { nearestStops } from '../src/features/network/domain/queries';
import { parseBus } from '../src/features/arrivals/decodeArrival';
import { ageBus } from '../src/features/arrivals/domain/snapshot';
import { fetchArrivalSnapshot } from '../src/features/arrivals/client';
import { toggleFavorite, defaultFavorites } from '../src/features/saved/domain/favorites';
import { createFavoritesStore } from '../src/features/saved/data/favoritesStore';
import { favoriteLabels } from '../src/features/saved/domain/labels';
import { loadSavedLocation, saveUserLocation, locationFromGps } from '../src/services/userLocation';
import { placeToLocation, stopToPlace } from '../src/features/places/domain/locations';
import { loadRecentPlaces, saveRecentPlaces } from '../src/features/places/data/recentPlacesStore';
import { legPath } from '../src/services/routeShape';
import { buildAlarmRide } from '../src/features/journey/presentation';
import { buildRoute } from '../server/lta/buildRoute';
import { fetchBusRoute } from '../src/features/tracking/routeRepository';
import type { BusRoute } from '../shared/transit/routes';
import type { Datasets } from '../server/lta/types';

const generatedAt = '2026-10-20T00:00:00Z';
const file = () => ({ generatedAt, stops: [
  ['01001', 'First', 'Road', 1.3, 103.8], ['01002', 'Second', 'Road', 1.31, 103.81],
] as [string, string, string, number, number][], patterns: [['10a', 1, [0, 1, 0, 1], [0, 3, 3, 3]]] as [string, number, number[], number[]][] });
const route = (): BusRoute => ({ serviceNo: '10A', operator: 'SBST', category: 'Trunk', generatedAt, datasetVersion: generatedAt,
  direction1: { origin: 'First', destination: 'Second', stops: file().patterns[0][2].map(i => { const s = file().stops[i]; return { code: s[0], name: s[1], road: s[2], lat: s[3], lng: s[4] }; }), path: [[1.3,103.8],[1.31,103.81],[1.3,103.8],[1.31,103.81]] } });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('network decoder preserves legitimate loop visits, leading zeros and case-normalizes services', () => {
  const parsed = parseNetwork(file())!;
  assert.ok(parsed);
  assert.equal(parsed.stops[0][0], '01001');
  assert.equal(parsed.patterns[0][0], '10A');
  assert.deepEqual(parsed.patterns[0][2], [0,1,0,1]);
  assert.equal(parsed.datasetVersion, generatedAt);
});

test('network decoder rejects broken relationships, invalid fields and unsupported versions', () => {
  const mutations: ((v: ReturnType<typeof file>) => void)[] = [
    v => { v.patterns[0][2][1] = 99999; }, v => { v.patterns[0][2][1] = -1; },
    v => { v.patterns[0][2][1] = 0.5; }, v => { v.patterns[0][3].pop(); },
    v => { v.patterns[0][3][1] = -1; }, v => { v.patterns[0][3][1] = NaN; },
    v => { v.stops[1][0] = v.stops[0][0]; }, v => { v.stops[0][3] = Infinity; },
    v => { v.patterns[0][1] = 3; }, v => { v.generatedAt = 'invalid'; },
    v => { v.patterns.push(v.patterns[0]); },
  ];
  for (const mutate of mutations) { const v = file(); mutate(v); assert.equal(parseNetwork(v), null); }
  assert.equal(parseNetwork({ ...file(), schemaVersion: 99 }), null);
});

test('invalid network cannot poison the cache or reach a nearby query; a subsequent valid response recovers', async () => {
  let calls = 0;
  const invalid = file(); invalid.patterns[0][2][1] = 99999;
  const repository = createNetworkRepository({ url: 'https://fixture.invalid/network', timeoutMs: 1000 }, async () => Response.json(++calls === 1 ? invalid : file()));
  assert.equal(await repository.load(), null);
  const loaded = await repository.load(); assert.ok(loaded);
  assert.doesNotThrow(() => nearestStops(loaded, 1.3, 103.8));
  assert.equal(await repository.load(), loaded);
  assert.equal(calls, 2);
});

test('route decoder enforces requested identity/version, schedules and coordinates and annotates legacy visits', () => {
  const parsed = parseRoute(route(), '10a', generatedAt)!;
  assert.equal(parsed.direction1.stops[2].call?.occurrence, 2);
  assert.equal(parseRoute(route(), '72'), null);
  assert.equal(parseRoute(route(), '10A', 'another-generation'), null);
  assert.equal(parseRoute({ ...route(), schemaVersion: 2 }, '10A'), null);
  const bad = route(); bad.direction1.stops[0].lat = 999;
  assert.equal(parseRoute(bad, '10A'), null);
  const schedule = route(); schedule.direction1.stops[0].firstLastBus = { weekday: ['2960', '9999'], saturday: null, sunday: null };
  assert.equal(parseRoute(schedule, '10A'), null);
  schedule.direction1.stops[0].firstLastBus!.weekday = ['0530','2400'];
  assert.ok(parseRoute(schedule, '10A'));
});

test('route-shape decoder rejects wrong services, invalid coordinates and malformed nested records', () => {
  const shapes = { serviceNo: '10A', shapes: [{ osmId: 42, path: [[1.3, 103.8], [1.31, 103.81]] }] };
  assert.equal(parseShapes(shapes, '10A')?.length, 1);
  assert.equal(parseShapes(shapes, '72'), null);
  assert.equal(parseShapes({ shapes: [{ osmId: 42, path: [[999, 103.8]] }] }, '10A'), null);
  assert.equal(parseShapes({ shapes: [null] }, '10A'), null);
});

test('route loader falls back from wrong static identities and refuses incompatible generations', async () => {
  const requested: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    requested.push(url);
    if (url.includes('/index.json')) return Response.json({ services: ['10A'] });
    return Response.json(url.includes('/api/') ? route() : { ...route(), serviceNo: '72' });
  };
  const recovered = await fetchBusRoute('10A');
  assert.equal(recovered.status, 'ok');
  assert.ok(requested.some(url => url.includes('/api/bus-route')));
  globalThis.fetch = async input => String(input).includes('/index.json')
    ? Response.json({ services: ['10A'] }) : Response.json({ ...route(), datasetVersion: 'different-generation' });
  assert.equal((await fetchBusRoute('10A', generatedAt)).status, 'unavailable');
});

test('absolute arrival instants survive decoding and age with an explicit clock', () => {
  const raw = { EstimatedArrival: '2026-10-20T00:05:00Z', OriginCode: '01001', DestinationCode: '01002', VisitNumber: '2', Load: 'SEA' as const, Type: 'SD' as const, Feature: '' as const, Latitude: '0.0', Longitude: '' };
  const bus = parseBus(raw, Date.parse(generatedAt))!;
  assert.equal(bus.estimatedMinutes, 5);
  assert.equal(ageBus(bus, Date.parse(generatedAt)), bus);
  assert.equal(ageBus(bus, Date.parse(generatedAt) + 120000)?.estimatedMinutes, 3);
  assert.equal(ageBus(bus, Date.parse(generatedAt) + 360000)?.estimatedMinutes, 0);
  assert.equal(bus.estimatedMinutes, 5);
  assert.equal(bus.destinationCode, '01002'); assert.equal(bus.originCode, '01001'); assert.equal(bus.visitNumber, 2);
  assert.equal(bus.position, null); assert.equal(bus.lat, undefined);
  assert.equal(bus.monitoring, 'unknown'); assert.equal(bus.monitored, undefined);
  assert.equal(parseBus({ ...raw, Monitored: 0 })?.monitoring, 'scheduled');
  assert.equal(parseBus({ ...raw, Monitored: 1 })?.monitoring, 'live');
});

test('snapshot keeps different per-bus destinations and distinguishes empty, malformed and simulated responses', async () => {
  const bus = { EstimatedArrival: '2026-10-20T00:05:00Z', Load: 'SEA', Type: 'SD', Feature: '' };
  let body: unknown = { source: 'LTA_DATAMALL_V3', BusStopCode: '01001', Services: [{ ServiceNo: '10A', Operator: 'SBST', NextBus: { ...bus, DestinationCode: '01002' }, NextBus2: { ...bus, DestinationCode: '01003' } }] };
  globalThis.fetch = async () => Response.json(body);
  const result = await fetchArrivalSnapshot('01001');
  assert.equal(result.status, 'available');
  if (result.status !== 'available') return;
  assert.equal(result.services[0].nextBus?.destinationCode, '01002');
  assert.equal(result.services[0].nextBus2?.destinationCode, '01003');
  assert.ok(result.receivedAtMs > 0);
  body = { source: 'LTA_DATAMALL_V3', BusStopCode: '01001', Services: [] };
  const empty = await fetchArrivalSnapshot('01001'); assert.equal(empty.status, 'available');
  body = { invalid: true }; assert.equal((await fetchArrivalSnapshot('01001')).status, 'unavailable');
  body = { source: 'FALLBACK_SIMULATED', BusStopCode: '01001', Services: [] };
  assert.equal((await fetchArrivalSnapshot('01001')).source, 'FALLBACK_SIMULATED');
});

test('stop-call references select later visits and rebase by occurrence rather than stale positions', () => {
  const parsed = parseRoute(route(), '10A')!;
  const later = parsed.direction1.stops[2];
  assert.equal(callIndex(parsed.direction1.stops, later), 2);
  const next = route(); next.datasetVersion = 'next'; next.direction1.stops.unshift({ ...next.direction1.stops[1], code: '01003' });
  const rebased = annotateStopCalls(next);
  assert.equal(callIndex(rebased.direction1.stops, later), 3);
  assert.equal(callIndex(rebased.direction1.stops, { ...later, call: { ...later.call!, occurrence: 9 } }), -1);
});

test('route geometry and alarm slices retain the chosen loop occurrence', () => {
  const parsed = parseRoute(route(), '10A')!;
  const dir = parsed.direction1, board = dir.stops[2], alight = dir.stops[3];
  assert.equal(legPath(dir, board.code, alight.code, board.call, alight.call)?.path.length, 2);
  const ride = buildAlarmRide({ currentRoute: parsed, routeDir: dir, selectedStop: board,
    alightHint: { status: 'alight', stop: alight, stopCount: 1, rideMin: 1, walkM: 0, walkMin: 0, destinationName: 'Second' } });
  assert.equal(ride?.stops.length, 2);
  assert.equal(ride?.stops[0].call?.occurrence, 2);
});

test('favorites distinguish directions/occurrences, normalize case and toggle only the exact identity', () => {
  const initial = defaultFavorites(1), { id, savedAt, ...candidate } = initial[0];
  const second = toggleFavorite(initial, { ...candidate, direction: 2 }, 2);
  assert.equal(second.length, 2);
  assert.deepEqual(toggleFavorite(second, { ...candidate, direction: 2 }, 3), initial);
  assert.equal(toggleFavorite(initial, { ...candidate, occurrence: 2 }, 4).length, 2);
  const mixed = toggleFavorite([], { ...candidate, serviceNo: '10a' }, 2);
  assert.equal(mixed[0].serviceNo, '10A');
  assert.deepEqual(toggleFavorite(mixed, { ...candidate, serviceNo: '10A' }, 3), []);
});

test('favorite storage migrates legacy arrays, deduplicates keys/IDs and preserves versioned empty lists', () => {
  let raw = JSON.stringify([...defaultFavorites(1), ...defaultFavorites(1), { ...defaultFavorites(1)[0], direction: 2 }]);
  const store = createFavoritesStore({ getItem: () => raw, setItem: (_, value) => { raw = value; } });
  const read = store.read(); assert.equal(read.status, 'saved');
  if (read.status !== 'saved') return;
  assert.equal(read.items.length, 2); assert.equal(new Set(read.items.map(i => i.id)).size, 2);
  store.save(read.items); assert.equal(JSON.parse(raw).schemaVersion, 2);
  assert.equal(JSON.parse(raw).items[0].stopName, undefined);
  assert.equal(JSON.parse(raw).items[0].labelSnapshot.stopName, 'Nanyang Poly');
  assert.equal((store.read() as { items: unknown[] }).items.length, 2);
  store.save([]); assert.deepEqual(store.read(), { status: 'saved', items: [] });
  raw = JSON.stringify({ schemaVersion: 999, items: [] });
  assert.equal(store.read().status, 'invalid');
  assert.equal(JSON.parse(raw).schemaVersion, 999); // read never overwrites future records
});

test('favorite labels resolve current stop/terminus data and retain their offline snapshot', () => {
  const net = buildBusNetwork(parseNetwork(file())!);
  const item = { ...defaultFavorites(1)[0], serviceNo: '10A', stopCode: '01001', stopName: 'Old name', destination: 'Old terminus' };
  const resolved = favoriteLabels([item], net)[0];
  assert.equal(resolved.stopName, 'First'); assert.equal(resolved.destination, 'Second');
  assert.equal(item.stopName, 'Old name');
  assert.equal(favoriteLabels([item], null)[0].stopName, 'Old name');
});

test('location migration preserves legacy places/GPS without inventing a capture time', () => {
  const legacy = { name: 'Old GPS name', lat: 1.3, lng: 103.8, isSimulated: false };
  const loaded = loadSavedLocation({ getItem: () => JSON.stringify(legacy) })!;
  assert.equal(loaded.source, 'gps'); assert.equal(loaded.name, 'Your location'); assert.equal(loaded.capturedAtMs, undefined);
  assert.equal(loadSavedLocation({ getItem: () => JSON.stringify({ ...legacy, isSimulated: true }) })?.source, 'selected-place');
  const gps = locationFromGps({ latitude: 1.3, longitude: 103.8, accuracy: 10 }, 123)!;
  assert.equal(gps.capturedAtMs, 123);
  let raw = '';
  saveUserLocation(gps, { setItem: (_, value) => { raw = value; } });
  assert.equal(JSON.parse(raw).schemaVersion, 2);
  assert.deepEqual(loadSavedLocation({ getItem: () => raw }), gps);
  assert.equal(parseLocation({ ...gps, capturedAtMs: -1 }), null);
  assert.equal(loadSavedLocation({ getItem: () => JSON.stringify({ schemaVersion: 999, location: gps }) }), null);
});

test('selected bus stops preserve explicit place references and recent-place legacy storage remains readable', () => {
  const place = stopToPlace({ code: '01001', name: 'First', road: 'Road', lat: 1.3, lng: 103.8 });
  const loc = placeToLocation(place, 123);
  assert.equal(loc.source, 'selected-place'); assert.equal(loc.selectedAtMs, 123); assert.equal(loc.placeRef?.stopCode, '01001');
  assert.equal(parseLocation({ ...loc, placeRef: { ...loc.placeRef, stopCode: 'bad' } }), null);
  let raw = JSON.stringify([place, place]);
  assert.equal(loadRecentPlaces({ getItem: () => raw }).length, 1);
  saveRecentPlaces([place], { setItem: (_, value) => { raw = value; } });
  assert.equal(JSON.parse(raw).schemaVersion, 2);
  assert.deepEqual(loadRecentPlaces({ getItem: () => raw }), [place]);
});

test('server route mapping preserves category provenance and each provider stop sequence/timetable', () => {
  const data: Datasets = { loadedAt: Date.parse(generatedAt), stops: new Map([['01001', { BusStopCode: '01001', Description: 'First', RoadName: 'Road', Latitude: 1.3, Longitude: 103.8 }]]),
    services: new Map([['10A', { ServiceNo: '10A', Direction: 1, Operator: 'SBST', Category: 'SPECIAL' }]]),
    routes: new Map([['10A', [1,2].map((n) => ({ ServiceNo: '10A', Operator: 'SBST', Direction: 1, StopSequence: n * 2, BusStopCode: '01001', WD_FirstBus: n === 1 ? '0530' : '0540', WD_LastBus: '2400' }))]]) };
  const built = buildRoute('10A', data)!;
  assert.equal(built.rawCategory, 'SPECIAL'); assert.equal(built.category, 'Other');
  assert.deepEqual(built.direction1.stops.map(s => s.call?.sequence), [2,4]);
  assert.equal(built.direction1.stops[1].call?.occurrence, 2);
  assert.equal(built.direction1.stops[1].firstLastBus?.weekday?.[0], '0540');
});
