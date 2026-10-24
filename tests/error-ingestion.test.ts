import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { createConfig } from '../config/schema.ts';
import { createClientErrorHandler } from '../server/errors/ingest.ts';
import { createErrorReporter, reportPolicy, type ErrorEvent } from '../shared/errors/events.ts';

const settings = createConfig({ APP_ORIGIN: 'https://app.example.com', NODE_ENV: 'production' });
function event() {
  let output!: ErrorEvent;
  createErrorReporter({ enabled: true, source: 'browser', environment: 'test', release: 'local' }, value => { output = value; }).capture(new TypeError('private-secret'), { operation: 'browser.render' });
  return output;
}
function response() {
  return { code: 0, body: undefined as any, headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; },
    status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; }, end() {} };
}
const request = (body: unknown = event()) => ({ method: 'POST', url: '/api/client-errors', headers: { origin: 'https://app.example.com', 'content-type': 'application/json' } as Record<string, unknown>, body });

test('collector accepts only strict anonymous browser envelopes and deduplicates IDs', async () => {
  const events: ErrorEvent[] = [], handler = createClientErrorHandler(settings, value => events.push(value));
  const input = request();
  for (let i = 0; i < 2; i++) { const res = response(); await handler(input, res); assert.equal(res.code, 204); assert.equal(res.headers['cache-control'], 'no-store'); }
  assert.equal(events.length, 1);
  assert.doesNotMatch(JSON.stringify(events), /private-secret/);
  const invalid = [
    { ...event(), source: 'server' }, { ...event(), message: 'private-secret' },
    { ...event(), context: { operation: 'browser.render', requestId: crypto.randomUUID() } },
    { ...event(), exception: { type: 'Error', frames: [], message: 'private-secret' } },
    { ...event(), exception: { type: 'Error', frames: [{ file: 'private-secret', line: 1, column: 1 }] } },
    { ...event(), context: { operation: 'browser.render', gps: 'private-secret' } },
    { ...event(), release: 'private-secret' }, null, [], 'private-secret',
  ];
  for (const body of invalid) { const res = response(); await handler(request(body), res); assert.equal(res.code, 400); assert.doesNotMatch(JSON.stringify(res.body), /private-secret/); }
  assert.equal(events.length, 1);
});

test('collector origin, cookie, form, method and preflight gates run before reading bodies', async () => {
  const handler = createClientErrorHandler(settings, () => assert.fail('rejected boundary must not log'));
  const cases: [Record<string, any>, number][] = [
    [{ headers: {} }, 403], [{ headers: { origin: 'null' } }, 403],
    [{ headers: { origin: 'https://evil.example.com' } }, 403],
    [{ headers: { origin: 'http://localhost:3000' } }, 403],
    [{ headers: { origin: 'https://app.example.com/' } }, 403],
    [{ method: 'GET' }, 405], [{ method: 'PUT' }, 405], [{ url: '/api/client-errors?secret=1' }, 400],
    [{ headers: { cookie: 'session=private-secret' } }, 400], [{ headers: { authorization: 'Bearer private-secret' } }, 400],
    [{ headers: { 'content-type': 'text/plain' } }, 415], [{ headers: { 'content-type': 'application/x-www-form-urlencoded' } }, 415],
    [{ headers: { 'content-encoding': 'gzip' } }, 415], [{ headers: { Origin: 'https://app.example.com' } }, 400],
    [{ headers: { 'content-length': 'junk' } }, 400], [{ headers: { 'content-length': '8193' } }, 413],
  ];
  for (const [overrides, status] of cases) {
    const req = { ...request(), ...overrides, headers: Object.keys(overrides.headers ?? {}).length ? { ...request().headers, ...overrides.headers } : overrides.headers ?? request().headers };
    Object.defineProperty(req, 'body', { get() { assert.fail('must reject before body read'); } });
    const res = response(); await handler(req, res); assert.equal(res.code, status, JSON.stringify(overrides));
    assert.doesNotMatch(JSON.stringify(res.body), /private-secret/); assert.equal(res.headers['set-cookie'], undefined);
  }
  const preflight = request(); preflight.method = 'OPTIONS';
  preflight.headers['access-control-request-method'] = 'POST'; preflight.headers['access-control-request-headers'] = 'content-type';
  const res = response(); await handler(preflight, res); assert.equal(res.code, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'https://app.example.com');
  assert.equal(res.headers['access-control-allow-methods'], 'POST');
  assert.equal(res.headers['access-control-allow-credentials'], undefined);
  for (const headers of [{ 'access-control-request-method': 'GET' }, { 'access-control-request-headers': 'authorization,content-type' }, { 'access-control-request-private-network': 'true' }]) {
    const bad = response(); await handler({ ...preflight, headers: { ...preflight.headers, ...headers } }, bad); assert.equal(bad.code, 403);
  }
});

test('collector limits encoded and chunked bodies, deadlines stalled streams and releases listeners', async () => {
  const events: ErrorEvent[] = [], handler = createClientErrorHandler(settings, value => events.push(value));
  for (const body of ['{private-secret', ' '.repeat(8193), Buffer.alloc(8193), { data: 'x'.repeat(8193) }]) {
    const res = response(); await handler(request(body), res); assert.ok([400, 413].includes(res.code));
  }
  const stream = () => Object.assign(new EventEmitter(), { method: 'POST', url: '/api/client-errors', headers: request().headers, pause() {} });
  const valid = stream(), okay = response(), complete = handler(valid, okay);
  const text = JSON.stringify(event()); valid.emit('data', text.slice(0, 20)); valid.emit('data', Buffer.from(text.slice(20))); valid.emit('end'); await complete;
  assert.equal(okay.code, 204); assert.equal(events.length, 1); assert.equal(valid.listenerCount('data'), 0);
  const large = stream(), overflow = response(), failed = handler(large, overflow);
  large.emit('data', Buffer.alloc(8193)); await failed; assert.equal(overflow.code, 413); assert.equal(large.listenerCount('data'), 0);
  const slow = stream(), timeout = response(); await handler(slow, timeout);
  assert.equal(timeout.code, 408); assert.equal(slow.listenerCount('end'), 0); assert.equal(timeout.headers.connection, 'close');
});

test('collector admission is reserved atomically, rolls over and never recurses on sink failures', async () => {
  let now = 1000, logged = 0;
  const handler = createClientErrorHandler(settings, () => { logged++; throw new Error('private sink failure'); }, () => now);
  const requests = Array.from({ length: reportPolicy.serverEvents + 5 }, () => response());
  await Promise.all(requests.map(res => handler(request(), res)));
  assert.equal(requests.filter(res => res.code === 204).length, reportPolicy.serverEvents);
  assert.equal(requests.filter(res => res.code === 429).length, 5);
  assert.equal(logged, reportPolicy.serverEvents);
  now += reportPolicy.windowMs; const next = response(); await handler(request(), next); assert.equal(next.code, 204);
  now = 500; const rollback = response(); await handler(request(), rollback); assert.equal(rollback.code, 204);
  const disabled = createClientErrorHandler(createConfig({ VITE_ERROR_TRACKING_ENABLED: 'false' }), () => assert.fail());
  const off = response(); await disabled({ ...request(), headers: { ...request().headers, origin: createConfig().security.appOrigin } }, off); assert.equal(off.code, 204);
});

test('native HTTP ingestion returns empty 204, exact CORS and safe malformed-request errors', async () => {
  const events: ErrorEvent[] = [], handler = createClientErrorHandler(settings, value => events.push(value));
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const response = await fetch(origin + '/api/client-errors', { method: 'POST', headers: request().headers as Record<string, string>, body: JSON.stringify(event()), signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 204); assert.equal(await response.text(), ''); assert.equal(events.length, 1);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example.com');
    const rejected = await fetch(origin + '/api/client-errors', { method: 'POST', headers: { ...request().headers as Record<string, string>, Cookie: 'session=private-secret' }, body: '{}', signal: AbortSignal.timeout(5000) });
    assert.equal(rejected.status, 400); assert.doesNotMatch(await rejected.text(), /private-secret/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
