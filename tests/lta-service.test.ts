import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConfig } from '../config/schema';
import { buildRoute } from '../server/lta/buildRoute';
import { buildNetwork } from '../server/lta/buildNetwork';
import { createDatasetStore } from '../server/lta/datasets';
import type { Datasets, LTABusStop, LTABusRouteRow } from '../server/lta/types';

const stops: LTABusStop[] = [
  { BusStopCode: '10001', Description: 'Start', RoadName: 'East Rd', Latitude: 1.3, Longitude: 103.8 },
  { BusStopCode: '10002', Description: 'Middle', RoadName: 'East Rd', Latitude: 1.3, Longitude: 103.805 },
  { BusStopCode: '10003', Description: 'End', RoadName: 'East Rd', Latitude: 1.3, Longitude: 103.81 },
];
const rows: LTABusRouteRow[] = [
  { ServiceNo: '10A', Operator: 'GAS', Direction: 1, StopSequence: 3, BusStopCode: '10003', Distance: 1.3 },
  { ServiceNo: '10A', Operator: 'GAS', Direction: 1, StopSequence: 1, BusStopCode: '10001', Distance: 0,
    WD_FirstBus: '0530', WD_LastBus: '2400', SAT_FirstBus: '-', SAT_LastBus: '-' },
  { ServiceNo: '10A', Operator: 'GAS', Direction: 1, StopSequence: 2, BusStopCode: '10002', Distance: 0.5 },
  { ServiceNo: '10A', Operator: 'GAS', Direction: 2, StopSequence: 1, BusStopCode: '10003', Distance: 0 },
  { ServiceNo: '10A', Operator: 'GAS', Direction: 2, StopSequence: 2, BusStopCode: '10001', Distance: 1.3 },
];
const data: Datasets = {
  stops: new Map(stops.map((s) => [s.BusStopCode, s])), routes: new Map([['10A', rows]]),
  services: new Map([['10A', { ServiceNo: '10A', Operator: 'GAS', Direction: 1, Category: 'EXPRESS' }]]), loadedAt: 1,
};

test('route mapping preserves ordered directions, public schedules and missing-service behavior', () => {
  const route = buildRoute('10a', data)!;
  assert.equal(route.source, 'LTA_DATAMALL');
  assert.equal(route.operator, 'GAS');
  assert.equal(route.category, 'Express');
  assert.deepEqual(route.direction1.stops.map((s) => s.code), ['10001', '10002', '10003']);
  assert.deepEqual(route.direction1.stops[0].firstLastBus, { weekday: ['0530', '2400'], saturday: null, sunday: null });
  assert.equal(route.direction2?.origin, 'End');
  assert.equal(route.direction2?.destination, 'Start');
  assert.equal(buildRoute('999', data), null);
  // Provider values are validated before they become the shared client/server contract.
  assert.throws(() => buildRoute('10A', { ...data, routes: new Map([['10A', rows.map((r) => ({ ...r, Operator: 'UNKNOWN' }))]]) }), /operator/);
});

test('network serialization preserves stop indexes, road distances and generated-at contract', () => {
  const network = buildNetwork(data, 'fixture-date');
  assert.equal(network.generatedAt, 'fixture-date');
  assert.deepEqual(network.stops[0], ['10001', 'Start', 'East Rd', 1.3, 103.8]);
  assert.deepEqual(network.patterns, [['10A', 1, [0, 1, 2], [0, 5, 8]], ['10A', 2, [2, 0], [0, 13]]]);
  const missingDistance = { ...data, routes: new Map([['10A', rows.map(({ Distance, ...row }) => row)]]) };
  assert.ok(buildNetwork(missingDistance, '').patterns[0][3][1] > 0);
});

test('dataset stores coalesce requests, retain their cache and reload after expiry', async () => {
  let now = 1000;
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return Response.json({ value: [] }); };
  const store = createDatasetStore(createConfig().lta, request, () => now);
  const first = store.getDatasets('fixture');
  assert.equal(store.getDatasets('fixture'), first);
  const loaded = await first;
  assert.equal(await store.getDatasets('fixture'), loaded);
  const firstCalls = calls;
  now += createConfig().lta.datasetTtlMs + 1;
  assert.notEqual(await store.getDatasets('fixture'), loaded);
  assert.equal(calls, firstCalls * 2);
});

test('dataset failures are not cached, and independent store instances do not share data', async () => {
  let failed = true;
  const request: typeof fetch = async () => failed ? new Response('', { status: 401 }) : Response.json({ value: [] });
  const settings = createConfig().lta;
  const a = createDatasetStore(settings, request);
  await assert.rejects(a.getDatasets('fixture'), /401/);
  failed = false;
  const dataA = await a.getDatasets('fixture');
  const dataB = await createDatasetStore(settings, request).getDatasets('fixture');
  assert.notEqual(dataA, dataB);
});
