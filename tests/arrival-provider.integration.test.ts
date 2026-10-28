import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createConfig } from '../config/schema.ts';
import { createArrivalHandler } from '../api/bus-arrival.ts';
import { createArrivalService } from '../server/arrivals/service.ts';
import type { ArrivalProvider } from '../server/arrivals/provider.ts';
import { generateSimulatedLtaResponse } from '../server/lta/simulatedArrivals.ts';
import { fetchArrivalSnapshot } from '../src/features/arrivals/client';

test('a replacement provider works through the unchanged HTTP/client boundaries with honest fallback and safe errors', async () => {
  let mode: 'live' | 'unavailable' | 'defect' = 'live', calls = 0;
  const provider: ArrivalProvider = {
    async fetchArrivals(query) {
      calls++; assert.equal(query.stopCode, '55329');
      if (mode === 'defect') throw new TypeError('PRIVATE_ADAPTER_DEFECT');
      if (mode === 'unavailable') return { status: 'unavailable', reason: 'unavailable' };
      return { status: 'available', body: { BusStopCode: query.stopCode, source: 'LTA_DATAMALL_V3', Services: [{ ServiceNo: '72', Operator: 'GAS', NextBus: {
        EstimatedArrival: new Date(Date.now() + 300000).toISOString(), Load: 'SEA', Type: 'SD', Feature: 'WAB', Monitored: 0,
      } }] } };
    },
  };
  const service = createArrivalService(provider, query => generateSimulatedLtaResponse(query.stopCode, query.serviceNo, Date.now(), 'https://fixture.invalid'));
  const handler = createArrivalHandler(service, createConfig());
  const server = createServer((req, res) => { void handler(req, res); });
  const nativeFetch = globalThis.fetch;
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    globalThis.fetch = (input, init) => nativeFetch(new URL(String(input), origin), init);
    const rejected = await nativeFetch(origin + '/api/bus-arrival?BusStopCode=bad');
    assert.equal(rejected.status, 400); await rejected.arrayBuffer(); assert.equal(calls, 0);
    const live = await fetchArrivalSnapshot('55329');
    assert.equal(live.status, 'available');
    if (live.status === 'available') {
      assert.equal(live.services[0].serviceNo, '72'); assert.equal(live.services[0].nextBus?.monitoring, 'scheduled');
    }
    mode = 'unavailable';
    const simulated = await fetchArrivalSnapshot('55329');
    assert.equal(simulated.status, 'unavailable'); assert.equal(simulated.source, 'FALLBACK_SIMULATED');
    mode = 'defect';
    const failed = await nativeFetch(origin + '/api/bus-arrival?BusStopCode=55329');
    assert.equal(failed.status, 500); assert.doesNotMatch(await failed.text(), /PRIVATE_ADAPTER_DEFECT|TypeError/);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = nativeFetch; server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
