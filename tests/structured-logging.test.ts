import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import { createLogger } from '../security/redact.ts';
import { logger } from '../security/logger.ts';
import { currentLogContext, logRoute, withLogContext } from '../security/log-context.ts';
import { withRequestLogging, requestLoggingMiddleware } from '../server/http/logging.ts';
import { withErrorTracking } from '../server/errors/reporting.ts';
import { asyncHandler, errorHandler } from '../security/http-errors.ts';
import arrival from '../api/bus-arrival.ts';
import route from '../api/bus-route.ts';
import weather from '../api/weather.ts';
import incidents from '../api/traffic-incidents.ts';
import health from '../api/health.ts';
import clientErrors from '../api/client-errors.ts';
import { config } from '../config/server.ts';
import { createErrorReporter } from '../shared/errors/events.ts';

const original = { info: console.info, warn: console.warn, error: console.error, fetch: globalThis.fetch };
afterEach(() => { Object.assign(console, { info: original.info, warn: original.warn, error: original.error }); globalThis.fetch = original.fetch; });
function capture() {
  const lines: string[] = [];
  for (const level of ['info', 'warn', 'error'] as const) console[level] = line => { lines.push(String(line)); };
  return { lines, records: () => lines.map(line => JSON.parse(line)) };
}
class TestResponse extends EventEmitter {
  statusCode = 200; headersSent = false; writableFinished = false;
  headers: Record<string, string> = {}; body: any;
  setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; }
  status(code: number) { this.statusCode = code; return this; }
  json(body: unknown) { this.body = body; this.headersSent = true; this.writableFinished = true; this.emit('finish'); this.emit('close'); }
  end() { this.headersSent = true; this.writableFinished = true; this.emit('finish'); this.emit('close'); }
}
const response = () => new TestResponse();

test('each logger call is a timestamped JSON object with authoritative envelope and redacted contact fields', () => {
  const output: string[] = [];
  const log = createLogger(['PRIVATE_SENTINEL'], (_, line) => output.push(line), {
    now: () => 0, metadata: () => ({ service: 'test', level: 'forged', event: 'forged', details: 'forged' }),
  });
  log.info('test.event', { count: 2, email: 'private@example.invalid', phone: '+6500000000', contacts: ['PRIVATE_SENTINEL'], value: 'PRIVATE_SENTINEL\nnew-line' });
  assert.equal(output.length, 1); assert.ok(!output[0].includes('\n'));
  const value = JSON.parse(output[0]);
  assert.equal(value.version, 1); assert.equal(value.timestamp, '1970-01-01T00:00:00.000Z');
  assert.equal(value.level, 'info'); assert.equal(value.event, 'test.event'); assert.equal(value.details.count, 2);
  assert.doesNotMatch(output[0], /private@example|650000|PRIVATE_SENTINEL|forged/);
  log.warn('test.hostile', { get private() { throw new Error('PRIVATE_SENTINEL'); } });
  assert.equal(typeof JSON.parse(output[1]), 'object'); assert.doesNotMatch(output[1], /PRIVATE_SENTINEL/);
  assert.doesNotThrow(() => createLogger([], () => { throw new Error('sink unavailable'); }).error('test.sink'));
  const failedContext: string[] = [];
  createLogger([], (_, line) => failedContext.push(line), { metadata() { throw new Error('PRIVATE_SENTINEL'); } }).info('test.context');
  assert.equal(JSON.parse(failedContext[0]).event, 'test.context');
});

test('concurrent deep info/warn/error logs and completions inherit isolated request and anonymous user context', async () => {
  const output = capture(), first = response(), second = response();
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const handlerA = withErrorTracking(async (_req, res) => {
    logger.info('test.a_start'); await gate;
    logger.warn('test.a_warn', { status: 503 });
    throw new TypeError('PRIVATE_SENTINEL query/body/contact');
  }, '/api/bus-arrival');
  const handlerB = withErrorTracking(async (_req, res) => {
    logger.info('test.b_start'); await new Promise(resolve => setImmediate(resolve));
    logger.error('test.b_error', { error: new Error('PRIVATE_SENTINEL') });
    res.json({ ok: true }); unblock();
  }, '/api/weather');
  const spoof = { headers: { 'x-request-id': 'PRIVATE_SENTINEL', 'x-user-id': 'PRIVATE_SENTINEL', cookie: 'session=PRIVATE_SENTINEL' },
    user: { id: 'PRIVATE_SENTINEL', email: 'private@example.invalid' }, url: '/api/weather?contact=PRIVATE_SENTINEL', body: 'PRIVATE_SENTINEL' };
  await Promise.all([handlerA({ ...spoof, method: 'GET' }, first), handlerB({ ...spoof, method: 'POST' }, second)]);
  const records = output.records(), a = first.headers['x-request-id'], b = second.headers['x-request-id'];
  assert.match(a, /^[a-f0-9-]{36}$/); assert.notEqual(a, b);
  for (const log of records) {
    assert.equal(log.version, 1); assert.ok(Number.isFinite(Date.parse(log.timestamp)));
    assert.equal(log.service, 'bustrackersg'); assert.ok(log.environment); assert.ok(log.release);
    assert.deepEqual(log.user, { kind: 'anonymous' });
    const expected = log.request.route === '/api/bus-arrival' ? a : b;
    assert.equal(log.request.id, expected);
    assert.equal(log.request.method, expected === a ? 'GET' : 'POST');
  }
  const failure = records.find(log => log.event === 'errors.exception');
  assert.equal(failure.details.context.requestId, a); assert.equal(failure.request.id, a);
  assert.equal(first.body.errorId, failure.details.eventId); assert.equal(first.statusCode, 500);
  const completions = records.filter(log => log.event === 'http.request_completed');
  assert.equal(completions.length, 2); assert.deepEqual(completions.map(log => log.details.statusCode).sort(), [200, 500]);
  assert.ok(completions.every(log => log.details.durationMs >= 0 && log.details.outcome === 'completed'));
  assert.doesNotMatch(output.lines.join(''), /PRIVATE_SENTINEL|private@example|contact=/);
  assert.equal(currentLogContext(), undefined);
  logger.info('test.outside'); const outside = output.records().at(-1);
  assert.equal(outside.request, null); assert.equal(outside.user, null);
});

test('finish/close callbacks retain their original context, log once and remove both listeners', async () => {
  const output = capture(), res = response();
  await withRequestLogging(async () => {}, '/api/weather')({ method: 'GET' }, res);
  const id = res.headers['x-request-id'];
  withLogContext({ method: 'POST' }, '/api/client-errors', () => {
    res.writableFinished = true; res.emit('finish'); res.emit('close');
    logger.info('test.current_owner');
  });
  const records = output.records();
  assert.equal(records.filter(log => log.event === 'http.request_completed').length, 1);
  assert.equal(records[0].request.id, id); assert.equal(records[0].request.route, '/api/weather');
  assert.equal(records[1].request.route, '/api/client-errors'); assert.notEqual(records[1].request.id, id);
  assert.equal(res.listenerCount('finish'), 0); assert.equal(res.listenerCount('close'), 0);
  const aborted = response();
  await withRequestLogging(async () => {}, '/api/bus-route')({ method: 'GET' }, aborted);
  aborted.emit('close'); aborted.emit('finish');
  assert.equal(output.records().filter(log => log.event === 'http.request_completed').length, 2);
  assert.equal(output.records().at(-1).details.outcome, 'aborted');
});

test('request scope is immutable, nested adapters reuse IDs and unsupported methods/paths have fixed labels', async () => {
  capture(); const req = { method: 'PRIVATE_SENTINEL' }, res = response();
  await withRequestLogging(async () => {
    const context = currentLogContext()!;
    assert.ok(Object.isFrozen(context)); assert.ok(Object.isFrozen(context.request)); assert.ok(Object.isFrozen(context.user));
    assert.equal(context.request.method, 'OTHER');
    const nested = withRequestLogging(async () => { assert.equal(currentLogContext(), context); }, '/api/weather');
    await nested(req, res); assert.equal(res.listenerCount('finish'), 1);
    res.end();
  }, 'other')(req, res);
  assert.equal(logRoute('/api/BusArrival?email=PRIVATE_SENTINEL'), '/api/bus-arrival');
  assert.equal(logRoute('/api/WEATHER?gps=PRIVATE_SENTINEL'), '/api/weather');
  assert.equal(logRoute('/private-person/PRIVATE_SENTINEL'), 'other');
});

test('all six actual Vercel defaults produce one correlated completion without entering provider logic', async () => {
  const output = capture(); let providers = 0;
  globalThis.fetch = async () => { providers++; throw new Error('must not call provider'); };
  const handlers = [['/api/bus-arrival', arrival], ['/api/bus-route', route], ['/api/weather', weather],
    ['/api/traffic-incidents', incidents], ['/api/health', health], ['/api/client-errors', clientErrors]] as const;
  for (const [path, handler] of handlers) {
    const res = response();
    await handler({ method: 'GET', query: { unexpected: 'PRIVATE_SENTINEL' }, url: path + '?unexpected=PRIVATE_SENTINEL', headers: { origin: config.security.appOrigin } }, res);
    assert.equal(res.statusCode, 400);
    const completed = output.records().filter(log => log.event === 'http.request_completed' && log.request.route === path);
    assert.equal(completed.length, 1); assert.equal(completed[0].request.id, res.headers['x-request-id']);
  }
  assert.equal(providers, 0); assert.doesNotMatch(output.lines.join(''), /PRIVATE_SENTINEL/);
});

test('browser report payloads cannot replace collector request or user context', async () => {
  const output = capture(); let event: unknown;
  createErrorReporter({ enabled: true, source: 'browser', environment: 'test', release: 'abcdef0' }, value => { event = value; })
    .capture(new TypeError('PRIVATE_SENTINEL'), { operation: 'browser.error' });
  const res = response();
  await clientErrors({ method: 'POST', url: '/api/client-errors', headers: { origin: config.security.appOrigin, 'content-type': 'application/json', 'x-user-id': 'PRIVATE_SENTINEL' }, body: event }, res);
  assert.equal(res.statusCode, 204);
  const log = output.records().find(value => value.event === 'errors.client_exception');
  assert.equal(log.request.id, res.headers['x-request-id']); assert.equal(log.request.route, '/api/client-errors');
  assert.deepEqual(log.user, { kind: 'anonymous' }); assert.equal(log.details.trusted, false);
  assert.equal(log.details.release, 'abcdef0'); assert.equal(log.release, config.public.errors.release);
  const forged = response();
  await clientErrors({ method: 'POST', url: '/api/client-errors', headers: { origin: config.security.appOrigin, 'content-type': 'application/json' }, body: { ...(event as object), user: { id: 'PRIVATE_SENTINEL' } } }, forged);
  assert.equal(forged.statusCode, 400);
  assert.equal(output.records().filter(value => value.event === 'errors.client_exception').length, 1);
  assert.doesNotMatch(output.lines.join(''), /PRIVATE_SENTINEL/);
});

test('standalone middleware, nested Vercel wrapper and final error handler share one scope per HTTP response', async () => {
  const output = capture(), app = express(); app.use(requestLoggingMiddleware);
  app.get('/api/weather', asyncHandler(withErrorTracking(async (_req, res) => {
    await new Promise(resolve => setImmediate(resolve)); logger.warn('test.http_deep'); res.json({ ok: true });
  }, '/api/weather')));
  app.get('/broken', asyncHandler(async () => { throw new TypeError('PRIVATE_SENTINEL'); }));
  app.use(errorHandler); const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    const okay = await original.fetch(base + '/api/weather?contact=PRIVATE_SENTINEL', { headers: { 'X-Request-ID': 'PRIVATE_SENTINEL', 'X-User-ID': 'PRIVATE_SENTINEL' }, signal: AbortSignal.timeout(5000) });
    assert.equal(okay.status, 200); await okay.text();
    const failed = await original.fetch(base + '/broken?email=PRIVATE_SENTINEL', { signal: AbortSignal.timeout(5000) });
    assert.equal(failed.status, 500); const body = await failed.json();
    await new Promise(resolve => setImmediate(resolve));
    const records = output.records(), completed = records.filter(log => log.event === 'http.request_completed');
    assert.equal(completed.length, 2); assert.notEqual(okay.headers.get('x-request-id'), failed.headers.get('x-request-id'));
    assert.equal(records.find(log => log.event === 'test.http_deep').request.id, okay.headers.get('x-request-id'));
    const exception = records.find(log => log.event === 'errors.exception');
    assert.equal(exception.request.id, failed.headers.get('x-request-id')); assert.equal(exception.details.eventId, body.errorId);
    assert.equal(exception.request.route, 'other'); assert.doesNotMatch(output.lines.join(''), /PRIVATE_SENTINEL/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
