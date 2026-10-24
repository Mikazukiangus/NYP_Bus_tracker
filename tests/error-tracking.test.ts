import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createErrorReporter, errorEventSchema, reportPolicy, SAFE_ERROR_MESSAGE, type ErrorEvent } from '../shared/errors/events.ts';
import { createPublicConfig, createConfig } from '../config/schema.ts';
import { DependencyHttpError } from '../shared/http/circuitBreaker.ts';
import { withErrorTracking, captureServerError, trackedLog } from '../server/errors/reporting.ts';
import { createBrowserErrorTracking, renderFatalMessage } from '../src/features/errors/reporting.ts';
import { withDocument } from './fixtures/dom.ts';

const settings = { enabled: true, source: 'browser' as const, environment: 'test' as const, release: 'a21d7e2' };
function framed(line = 12) {
  const error = new TypeError('private-address secret-token <script>');
  error.stack = `TypeError: private-address secret-token\n    at secretFunction (https://user:password@app.invalid/assets/index-HASH123.js?gps=1.34&secret-token:12:9)\n    at privateFunction (/Users/private-person/secret-token/src/App.tsx:${line}:8)\n    at privateFunction (/Users/private-person/secret-token/unknown.ts:7:8)`;
  return error;
}

test('exception reports preserve only fixed context, type and safe file positions', () => {
  const events: ErrorEvent[] = [];
  const tracker = createErrorReporter(settings, event => events.push(event));
  const id = tracker.capture(framed(), { operation: 'browser.render' });
  assert.ok(id);
  assert.equal(events.length, 1);
  assert.equal(errorEventSchema.safeParse(events[0]).success, true);
  assert.deepEqual(events[0].exception, { type: 'TypeError', frames: [
    { file: 'assets/app.js', line: 12, column: 9 }, { file: 'src/App.tsx', line: 12, column: 8 },
  ] });
  assert.doesNotMatch(JSON.stringify(events), /private|secret|password|gps|script|Function|app.invalid/);
  const malicious = new Proxy({}, { get() { throw new Error('secret getter'); }, getPrototypeOf() { throw new Error('secret prototype'); } });
  assert.doesNotThrow(() => tracker.capture(malicious, { operation: 'browser.error' }));
  assert.equal(tracker.capture(new Error('secret'), { operation: 'browser.error', query: 'secret' } as any), null);
  tracker.capture(new DependencyHttpError(503), { operation: 'arrivals.fetch' });
  assert.equal(events.at(-1)?.exception.httpStatus, 503);
});

test('reporting deduplicates React/global failures, bounds storms and recovers next window', () => {
  let time = 1000;
  const events: ErrorEvent[] = [];
  const tracker = createErrorReporter(settings, event => events.push(event), { now: () => time });
  const error = framed();
  const first = tracker.capture(error, { operation: 'browser.render' });
  assert.equal(tracker.capture(error, { operation: 'browser.error' }), first);
  assert.equal(tracker.capture(framed(), { operation: 'browser.render' }), first);
  assert.equal(events.length, 1);
  for (let i = 1; i <= 30; i++) tracker.capture(framed(i + 20), { operation: 'browser.render' });
  assert.equal(events.length, reportPolicy.browserEvents);
  time += reportPolicy.windowMs;
  assert.notEqual(tracker.capture(error, { operation: 'browser.render' }), first);
  assert.equal(events.length, reportPolicy.browserEvents + 1);
  time = 500;
  tracker.capture(framed(90), { operation: 'browser.render' });
  assert.equal(events.length, reportPolicy.browserEvents + 2);
  assert.equal(tracker.capture(new DOMException('cancelled private input', 'AbortError'), { operation: 'browser.error' }), null);
  assert.equal(createErrorReporter({ ...settings, enabled: false }, () => assert.fail()).capture(error, { operation: 'browser.error' }), null);
  assert.doesNotThrow(() => createErrorReporter(settings, () => { throw new Error('sink failure'); }).capture(error, { operation: 'browser.error' }));
});

test('error configuration uses deployment metadata, validates public overrides and excludes secrets', () => {
  const env = { VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_ENV: 'preview', LTA_ACCOUNT_KEY: 'private-key' };
  assert.equal(createConfig(env).public.errors.release, env.VERCEL_GIT_COMMIT_SHA);
  assert.equal(createPublicConfig(env).errors.environment, 'preview');
  assert.equal(createPublicConfig({ ...env, VITE_APP_RELEASE: 'b'.repeat(7), VITE_APP_ENVIRONMENT: 'test' }).errors.release, 'b'.repeat(7));
  assert.equal(createPublicConfig({ NODE_ENV: 'production' }).errors.environment, 'production');
  assert.doesNotMatch(JSON.stringify(createPublicConfig(env)), /private-key|LTA_ACCOUNT_KEY/);
  for (const [key, value] of Object.entries({ VITE_APP_RELEASE: 'private invalid', VITE_APP_ENVIRONMENT: 'invalid', VITE_ERROR_TRACKING_ENABLED: 'maybe', VITE_ERROR_REPORT_TIMEOUT_MS: '0' })) assert.throws(() => createPublicConfig({ [key]: value }), new RegExp(key));
});

test('concurrent serverless failures get isolated generated context and safe responses', async () => {
  const output: string[] = [], original = console.error;
  console.error = line => { output.push(String(line)); };
  const makeResponse = () => ({ headers: {} as Record<string, string>, statusCode: 0, body: undefined as any,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    status(value: number) { this.statusCode = value; return this; }, json(value: unknown) { this.body = value; } });
  try {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const one = withErrorTracking(async () => { await gate; throw framed(301); }, '/api/bus-arrival');
    const two = withErrorTracking(async () => { captureServerError(framed(302), 'lta.routes_request_failed'); release(); }, '/api/bus-route');
    const response = makeResponse();
    await Promise.all([one({ method: 'GET', url: '/?secret-token', headers: { 'x-request-id': 'secret-token' } }, response), two({ method: 'HEAD' }, makeResponse())]);
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.error, SAFE_ERROR_MESSAGE);
    assert.ok(response.body.errorId);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    const events = output.map(line => JSON.parse(line).details);
    assert.equal(events.length, 2);
    const first = events.find(event => event.context.route === '/api/bus-arrival');
    const second = events.find(event => event.context.route === '/api/bus-route');
    assert.equal(first.context.method, 'GET'); assert.equal(second.context.method, 'HEAD');
    assert.notEqual(first.context.requestId, second.context.requestId);
    assert.equal(first.eventId, response.body.errorId);
    assert.doesNotMatch(JSON.stringify([events, response.body]), /secret-token|private-address|private-person/);
    const native: any = { headers: {}, setHeader(key: string, value: string) { this.headers[key] = value; }, writeHead(status: number) { this.code = status; }, end(text: string) { this.text = text; } };
    await withErrorTracking(() => { throw framed(303); }, '/api/weather')({ method: 'HEAD' }, native);
    assert.equal(native.code, 500); assert.equal(JSON.parse(native.text).error, SAFE_ERROR_MESSAGE);
    let ended = 0;
    await withErrorTracking(() => { throw framed(304); }, '/api/weather')({}, { headersSent: true, end() { ended++; } });
    assert.equal(ended, 1);
  } finally { console.error = original; }
});

test('browser delivery is bounded, credential-free and never retries failed telemetry', async () => {
  const calls: RequestInit[] = [];
  const tracker = createBrowserErrorTracking(async (_url, init) => { calls.push(init!); throw new Error('private transport failure'); });
  const target = new EventTarget() as unknown as Window;
  const dispose = tracker.install(target);
  assert.equal(tracker.install(target), dispose);
  const first = tracker.capture(framed(401), { operation: 'arrivals.fetch', route: '/api/bus-arrival' });
  assert.ok(first);
  tracker.capture(framed(401), { operation: 'arrivals.fetch', route: '/api/bus-arrival' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].credentials, 'omit'); assert.equal(calls[0].referrerPolicy, 'no-referrer');
  assert.ok(calls[0].signal); assert.equal(calls[0].redirect, 'error');
  assert.doesNotMatch(String(calls[0].body), /private|secret|password/);
  const errorEvent = new Event('error', { cancelable: true });
  Object.defineProperty(errorEvent, 'error', { value: framed(402) });
  target.dispatchEvent(errorEvent);
  assert.equal(errorEvent.defaultPrevented, true); assert.ok(tracker.getNotice()?.errorId);
  tracker.dismiss(); assert.equal(tracker.getNotice(), null);
  const rejection = new Event('unhandledrejection', { cancelable: true });
  Object.defineProperty(rejection, 'reason', { value: framed(403) }); target.dispatchEvent(rejection);
  assert.equal(rejection.defaultPrevented, true);
  const abort = new Event('unhandledrejection', { cancelable: true });
  Object.defineProperty(abort, 'reason', { value: new DOMException('cancel', 'AbortError') });
  tracker.dismiss(); target.dispatchEvent(abort); assert.equal(tracker.getNotice(), null);
  await new Promise(resolve => setImmediate(resolve));
  dispose(); const count = calls.length;
  target.dispatchEvent(rejection); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls.length, count);
});

test('caught weather exceptions retain only known dataset context and separate groups', () => {
  const lines: string[] = [], original = console.error;
  console.error = line => { lines.push(String(line)); };
  try {
    for (const dataset of ['temperature', 'rainfall', 'private-address']) {
      trackedLog('warn', 'nea.dataset_refresh_failed', { dataset, error: framed(501), request: 'private-secret' });
    }
    assert.equal(lines.length, 3);
    const contexts = lines.map(line => JSON.parse(line).details.context);
    assert.equal(contexts[0].dataset, 'temperature'); assert.equal(contexts[1].dataset, 'rainfall');
    assert.equal(contexts[2].dataset, undefined);
    assert.doesNotMatch(lines.join(''), /private/);
  } finally { console.error = original; }
});

test('last-resort DOM fallback renders only a safe message and generated reference', () => withDocument(document => {
  const root = document.createElement('div'); root.innerHTML = '<p>old app</p>';
  renderFatalMessage(root, '00000000-0000-4000-8000-000000000001');
  assert.equal(root.querySelector('[role=alert]') !== null, true);
  assert.match(root.textContent ?? '', /Something went wrong/);
  assert.equal(root.querySelector('button')?.textContent, 'Reload app');
  assert.doesNotMatch(root.innerHTML, /<script|old app/);
}));
