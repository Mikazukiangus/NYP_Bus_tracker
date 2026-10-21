import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { readFileSync } from 'node:fs';
import arrivalHandler from '../api/bus-arrival';
import { parseArrivalResponse } from '../shared/transit/arrivals';
import { createArrivalService } from '../server/lta/arrivals';
import { fetchStopArrivals } from '../src/features/arrivals/client';
import { createConfig } from '../config/schema';

const bus = () => ({ OriginCode: '55509', DestinationCode: '75009', EstimatedArrival: '2026-10-20T10:05:00+08:00', Latitude: '1.379', Longitude: '103.849', VisitNumber: '1', Load: 'SEA', Feature: 'WAB', Type: 'DD', Monitored: 1 });
const body = () => ({ BusStopCode: '55329', Services: [{ ServiceNo: '72', Operator: 'GAS', NextBus: bus() }], source: 'LTA_DATAMALL_V3' });
const parse = (raw: unknown) => parseArrivalResponse(raw, { expectedStopCode: '55329', requireSource: true });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('arrival contract accepts live/scheduled data, zero or absent GPS and complete next-bus records', () => {
  for (const monitored of [0, 1]) {
    const value = body();
    Object.assign(value.Services[0].NextBus, { Monitored: monitored, Latitude: '0.0', Longitude: '' });
    assert.equal(parse(value).ok, true);
  }
  const value = body();
  const parsed = parse({ ...value, Services: [{ ...value.Services[0], NextBus2: bus(), NextBus3: bus() }] });
  assert.equal(parsed.ok, true);
});

test('legitimate absent/null/empty/blank no-bus slots and an empty service list are valid', () => {
  for (const slot of [undefined, null, {}, { ...bus(), EstimatedArrival: '', Load: '', Type: '', Monitored: '' }]) {
    const value = body();
    assert.equal(parse({ ...value, Services: [{ ...value.Services[0], NextBus: slot, NextBus2: {}, NextBus3: null }] }).ok, true);
  }
  assert.equal(parse({ ...body(), Services: [] }).ok, true);
});

test('malformed envelopes, wrong stops and missing/unknown public sources are rejected', () => {
  for (const value of [null, [], 'error', {}, { ...body(), BusStopCode: 55329 }, { ...body(), BusStopCode: '55321' },
    { ...body(), Services: {} }, { ...body(), source: undefined }, { ...body(), source: 'LIVE' }]) assert.equal(parse(value).ok, false);
  // Upstream LTA does not supply our application source field.
  const { source: _source, ...upstream } = body();
  assert.equal(parseArrivalResponse(upstream, { expectedStopCode: '55329' }).ok, true);
});

test('nested service identities and bus enums/types fail with precise field paths', () => {
  const service = body().Services[0];
  for (const row of [null, { ...service, ServiceNo: 72 }, { ...service, Operator: 'UNKNOWN' }]) {
    assert.equal(parse({ ...body(), Services: [row] }).ok, false);
  }
  for (const [field, bad] of [['Load', 'FULL'], ['Type', 'MINIBUS'], ['Feature', true], ['Monitored', '1'], ['Latitude', '1.3junk'], ['Longitude', '181'], ['VisitNumber', 1], ['DestinationCode', 75009]] as const) {
    const result = parse({ ...body(), Services: [{ ...service, NextBus: { ...bus(), [field]: bad } }] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some(issue => issue.path === `Services[0].NextBus.${field}`));
  }
});

test('invalid dates, missing timezones and missing nonempty-bus timestamps cannot become live ETAs', () => {
  const service = body().Services[0];
  for (const date of ['invalid', '2026-02-30T10:00:00+08:00', '2026-10-20T24:00:00+08:00', '2026-10-20T10:05:00', undefined]) {
    assert.equal(parse({ ...body(), Services: [{ ...service, NextBus: { ...bus(), EstimatedArrival: date } }] }).ok, false);
  }
});

test('diagnostics are capped and never echo received values; unknown fields are discarded', () => {
  const secret = 'PRIVATE_BODY_SENTINEL';
  const invalid = parse({ ...body(), Services: Array.from({ length: 20 }, () => ({ ServiceNo: secret, Operator: secret, NextBus: secret })) });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) { assert.equal(invalid.issues.length, 8); assert.ok(!JSON.stringify(invalid.issues).includes(secret)); }
  const valid = parse({ ...body(), AccountKey: secret, Services: [{ ...body().Services[0], secret, NextBus: { ...bus(), secret } }] });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.ok(!JSON.stringify(valid.value).includes(secret));
});

test('invalid upstream JSON/shape/stop/media type falls back with safe validation diagnostics', async () => {
  const settings = createConfig({ LTA_ACCOUNT_KEY: 'fixture-key' }).lta;
  const logs: unknown[] = [];
  for (const response of [Response.json({ ...body(), BusStopCode: '55321' }), Response.json({ ...body(), Services: [null] }), new Response('PRIVATE_BODY_SENTINEL {', { headers: { 'content-type': 'application/json' } }), new Response('PRIVATE_BODY_SENTINEL', { headers: { 'content-type': 'text/html' } })]) {
    const service = createArrivalService(settings, { request: async () => response, logger: { warn: (event, metadata) => logs.push({ event, metadata }), error: () => assert.fail('validation must not log raw parser errors') } });
    const result = await service.arrivals('55329');
    assert.equal(result.kind, 'simulated');
    assert.equal(result.body.source, 'FALLBACK_SIMULATED');
    assert.equal(parse(result.body).ok, true);
    assert.match(result.body.warning ?? '', /invalid arrival data/);
  }
  assert.equal(logs.length, 4);
  assert.ok(JSON.stringify(logs).includes('lta.arrivals_invalid_response'));
  assert.ok(!JSON.stringify(logs).includes('PRIVATE_BODY_SENTINEL'));
});

test('browser rejects malformed nested records before mapping any part of the snapshot', async () => {
  globalThis.fetch = async () => Response.json({ ...body(), Services: [body().Services[0], null] });
  assert.equal(await fetchStopArrivals('55329'), null);
  globalThis.fetch = async () => Response.json({ ...body(), Services: [{ ...body().Services[0], NextBus: { ...bus(), Monitored: '1' } }] });
  assert.equal(await fetchStopArrivals('55329'), null);
});

test('browser turns legitimate blank slots into null estimates, not fabricated arrival times', async () => {
  globalThis.fetch = async () => Response.json({ ...body(), Services: [{ ...body().Services[0], NextBus: {}, NextBus2: { EstimatedArrival: '', Load: '', Type: '', Feature: '' }, NextBus3: null }] });
  const services = await fetchStopArrivals('55329');
  assert.ok(services);
  assert.deepEqual([services[0].nextBus, services[0].nextBus2, services[0].nextBus3], [null, null, null]);
});

test('the documented public JSON example passes the same runtime contract', () => {
  const doc = readFileSync(new URL('../docs/api/bus-arrival.md', import.meta.url), 'utf8');
  const example = /```json\s+([\s\S]*?)```/.exec(doc)?.[1];
  assert.ok(example);
  assert.equal(parse(JSON.parse(example)).ok, true);
});

test('invalid query types and formats fail with 400 before any provider request', async () => {
  globalThis.fetch = async () => assert.fail('invalid query must not reach the provider');
  for (const query of [
    { BusStopCode: 'bad' }, { BusStopCode: ['55329', '55321'] }, { BusStopCode: '55329', ServiceNo: 0 },
    { BusStopCode: '55329', ServiceNo: ['72', '50'] }, { BusStopCode: '55329', ServiceNo: 'PRIVATE_QUERY_SENTINEL' },
  ]) {
    let status = 0;
    let output: unknown;
    await arrivalHandler({ method: 'GET', query }, { status(code: number) { status = code; return this; }, json(body: unknown) { output = body; } });
    assert.equal(status, 400);
    assert.ok(!JSON.stringify(output).includes('PRIVATE_QUERY_SENTINEL'));
  }
});
