import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createConfig } from '../config/schema.ts';
import { createArrivalHandler } from '../api/bus-arrival.ts';
import { createArrivalService } from '../server/lta/arrivals.ts';
import { fetchArrivalSnapshot } from '../src/features/arrivals/client';

const nativeFetch = globalThis.fetch;
const stop = '55329';
const providerBody = () => ({ BusStopCode: stop, Services: [{ ServiceNo: '72', Operator: 'GAS', NextBus: {
  EstimatedArrival: new Date(Date.now() + 300000).toISOString(), Monitored: 1,
  Latitude: '1.38', Longitude: '103.85', Load: 'SEA', Type: 'SD', Feature: 'WAB',
} }] });

async function fixture(run: (rig: { origin: string; calls(): number; provider(next: () => Response): void; cooldown(): void }) => Promise<void>) {
  const settings = createConfig({ LTA_ACCOUNT_KEY: 'fixture-key', OUTBOUND_READ_ATTEMPTS: '1', LTA_CIRCUIT_FAILURES: '2' });
  let now = Date.now();
  let calls = 0;
  let provider = () => Response.json(providerBody());
  const service = createArrivalService(settings.lta, { now: () => now, retry: settings.outbound.retry, request: async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).searchParams.get('BusStopCode'), stop);
    assert.ok(init?.signal); assert.equal(init?.redirect, 'error');
    return provider();
  } });
  const handler = createArrivalHandler(service, settings);
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    // Only the browser transport points at loopback. Provider I/O is injected above, never sent externally.
    globalThis.fetch = (input, init) => {
      const target = new URL(String(input), origin);
      assert.equal(target.origin, origin);
      return nativeFetch(target, init);
    };
    await run({ origin, calls: () => calls, provider(next) { provider = next; }, cooldown() { now += settings.lta.circuit.openMs + 1; } });
  } finally {
    globalThis.fetch = nativeFetch;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('HTTP arrival guards reject bad requests before provider work and live responses decode end to end', async () => {
  await fixture(async rig => {
    for (const [path, init, status] of [
      ['?BusStopCode=bad', {}, 400],
      ['?BusStopCode=55329&BusStopCode=55321', {}, 400],
      ['?BusStopCode=55329', { method: 'POST' }, 405],
      ['?BusStopCode=55329', { headers: { Origin: 'https://unapproved.invalid' } }, 403],
    ] as const) {
      const response = await nativeFetch(`${rig.origin}/api/bus-arrival${path}`, init);
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('x-request-id')!, /^[a-f0-9-]{36}$/);
      assert.equal((await response.json()).error, status === 405 ? 'Method not allowed.' : 'Invalid request.');
    }
    assert.equal(rig.calls(), 0);
    const response = await nativeFetch(`${rig.origin}/api/bus-arrival?BusStopCode=${stop}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /s-maxage=15/);
    assert.equal((await response.json()).source, 'LTA_DATAMALL_V3');
    const snapshot = await fetchArrivalSnapshot(stop);
    assert.equal(snapshot.status, 'available');
    if (snapshot.status !== 'available') return;
    assert.equal(snapshot.services[0].serviceNo, '72');
    assert.equal(snapshot.services[0].nextBus?.monitored, true);
    assert.equal(snapshot.services[0].nextBus?.estimatedMinutes, 5);
    assert.equal(rig.calls(), 2);
  });
});

test('malformed provider data degrades safely, trips the breaker and recovers after its cooldown', async () => {
  await fixture(async rig => {
    for (const body of [
      { ...providerBody(), BusStopCode: '55321' },
      { ...providerBody(), Services: [{ ...providerBody().Services[0], NextBus: { EstimatedArrival: 'not-a-date' } }] },
    ]) {
      rig.provider(() => Response.json(body));
      const snapshot = await fetchArrivalSnapshot(stop);
      assert.equal(snapshot.status, 'unavailable');
      assert.equal(snapshot.source, 'FALLBACK_SIMULATED');
    }
    const calls = rig.calls();
    assert.equal(calls, 2);
    const response = await nativeFetch(`${rig.origin}/api/bus-arrival?BusStopCode=${stop}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), null);
    assert.equal((await response.json()).source, 'FALLBACK_SIMULATED');
    assert.equal(rig.calls(), calls); // An open circuit must avoid another provider call.
    rig.provider(() => Response.json({ BusStopCode: stop, Services: [] }));
    rig.cooldown();
    const empty = await fetchArrivalSnapshot(stop);
    assert.equal(empty.status, 'available');
    if (empty.status === 'available') assert.deepEqual(empty.services, []);
    rig.provider(() => Response.json(providerBody()));
    assert.equal((await fetchArrivalSnapshot(stop)).status, 'available');
  });
});
