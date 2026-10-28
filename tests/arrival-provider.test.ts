import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConfig } from '../config/schema.ts';
import { createLtaArrivalProvider } from '../server/lta/arrivalProvider.ts';
import { createArrivalService } from '../server/arrivals/service.ts';
import type { ArrivalProvider, ArrivalQuery, LiveArrivalResponse, SimulatedArrivalFactory } from '../server/arrivals/provider.ts';
import { generateSimulatedLtaResponse } from '../server/lta/simulatedArrivals.ts';

const now = Date.parse('2026-10-29T00:00:00Z');
const simulate: SimulatedArrivalFactory = query => generateSimulatedLtaResponse(query.stopCode, query.serviceNo, now, 'https://fixture.invalid');
const live = (serviceNo: string): LiveArrivalResponse => ({ BusStopCode: '55329', Services: [{ ServiceNo: serviceNo, Operator: 'GAS' }], source: 'LTA_DATAMALL_V3' });

test('the same application service accepts independent provider implementations and forwards the complete query', async () => {
  const queries: ArrivalQuery[] = [];
  const alternate: ArrivalProvider = { async fetchArrivals(query) { queries.push(query); return { status: 'available', body: live('72') }; } };
  const second: ArrivalProvider = { async fetchArrivals() { return { status: 'available', body: live('50') }; } };
  const a = createArrivalService(alternate, simulate), b = createArrivalService(second, simulate);
  assert.equal((await a.arrivals('55329', '72')).body.Services[0].ServiceNo, '72');
  assert.equal((await b.arrivals('55329')).body.Services[0].ServiceNo, '50');
  assert.equal((await a.arrivals('55329', '72')).body.Services[0].ServiceNo, '72');
  assert.deepEqual(queries, [{ stopCode: '55329', serviceNo: '72' }, { stopCode: '55329', serviceNo: '72' }]);
});

test('an available empty feed remains live and never invokes the simulated fallback', async () => {
  const body: LiveArrivalResponse = { BusStopCode: '55329', Services: [], source: 'LTA_DATAMALL_V3' };
  const service = createArrivalService({ async fetchArrivals() { return { status: 'available', body }; } }, () => assert.fail('empty live data is not an outage'));
  assert.deepEqual(await service.arrivals('55329'), { kind: 'live', body });
});

test('unavailable reasons reach the simulation policy without a retry or change of query', async () => {
  for (const reason of ['not_configured', 'invalid_response', 'unavailable'] as const) {
    let calls = 0;
    const service = createArrivalService({ async fetchArrivals() { calls++; return { status: 'unavailable', reason }; } }, (query, actualReason) => {
      assert.equal(actualReason, reason); assert.deepEqual(query, { stopCode: '55329', serviceNo: '72' });
      return simulate(query, actualReason);
    });
    const result = await service.arrivals('55329', '72');
    assert.equal(calls, 1); assert.equal(result.kind, 'simulated'); assert.equal(result.body.source, 'FALLBACK_SIMULATED');
  }
});

test('unexpected adapter defects propagate instead of being silently converted to a dependency outage', async () => {
  const failure = new TypeError('adapter defect');
  const service = createArrivalService({ async fetchArrivals() { throw failure; } }, () => assert.fail('must preserve unexpected errors'));
  await assert.rejects(service.arrivals('55329'), error => error === failure);
});

test('the LTA adapter distinguishes missing credentials, malformed data and a valid empty provider feed', async () => {
  const settings = createConfig({ LTA_ACCOUNT_KEY: 'fixture-key' }).lta;
  let calls = 0;
  const missing = createLtaArrivalProvider({ ...settings, accountKey: '' }, { request: async () => { calls++; throw new Error('must not request'); } });
  assert.deepEqual(await missing.fetchArrivals({ stopCode: '55329' }), { status: 'unavailable', reason: 'not_configured' });
  assert.equal(calls, 0);
  const invalid = createLtaArrivalProvider(settings, { request: async () => Response.json({ BusStopCode: '55321', Services: [] }) });
  assert.deepEqual(await invalid.fetchArrivals({ stopCode: '55329' }), { status: 'unavailable', reason: 'invalid_response' });
  const valid = createLtaArrivalProvider(settings, { request: async () => Response.json({ BusStopCode: '55329', Services: [] }) });
  assert.deepEqual(await valid.fetchArrivals({ stopCode: '55329' }), { status: 'available', body: { BusStopCode: '55329', Services: [], source: 'LTA_DATAMALL_V3' } });
});
