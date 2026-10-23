import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConfig, createPublicConfig } from '../config/schema';
import { backoffMs, fetchReadWithBackoff, retryAfterMs, RetryableNetworkError, waitForRetry } from '../shared/http/readRetry';
import { createSafeFetcher, SsrfBlockedError } from '../security/ssrf';
import { createArrivalService } from '../server/lta/arrivals';
import { createIncidentService } from '../server/lta/incidents';
import { createLtaClient } from '../server/lta/client';
import { fetchOverpassQuery } from '../server/overpassClient';

const url = 'https://fixture.example/data';
const fast = { attempts: 3, baseDelayMs: 100, maxDelayMs: 1000 };
const init = () => ({ signal: AbortSignal.timeout(5000) });

test('read retry uses exponential equal jitter with a cap and releases discarded bodies', async () => {
  let calls = 0, cancelled = 0;
  const delays: number[] = [];
  const request: typeof fetch = async () => ++calls < 4
    ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 503 })
    : Response.json({ ok: true });
  const response = await fetchReadWithBackoff(request, url, init(), { ...fast, attempts: 4 }, {
    random: () => 0, wait: async ms => { delays.push(ms); },
  });
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(delays, [50, 100, 200]);
  assert.equal(cancelled, 3);
  assert.equal(backoffMs(8, 100, 1000, () => 1), 1000);
  assert.equal(backoffMs(1, 100, 1000, () => 0), 50);
  assert.equal(backoffMs(1, 0, 1000), 0);
});

test('Retry-After seconds and HTTP dates set a minimum; excessive hints skip retry', async () => {
  const now = Date.parse('2026-10-23T01:00:00Z');
  assert.equal(retryAfterMs('2', now), 2000);
  assert.equal(retryAfterMs(new Date(now + 3000).toUTCString(), now), 3000);
  assert.equal(retryAfterMs(new Date(now - 1000).toUTCString(), now), 0);
  assert.equal(retryAfterMs('Friday, 23-Oct-26 01:00:01 GMT', now), 1000);
  assert.equal(retryAfterMs('Fri Oct 23 01:00:01 2026', now), 1000);
  assert.equal(retryAfterMs('0.5', now), null);
  assert.equal(retryAfterMs('garbage', now), null);
  for (const hint of ['1', new Date(now + 1000).toUTCString()]) {
    let calls = 0;
    const waits: number[] = [];
    await fetchReadWithBackoff(async () => ++calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': hint } }) : Response.json({}), url, init(), fast, {
      now: () => now, random: () => 0, wait: async ms => { waits.push(ms); },
    });
    assert.deepEqual(waits, [1000]);
    assert.equal(calls, 2);
  }
  for (const hint of ['120', '9'.repeat(100), new Date(now + 120000).toUTCString()]) {
    let calls = 0;
    const response = await fetchReadWithBackoff(async () => { calls++; return new Response('', { status: 503, headers: { 'Retry-After': hint } }); }, url, init(), fast, { now: () => now, wait: async () => assert.fail('must not shorten Retry-After') });
    assert.equal(response.status, 503);
    assert.equal(calls, 1);
  }
});

test('only explicitly transient HTTP failures retry; auth, client, redirect and permanent server failures do not', async () => {
  for (const status of [408, 429, 500, 502, 503, 504, 400, 401, 403, 404, 409, 422, 301, 501, 505]) {
    let calls = 0;
    await fetchReadWithBackoff(async () => { calls++; return new Response('', { status }); }, url, init(), { ...fast, baseDelayMs: 0 }, { wait: async () => {} });
    assert.equal(calls, [408, 429, 500, 502, 503, 504].includes(status) ? 3 : 1, String(status));
  }
});

test('POST, PUT, PATCH, DELETE and requests carrying a body never automatically replay', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'GET']) {
    let calls = 0;
    await fetchReadWithBackoff(async () => { calls++; return new Response('', { status: 503 }); }, url, { ...init(), method, body: 'operation' }, fast);
    assert.equal(calls, 1, method);
  }
  let calls = 0;
  const request = new Request(url, { method: 'POST', body: 'operation' });
  await assert.rejects(fetchReadWithBackoff(async () => { calls++; throw new TypeError('opaque failure'); }, request, init(), fast));
  assert.equal(calls, 1);
  calls = 0;
  await fetchReadWithBackoff(async () => { calls++; return new Response(null, { status: calls === 1 ? 503 : 200 }); }, new Request(url, { method: 'HEAD' }), init(), fast, { wait: async () => {} });
  assert.equal(calls, 2);
});

test('parsing/validation and permanent errors are not treated as transport retries', async () => {
  for (const error of [new Error('configuration'), new SyntaxError('invalid'), new SsrfBlockedError(), new DOMException('expired', 'TimeoutError'), new DOMException('cancelled', 'AbortError')]) {
    let calls = 0;
    await assert.rejects(fetchReadWithBackoff(async () => { calls++; throw error; }, url, init(), fast), candidate => candidate === error);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const response = await fetchReadWithBackoff(async () => { calls++; return new Response('{', { headers: { 'Content-Type': 'application/json' } }); }, url, init(), fast);
  await assert.rejects(response.json(), SyntaxError);
  assert.equal(calls, 1);
});

test('recognized network failure recovers within the attempt cap, while disabled retries make one call', async () => {
  for (const error of [new RetryableNetworkError(), new TypeError('browser opaque network failure')]) {
    let calls = 0;
    const r = await fetchReadWithBackoff(async () => { if (++calls === 1) throw error; return Response.json({}); }, url, init(), fast, { wait: async () => {} });
    assert.equal(r.status, 200); assert.equal(calls, 2);
  }
  let calls = 0;
  await assert.rejects(fetchReadWithBackoff(async () => { calls++; throw new RetryableNetworkError(); }, url, init(), { ...fast, attempts: 1 }));
  assert.equal(calls, 1);
});

test('cancellation before work and during backoff stops immediately without a later attempt', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchReadWithBackoff(async () => assert.fail('cancelled request'), url, { signal: controller.signal }, fast), { name: 'AbortError' });
  const active = new AbortController();
  let calls = 0;
  const waiting = fetchReadWithBackoff(async () => { calls++; return new Response('', { status: 503 }); }, url, { signal: active.signal }, fast, {
    wait: async (ms, signal) => { queueMicrotask(() => active.abort()); return waitForRetry(ms, signal); },
  });
  await assert.rejects(waiting, { name: 'AbortError' });
  assert.equal(calls, 1);
  await assert.rejects(waitForRetry(10, controller.signal), { name: 'AbortError' });
});

test('the same total deadline spans all attempts and backoff instead of resetting per attempt', async () => {
  const signal = AbortSignal.timeout(40);
  let calls = 0;
  const started = Date.now();
  await assert.rejects(fetchReadWithBackoff(async (_input, options) => {
    assert.equal(options?.signal, signal);
    calls++;
    if (calls === 1) return new Response('', { status: 503 });
    await waitForRetry(1000, signal);
    return Response.json({});
  }, url, { signal }, { attempts: 3, baseDelayMs: 10, maxDelayMs: 10 }), { name: 'TimeoutError' });
  assert.equal(calls, 2);
  assert.ok(Date.now() - started < 800);
  calls = 0;
  await assert.rejects(fetchReadWithBackoff(async () => {
    calls++; return new Response('', { status: 429, headers: { 'Retry-After': '1' } });
  }, url, { signal: AbortSignal.timeout(30) }, fast), { name: 'TimeoutError' });
  assert.equal(calls, 1);
});

test('guarded server fetch marks transient sockets only, retaining SSRF/TLS/redirect refusals and safe errors', async () => {
  const native = globalThis.fetch;
  const client = createSafeFetcher();
  try {
    for (const [code, attempts] of [['ECONNRESET', 3], ['UND_ERR_CONNECT_TIMEOUT', 3], ['CERT_HAS_EXPIRED', 1], ['ERR_TLS_CERT_ALTNAME_INVALID', 1]] as const) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; throw new TypeError('private upstream details', { cause: Object.assign(new Error('private cause'), { code }) }); };
      await assert.rejects(fetchReadWithBackoff(client.fetch, url, init(), fast, { wait: async () => {} }), error => {
        assert.ok(error instanceof Error); assert.ok(!error.message.includes('private')); assert.equal(error.cause, undefined); return true;
      });
      assert.equal(calls, attempts, code);
    }
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('', { status: 302 }); };
    await assert.rejects(fetchReadWithBackoff(client.fetch, url, init(), fast), SsrfBlockedError);
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(fetchReadWithBackoff(client.fetch, 'http://127.0.0.1', init(), fast), SsrfBlockedError);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = native; await client.close(); }
});

test('live LTA provider reads recover once without retrying invalid data or 401', async () => {
  const settings = createConfig({ LTA_ACCOUNT_KEY: 'fixture' }).lta;
  const retry = { attempts: 2, baseDelayMs: 0, maxDelayMs: 0 };
  let calls = 0;
  const service = createArrivalService(settings, { retry, request: async () => ++calls === 1 ? new Response('', { status: 503 }) : Response.json({ BusStopCode: '55329', Services: [] }) });
  assert.equal((await service.arrivals('55329')).kind, 'live'); assert.equal(calls, 2);
  for (const response of [() => new Response('', { status: 401 }), () => Response.json({ wrong: true })]) {
    calls = 0;
    const bad = createArrivalService(settings, { retry, request: async () => { calls++; return response(); } });
    assert.equal((await bad.arrivals('55329')).kind, 'simulated'); assert.equal(calls, 1);
  }
  calls = 0;
  const incidents = createIncidentService(settings, { retry, request: async () => ++calls === 1 ? new Response('', { status: 502 }) : Response.json({ value: [] }) });
  assert.equal((await incidents.incidents()).kind, 'ok'); assert.equal(calls, 2);
});

test('LTA pages use one total page deadline and stop immediately on an excessive Retry-After', async () => {
  let calls = 0;
  const settings = { ...createConfig().lta, pageConcurrency: 1, retryDelayMs: 0 };
  const lta = createLtaClient(settings, async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '3600' } }); });
  await assert.rejects(lta.fetchAll('BusStops', 'fixture'), /failed \(429\)/);
  assert.equal(calls, 1);
});

test('retry configuration bounds and relative budgets are validated centrally', () => {
  const config = createConfig();
  assert.deepEqual(config.outbound.retry, { attempts: 2, baseDelayMs: 250, maxDelayMs: 2000 });
  assert.deepEqual(config.public.retry, config.outbound.retry);
  for (const env of [{ OUTBOUND_READ_ATTEMPTS: '0' }, { VITE_READ_ATTEMPTS: '4' }, { OUTBOUND_RETRY_BASE_MS: '3000' }, { VITE_RETRY_BASE_MS: '3000' }, { LTA_PAGE_RETRY_MAX_MS: '1' }]) assert.throws(() => createConfig(env));
  assert.throws(() => createPublicConfig({ VITE_RETRY_BASE_MS: '3000' }));
  assert.equal(createConfig({ OUTBOUND_READ_ATTEMPTS: '1', VITE_READ_ATTEMPTS: '1' }).outbound.retry.attempts, 1);
});

const shapesSettings = () => ({ ...createConfig().shapes, instances: [url], retryPauseMs: 100 });
const query = '[out:json];node(1);out;';
test('Overpass read-only POST retries transient failures with jitter, Retry-After and bounded rounds', async () => {
  let calls = 0, time = 100000;
  const delays: number[] = [];
  const response = await fetchOverpassQuery(shapesSettings(), query, {
    now: () => time, random: () => 0, wait: async ms => { delays.push(ms); time += ms; },
    request: async (_input, options) => {
      assert.equal(options?.method, 'POST'); assert.equal(new URLSearchParams(String(options?.body)).get('data'), query);
      assert.ok(options?.signal); assert.ok((options?.timeoutMs ?? 0) <= shapesSettings().timeoutMs);
      return ++calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '2' } }) : Response.json({ elements: [] });
    },
  });
  assert.deepEqual(response, { elements: [] }); assert.equal(calls, 2); assert.deepEqual(delays, [2000]);
  calls = 0; time = 0; delays.length = 0;
  await assert.rejects(fetchOverpassQuery(shapesSettings(), query, {
    now: () => time, random: () => 0, wait: async ms => { delays.push(ms); time += ms; },
    request: async () => { calls++; return new Response('', { status: 503 }); },
  }));
  assert.equal(calls, 3); assert.deepEqual(delays, [50, 100]);
});

test('Overpass never retries permanent, malformed, blocked or TLS errors at the same endpoint', async () => {
  for (const response of [
    () => new Response('', { status: 400 }), () => new Response('', { status: 401 }),
    () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('<html>'), () => { throw new SsrfBlockedError(); },
    () => { throw new Error('TLS failure'); },
  ]) {
    let calls = 0;
    await assert.rejects(fetchOverpassQuery(shapesSettings(), query, { request: async () => { calls++; return response(); }, wait: async () => assert.fail('no retry wait') }));
    assert.equal(calls, 1);
  }
});

test('Overpass respects Retry-After per origin and skips a wait beyond the rebuild deadline', async () => {
  let calls = 0;
  const settings = { ...shapesSettings(), instances: [url, url + '/other'], deadlineMs: 40000 };
  await assert.rejects(fetchOverpassQuery(settings, query, {
    now: () => 0, request: async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '120' } }); },
    wait: async () => assert.fail('excessive provider delay'),
  }));
  assert.equal(calls, 1);
});
