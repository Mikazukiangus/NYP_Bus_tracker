import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConfig } from '../config/schema';
import { createArrivalService } from '../server/lta/arrivals';
import { createIncidentService } from '../server/lta/incidents';

const now = Date.parse('2026-10-20T01:00:00Z');
const settings = createConfig({ LTA_ACCOUNT_KEY: 'fixture-key', LTA_API_BASE_URL: 'https://fixture.test/lta' }).lta;

test('arrival service sends injected credentials/filter and marks real provider data explicitly', async () => {
  const service = createArrivalService(settings, { request: async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/lta/v3/BusArrival');
    assert.equal(url.searchParams.get('BusStopCode'), '55329');
    assert.equal(url.searchParams.get('ServiceNo'), '72');
    assert.equal(new Headers(init?.headers).get('AccountKey'), 'fixture-key');
    return Response.json({ BusStopCode: '55329', Services: [] });
  } });
  assert.deepEqual(await service.arrivals('55329', '72'), { kind: 'live', body: { BusStopCode: '55329', Services: [], source: 'LTA_DATAMALL_V3' } });
});

test('missing credentials skip provider calls; simulations retain wire fields and an injected clock', async () => {
  const service = createArrivalService({ ...settings, accountKey: '' }, { now: () => now, request: async () => { throw Error('must not request'); } });
  const result = await service.arrivals('55329', '72a');
  assert.equal(result.kind, 'simulated');
  assert.equal(result.body.source, 'FALLBACK_SIMULATED');
  assert.equal(result.body.Services[0].ServiceNo, '72A');
  const firstBus = result.body.Services[0].NextBus;
  assert.ok(firstBus?.EstimatedArrival);
  assert.ok(Date.parse(firstBus.EstimatedArrival) >= now);
  assert.deepEqual((await service.arrivals('55329', '72a')).body, result.body);
});

test('provider HTTP errors log only status and fall back without reading an error body', async () => {
  const logs: unknown[] = [];
  const service = createArrivalService(settings, { now: () => now,
    request: async () => new Response('provider-private-body', { status: 401 }),
    logger: { warn: (event, metadata) => logs.push({ event, metadata }), error() {} },
  });
  assert.equal((await service.arrivals('55329')).kind, 'simulated');
  assert.deepEqual(logs, [{ event: 'lta.arrivals_http_error', metadata: { status: 401 } }]);
  const timeout = createArrivalService(settings, { now: () => now, request: async () => { throw new DOMException('timed out', 'TimeoutError'); } });
  assert.equal((await timeout.arrivals('55329')).body.source, 'FALLBACK_SIMULATED');
});

test('incident service normalizes valid locations and returns its injected timestamp/source', async () => {
  const service = createIncidentService(settings, { now: () => now, request: async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('AccountKey'), 'fixture-key');
    return Response.json({ value: [
      { Type: 'Roadworks', Latitude: 1.38, Longitude: 103.85, Message: 'Lane closed' },
      { Type: 'Broken', Latitude: null, Longitude: 103.85, Message: 'Invalid position' },
    ] });
  } });
  assert.deepEqual(await service.incidents(), { kind: 'ok', body: { incidents: [{ type: 'Roadworks', lat: 1.38, lng: 103.85, message: 'Lane closed' }], fetchedAt: new Date(now).toISOString(), source: 'LTA_DATAMALL' } });
});

test('incident service distinguishes missing credentials from upstream failures and valid empty data', async () => {
  const noKey = createIncidentService({ ...settings, accountKey: '' }, { request: async () => { throw Error('must not request'); } });
  assert.deepEqual(await noKey.incidents(), { kind: 'not_configured' });
  const failure = createIncidentService(settings, { request: async () => new Response('', { status: 503 }) });
  assert.deepEqual(await failure.incidents(), { kind: 'unavailable' });
  const empty = createIncidentService(settings, { request: async () => Response.json({ value: [] }), now: () => now });
  const result = await empty.incidents();
  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') assert.deepEqual(result.body.incidents, []);
});
