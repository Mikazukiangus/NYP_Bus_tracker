import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createLtaClient } from '../server/lta/client';
import { createConfig } from '../config/schema';
const { fetchAll } = createLtaClient(createConfig().lta);

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// A dataset of 1,200 rows served 500 at a time, as LTA DataMall does; fail(skip, call) can answer a page with an error
function serve(fail: (skip: number, call: number) => number | null = () => null) {
  const calls = new Map<number, number>();
  globalThis.fetch = (async (url: string) => {
    const skip = Number(new URL(url).searchParams.get('$skip'));
    const call = (calls.get(skip) ?? 0) + 1;
    calls.set(skip, call);
    const status = fail(skip, call);
    if (status) return new Response('error', { status });
    const value = Array.from({ length: Math.max(0, Math.min(500, 1200 - skip)) }, (_, i) => ({ n: skip + i }));
    return new Response(JSON.stringify({ value }), { status: 200 });
  }) as typeof fetch;
  return calls;
}

test('a page LTA answers with a server error is asked for again', async () => {
  const calls = serve((skip, call) => (skip === 500 && call < 3 ? 500 : null));
  const rows = await fetchAll<{ n: number }>('BusStops', 'key', 0);
  assert.equal(rows.length, 1200);
  assert.deepEqual(rows.slice(498, 502).map((r) => r.n), [498, 499, 500, 501]);
  assert.equal(calls.get(500), 3);
});

test('a page after the end of the data failing does not lose the data', async () => {
  serve((skip) => (skip === 3000 ? 500 : null)); // the build's "BusStops skip=5500 failed (500)", in small
  const rows = await fetchAll('BusStops', 'key', 0);
  assert.equal(rows.length, 1200);
});

test('a page of the data that keeps failing, or a refused key, still fails the load', async () => {
  serve((skip) => (skip === 500 ? 503 : null));
  await assert.rejects(fetchAll('BusStops', 'key', 0), /skip=500 failed \(503\)/);

  const calls = serve(() => 401);
  await assert.rejects(fetchAll('BusStops', 'key', 0), /failed \(401\)/);
  assert.equal(calls.get(0), 1); // not retried
});
