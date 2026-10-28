import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import arrival from '../api/bus-arrival';
import route from '../api/bus-route';
import weather from '../api/weather';
import incidents from '../api/traffic-incidents';
import health from '../api/health';
import { validateReadRequest, arrivalQuerySchema, routeQuerySchema, emptyQuerySchema } from '../server/http/request';
import { createConfig } from '../config/schema';
import { createDatasetStore } from '../server/lta/datasets';
import { createLtaClient } from '../server/lta/client';
import { InvalidDependencyResponseError } from '../shared/http/circuitBreaker';
import { parseRouteRows, parseStopRows } from '../server/lta/schemas';
import { createIncidentService } from '../server/lta/incidents';
import { fetchTrafficIncidents } from '../src/features/incidents/client';
import { fetchWeatherSnapshot } from '../src/features/weather/client';
import { parseWeatherSnapshot, weatherKeys } from '../shared/weather/validation';
import { parseStations, parseForecast2h } from '../shared/weather/parsers';
import { createWeatherService } from '../server/weather/service';
import { createOneMapClient } from '../src/features/places/data/oneMapClient';
import { searchPlaces } from '../src/features/places/application/searchPlaces';
import { locationFromGps, saveUserLocation } from '../src/services/userLocation';
import { saveRecentPlaces, loadRecentPlaces } from '../src/features/places/data/recentPlacesStore';
import { createRouteRepository } from '../src/features/tracking/routeRepository';
import { createShapeRepository } from '../src/features/tracking/shapeRepository';
import { parseOverpass } from '../server/overpassSchema';
import { neaFixture } from './fixtures/nea';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function response() {
  let status = 0, body: any;
  const headers: Record<string, string> = {};
  const res = { setHeader(key: string, value: string) { headers[key] = value; }, status(code: number) { status = code; return this; }, json(value: unknown) { body = value; } };
  return { res, read: () => ({ status, body, headers }) };
}
const endpoints = [
  { name: 'arrivals', handler: arrival, query: { BusStopCode: '55329' } },
  { name: 'route', handler: route, query: { ServiceNo: '72' } },
  { name: 'weather', handler: weather, query: {} },
  { name: 'incidents', handler: incidents, query: {} },
  { name: 'health', handler: health, query: {} },
];
for (const endpoint of endpoints) {
  test(`${endpoint.name}: rejects unsupported methods and malformed query/body before any provider request`, async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('must not reach providers'); };
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', undefined, ['GET']]) {
      const check = response();
      await endpoint.handler({ method, query: endpoint.query }, check.res);
      assert.equal(check.read().status, 405);
      assert.equal(check.read().headers.Allow, 'GET, HEAD');
      assert.equal(check.read().headers['Cache-Control'], 'no-store');
    }
    for (const bad of [
      { query: { ...endpoint.query, extra: 'PRIVATE_INPUT_SENTINEL' } }, { query: [] }, { query: 'PRIVATE_INPUT_SENTINEL' },
      { body: '{malformed PRIVATE_INPUT_SENTINEL' }, { body: [] }, { body: { secret: 'PRIVATE_INPUT_SENTINEL' } },
      { headers: { 'Content-Length': '2' } }, { headers: { 'transfer-encoding': 'chunked' } }, { url: 'x'.repeat(2049) },
    ]) {
      const check = response();
      await endpoint.handler({ method: 'GET', query: endpoint.query, ...bad }, check.res);
      assert.equal(check.read().status, 400);
      assert.equal(check.read().headers['Cache-Control'], 'no-store');
      assert.ok(!JSON.stringify(check.read().body).includes('PRIVATE_INPUT_SENTINEL'));
    }
    assert.equal(calls, 0);
  });
}

test('query schemas preserve aliases, leading zeros, service normalization and HEAD; reject repeated/conflicting values', () => {
  for (const method of ['GET', 'HEAD']) {
    const check = response();
    assert.deepEqual(validateReadRequest({ method, url: '/api/BusArrival?busStopCode=01001&serviceNo=10a', query: { busStopCode: '01001', serviceNo: '10a' } }, check.res, arrivalQuerySchema), { BusStopCode: '01001', ServiceNo: '10A' });
    assert.equal(check.read().status, 0);
    assert.deepEqual(validateReadRequest({ method, query: { ServiceNo: ' 72a ' } }, check.res, routeQuerySchema), { ServiceNo: '72A' });
    assert.ok(validateReadRequest({ method, query: {}, body: {}, headers: { 'content-length': '0' } }, check.res, emptyQuerySchema));
  }
  for (const input of [
    { url: '/?BusStopCode=55329&BusStopCode=55329' }, { url: '/?BusStopCode=55329&busStopCode=55329' },
    { query: { BusStopCode: ['55329'] } }, { query: { BusStopCode: { value: '55329' } } }, { query: { BusStopCode: 55329 } },
    { url: '/?BusStopCode=55329', query: { BusStopCode: '01001' } }, { url: '/?BusStopCode=55329', query: { BusStopCode: ['55329'] } },
    { url: '/?BusStopCode=55329&__proto__=PRIVATE_INPUT_SENTINEL' }, { query: { BusStopCode: '55329', ServiceNo: null } },
  ]) {
    const check = response();
    assert.equal(validateReadRequest({ method: 'GET', ...input }, check.res, arrivalQuerySchema), null);
    assert.equal(check.read().status, 400);
    assert.ok(!JSON.stringify(check.read().body).includes('PRIVATE_INPUT_SENTINEL'));
  }
});

test('invalid request diagnostics use bounded schema paths and work with native Node responses', () => {
  const check = response();
  validateReadRequest({ method: 'GET', query: { BusStopCode: 'PRIVATE_INPUT_SENTINEL', ServiceNo: [] } }, check.res, arrivalQuerySchema);
  assert.deepEqual(check.read().body.issues.map((issue: any) => issue.path), ['query.BusStopCode', 'query.ServiceNo']);
  let status = 0, output = '';
  validateReadRequest({ method: 'POST' }, { writeHead(code) { status = code; }, end(value) { output = value; } }, emptyQuerySchema);
  assert.equal(status, 405); assert.equal(JSON.parse(output).error, 'Method not allowed.');
});

test('every public HTTP adapter owns the validation gate before domain/provider calls', () => {
  for (const file of ['bus-arrival', 'bus-route', 'weather', 'traffic-incidents', 'health']) {
    const source = readFileSync(new URL(`../api/${file}.ts`, import.meta.url), 'utf8');
    assert.match(source, /validateReadRequest\(req, res,/);
    assert.ok(!/req\.query|new URL\(req\.url/.test(source));
  }
});

test('invalid LTA page envelopes fail rather than looking like an empty final page', async () => {
  for (const raw of [null, {}, { value: null }, { value: {} }]) {
    const client = createLtaClient({ ...createConfig().lta, pageConcurrency: 1 }, async () => Response.json(raw));
    await assert.rejects(client.fetchAll('BusStops', 'fixture'), error => {
      assert.ok(error instanceof InvalidDependencyResponseError);
      assert.equal(error.message, 'Invalid external data.');
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  const client = createLtaClient(createConfig().lta, async () => new Response('{}'));
  await assert.rejects(client.fetchAll('BusStops', 'fixture'));
});

test('LTA row validation runs before indexes and failed dataset loads remain retryable', async () => {
  let bad = true;
  const row = { BusStopCode: '01001', RoadName: 'Road', Description: 'Stop', Latitude: 1.3, Longitude: 103.8 };
  const request: typeof fetch = async input => Response.json({ value: String(input).includes('BusStops') && String(input).includes('$skip=0') ? [{ ...row, Latitude: bad ? 'PRIVATE_INPUT_SENTINEL' : 1.3 }] : [] });
  const store = createDatasetStore({ ...createConfig().lta, pageConcurrency: 1 }, request);
  await assert.rejects(store.getDatasets('fixture'), error => !String(error).includes('PRIVATE_INPUT_SENTINEL'));
  bad = false;
  assert.equal((await store.getDatasets('fixture')).stops.get('01001')?.Description, 'Stop');
  assert.throws(() => parseStopRows([{ ...row, Latitude: 999 }]));
  assert.throws(() => parseRouteRows([{ ServiceNo: '72', Operator: 'GAS', Direction: 3, StopSequence: 0, BusStopCode: '01001' }]));
});

test('malformed incident providers and public snapshots fail without exposing a partially valid batch', async () => {
  const settings = { ...createConfig().lta, accountKey: 'fixture' };
  const service = createIncidentService(settings, { request: async () => Response.json({ value: [{ Type: 'Roadworks', Latitude: null, Longitude: 103.8, Message: 'PRIVATE_INPUT_SENTINEL' }] }) });
  assert.deepEqual(await service.incidents(), { kind: 'unavailable' });
  globalThis.fetch = async () => Response.json({ incidents: [{ type: {}, lat: 1.3, lng: 103.8, message: 'invalid' }], source: 'LTA_DATAMALL', fetchedAt: new Date().toISOString() });
  assert.equal(await fetchTrafficIncidents(), null);
});

test('weather raw schemas reject malformed nested values and numeric prefixes before mapping', () => {
  const raw = neaFixture();
  assert.ok(parseForecast2h(raw));
  assert.throws(() => parseForecast2h({ ...raw, data: { ...raw.data, items: [null] } }), /^Error: Invalid external data\.$/);
  const station = { id: 'S1', name: 'Station', location: { latitude: 1.3, longitude: 103.8 } };
  const input = (value: unknown) => ({ code: 0, data: { stations: [station], readingUnit: 'deg C', readings: [{ timestamp: '2026-10-21T00:00:00Z', data: [{ stationId: 'S1', value }] }] } });
  assert.equal(parseStations(input('28.2')).stations[0].value, 28.2);
  assert.throws(() => parseStations(input('28.2PRIVATE_INPUT_SENTINEL')), error => !String(error).includes('PRIVATE_INPUT_SENTINEL'));
  assert.equal(parseStations(input(null)).stations.length, 0);
});

test('weather response validation enforces dataset/time/missing relationships and direct fallback stays validated', async () => {
  const blank = { source: 'NEA_DATA_GOV_SG', fetchedAt: {}, missing: [...weatherKeys], stale: [] };
  assert.ok(parseWeatherSnapshot(blank));
  assert.throws(() => parseWeatherSnapshot({ ...blank, temperature: { stations: [] } }));
  assert.throws(() => parseWeatherSnapshot({ ...blank, stale: ['forecast2h'] }));
  let calls = 0;
  globalThis.fetch = async () => Response.json(++calls === 1 ? { source: 'NEA_DATA_GOV_SG', forecast2h: null } : neaFixture());
  const fallback = await fetchWeatherSnapshot();
  assert.equal(calls, 2); assert.equal(fallback.forecast2h?.areas[0].name, 'Ang Mo Kio');
  assert.ok(parseWeatherSnapshot(fallback));
});

test('invalid weather refreshes retain the last validated snapshot rather than poisoning caches', async () => {
  let time = 0, invalid = false;
  const settings = { ...createConfig().weather, apiKey: 'fixture', keyedBudget: 12 };
  const service = createWeatherService(settings, 'https://fixture.invalid', { now: () => time, request: async () => Response.json(invalid ? { code: 0, data: null } : neaFixture()) });
  const first = await service.snapshot(); assert.equal(first.missing.length, 0);
  invalid = true; time += settings.outlookTtlMs + 1;
  const next = await service.snapshot();
  assert.equal(next.stale.length, 12); assert.deepEqual(next.fetchedAt, first.fetchedAt);
  assert.ok(parseWeatherSnapshot(next));
});

test('OneMap validates rows before title casing and invalid/oversized search input never calls the provider', async () => {
  let calls = 0;
  const client = createOneMapClient({ url: 'https://fixture.invalid/search', timeoutMs: 1000 }, async () => {
    calls++; return Response.json({ results: [{ SEARCHVAL: {}, LATITUDE: '1.3', LONGITUDE: '103.8' }] });
  });
  assert.equal(await client.search('test'), null);
  assert.equal(await client.search('a'.repeat(201)), null);
  assert.equal(calls, 1);
  assert.equal((await searchPlaces('a'.repeat(201), null, client.search)).status, 'idle');
  assert.equal(calls, 1);
});

test('invalid route/shape search inputs do not fetch or enter their shared caches', async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; throw new Error('must not fetch'); };
  const routes = createRouteRepository({ freshnessMs: 1000 }, { request });
  const shapes = createShapeRepository({ freshnessMs: 1000 }, { request });
  for (const value of [null, [], {}, '../bad', 'a'.repeat(33)]) {
    assert.equal((await routes.fetchBusRoute(value as string)).status, 'unavailable');
    assert.deepEqual(await shapes.fetchRouteShapes(value as string), []);
  }
  assert.equal(calls, 0);
});

test('GPS and recent/location storage writers reject malformed records before persistence', () => {
  for (const coords of [null, {}, { latitude: 1.3, longitude: 103.8, accuracy: NaN }, { latitude: '1.3', longitude: 103.8, accuracy: 10 }]) assert.equal(locationFromGps(coords), null);
  assert.equal(locationFromGps({ latitude: 1.3, longitude: 103.8, accuracy: 10 }, NaN), null);
  let value = '';
  const storage = { setItem(_key: string, raw: string) { value = raw; }, getItem() { return value; } };
  saveUserLocation({ source: 'gps', lat: NaN, lng: 103.8, name: 'invalid' }, storage);
  assert.equal(value, '');
  saveRecentPlaces([{ id: 'invalid', name: {}, lat: 1.3, lng: 103.8 } as any], storage);
  assert.deepEqual(loadRecentPlaces(storage), []);
});

test('Overpass inputs reject invalid elements before file output or shape logic', () => {
  assert.ok(parseOverpass({ elements: [{ type: 'way', id: 1, geometry: [{ lat: 1.3, lon: 103.8 }] }] }));
  for (const value of [null, { elements: null }, { elements: [null] }, { elements: [{ type: 'way', id: 1, geometry: [{ lat: 999, lon: 103.8 }] }] }]) assert.throws(() => parseOverpass(value));
  const directory = mkdtempSync(join(tmpdir(), 'nyp-overpass-boundary-'));
  const file = join(directory, 'invalid.json');
  try {
    writeFileSync(file, JSON.stringify({ elements: [{ type: 'way', id: 1, geometry: 'PRIVATE_INPUT_SENTINEL' }] }));
    assert.throws(() => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-route-shapes.ts', file], { cwd: new URL('..', import.meta.url), stdio: 'pipe' }), (error: any) => {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr), /"event":"build.shapes_failed"/);
      assert.doesNotMatch(String(error.stderr), /PRIVATE_INPUT_SENTINEL/);
      return true;
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
