import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchStopArrivals } from '../src/services/busTrackerService';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const response = (override = {}) => ({
  source: 'LTA_DATAMALL_V3', BusStopCode: '55329',
  Services: [{ ServiceNo: '72', Operator: 'GAS', NextBus: {
    EstimatedArrival: new Date(Date.now() + 5 * 60000).toISOString(),
    Monitored: 0, Latitude: '0.0', Longitude: '0.0', Load: 'SEA', Type: 'SD', Feature: 'WAB',
  } }],
  ...override,
});

test('preserves the requested service and scheduled/GPS distinction', async () => {
  globalThis.fetch = async () => Response.json(response());
  const services = await fetchStopArrivals('55329');
  assert.equal(services?.[0].serviceNo, '72');
  assert.equal(services?.[0].nextBus?.monitored, false);
  assert.equal(services?.[0].nextBus?.estimatedMinutes, 5);
  assert.equal(services?.[0].nextBus2, null);
});

test('a response for another stop must never supply current-stop arrivals', async () => {
  globalThis.fetch = async () => Response.json(response({ BusStopCode: '55321' }));
  assert.equal(await fetchStopArrivals('55329'), null);
});

test('server simulations are not accepted as live data', async () => {
  globalThis.fetch = async () => Response.json(response({ source: 'FALLBACK_SIMULATED' }));
  assert.equal(await fetchStopArrivals('55329'), null);
});

test('invalid timestamps give no estimate instead of an invented 99-minute ETA', async () => {
  const body = response();
  body.Services[0].NextBus.EstimatedArrival = 'invalid';
  globalThis.fetch = async () => Response.json(body);
  assert.equal((await fetchStopArrivals('55329'))?.[0].nextBus, null);
});

test('empty live services are different from an unavailable feed', async () => {
  globalThis.fetch = async () => Response.json(response({ Services: [] }));
  assert.deepEqual(await fetchStopArrivals('55329'), []);
  globalThis.fetch = async () => new Response('', { status: 502 });
  assert.equal(await fetchStopArrivals('55329'), null);
});
