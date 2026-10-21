import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createConfig, ConfigError } from '../config/schema';
import { config } from '../config/server';
import { validateReadRequest, emptyQuerySchema } from '../server/http/request';
import arrival from '../api/bus-arrival';
import route from '../api/bus-route';
import weather from '../api/weather';
import incidents from '../api/traffic-incidents';
import health from '../api/health';

const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
const policy = createConfig({ APP_ORIGIN: 'https://frontend.example', CORS_ALLOWED_ORIGINS: 'https://second.example:8443' }).security;
function response(initial: Record<string, string> = {}) {
  let status = 0, body: unknown, ended = false;
  const headers = Object.fromEntries(Object.entries(initial).map(([key, value]) => [key.toLowerCase(), value]));
  return { headers, result: () => ({ status, body, ended }), res: {
    getHeader(key: string) { return headers[key.toLowerCase()]; },
    setHeader(key: string, value: string) { headers[key.toLowerCase()] = value; },
    status(value: number) { status = value; return this; }, json(value: unknown) { body = value; },
    end(value: string) { ended = true; body = value; },
  } };
}

test('CORS config is exact, normalized, server-only and HTTPS-only for production/builds', () => {
  assert.deepEqual(createConfig().security.corsAllowedOrigins, []);
  const settings = createConfig({ CORS_ALLOWED_ORIGINS: 'https://APP.example:443/, https://app.example,https://other.example:8443' });
  assert.deepEqual(settings.security.corsAllowedOrigins, ['https://app.example', 'https://other.example:8443']);
  assert.ok(!JSON.stringify(settings.public).includes('other.example'));
  assert.deepEqual(createConfig({ CORS_ALLOWED_ORIGINS: 'http://localhost:5173' }).security.corsAllowedOrigins, ['http://localhost:5173']);
  for (const options of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) assert.throws(() => createConfig({ ...options, CORS_ALLOWED_ORIGINS: 'http://localhost:5173' }), /CORS_ALLOWED_ORIGINS/);
  assert.throws(() => createConfig({ CORS_ALLOWED_ORIGINS: 'http://localhost:5173' }, { requireHttps: true }), /CORS_ALLOWED_ORIGINS/);
  for (const value of ['*', 'null', 'https://*.example.com', 'https://a.example/path', 'https://a.example?x=1', 'https://a.example#x', 'https://a.example?', 'https://a.example#', 'https://@a.example', 'https://private:secret@a.example', 'https://a.example,,https://b.example', 'http://a.example', 'https://a.example\r\nBAD']) {
    assert.throws(() => createConfig({ CORS_ALLOWED_ORIGINS: value }), (error: ConfigError) => error instanceof ConfigError && error.message.includes('CORS_ALLOWED_ORIGINS') && !error.message.includes(value));
  }
  assert.throws(() => createConfig({ APP_ORIGIN: 'https://*.example.com' }), /APP_ORIGIN/);
  assert.throws(() => createConfig({ CORS_ALLOWED_ORIGINS: Array.from({ length: 21 }, (_, i) => `https://a${i}.example`).join(',') }), /CORS_ALLOWED_ORIGINS/);
});

test('only configured origins get a single CORS grant; no-origin reads stay usable', () => {
  for (const origin of [policy.appOrigin, ...policy.corsAllowedOrigins]) {
    const check = response({ Vary: 'Accept-Encoding, origin' });
    assert.deepEqual(validateReadRequest({ method: 'GET', query: {}, headers: { origin, host: 'untrusted.invalid' } }, check.res, emptyQuerySchema, policy), {});
    assert.equal(check.headers['access-control-allow-origin'], origin);
    assert.equal(check.headers['access-control-allow-credentials'], undefined);
    assert.equal(check.headers.vary.toLowerCase(), 'accept-encoding, origin');
  }
  const absent = response();
  assert.deepEqual(validateReadRequest({ method: 'HEAD', query: {} }, absent.res, emptyQuerySchema, policy), {});
  assert.equal(absent.headers['access-control-allow-origin'], undefined);
  assert.equal(absent.headers.vary, 'Origin');
});

test('null, lookalike, sibling, preview and malformed origins cannot reach logic', () => {
  for (const origin of ['null', '*', 'https://frontend.example.evil.invalid', 'https://sub.frontend.example', 'https://unlisted.vercel.app', 'http://frontend.example', 'https://second.example', 'https://frontend.example/path', 'https://frontend.example/', 'https://frontend.example https://second.example:8443', ['https://frontend.example']]) {
    const check = response();
    assert.equal(validateReadRequest({ method: 'GET', headers: { origin, 'x-forwarded-host': 'frontend.example' } }, check.res, emptyQuerySchema, policy), null);
    assert.ok([400, 403].includes(check.result().status));
    assert.equal(check.headers['access-control-allow-origin'], undefined);
    assert.equal(check.headers['cache-control'], 'no-store');
    assert.ok(!JSON.stringify(check.result().body).includes('evil.invalid'));
  }
  const duplicate = response();
  assert.equal(validateReadRequest({ method: 'GET', headers: { origin: policy.appOrigin, Origin: policy.appOrigin } }, duplicate.res, emptyQuerySchema, policy), null);
  assert.equal(duplicate.result().status, 400);
});

test('approved read preflights return empty 204 before query/service work and vary correctly', () => {
  const check = response({ Vary: 'Accept-Encoding' });
  assert.equal(validateReadRequest({ method: 'OPTIONS', url: '/api/weather', headers: { origin: policy.appOrigin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'cOnTeNt-TyPe, Cache-Control' } }, check.res, emptyQuerySchema, policy), null);
  assert.deepEqual(check.result(), { status: 204, body: '', ended: true });
  assert.equal(check.headers['access-control-allow-origin'], policy.appOrigin);
  assert.equal(check.headers['access-control-allow-methods'], 'GET, HEAD');
  assert.equal(check.headers['access-control-allow-headers'], 'Accept, Content-Type, Cache-Control, Pragma');
  assert.equal(check.headers['access-control-max-age'], '300');
  assert.equal(check.headers['cache-control'], 'no-store');
  assert.equal(check.headers.vary, 'Accept-Encoding, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  assert.equal(check.headers['access-control-allow-credentials'], undefined);
});

test('write, authorization, private-network and malformed preflights are denied', () => {
  for (const changed of [
    { 'access-control-request-method': 'POST' }, { 'access-control-request-method': 'DELETE' },
    { 'access-control-request-headers': 'Authorization' }, { 'access-control-request-headers': 'X-API-Key' },
    { 'access-control-request-headers': '*' }, { 'access-control-request-headers': 'Content-Type,,Accept' },
    { 'access-control-request-private-network': 'true' }, { 'access-control-request-method': ['GET'] },
  ]) {
    const check = response();
    assert.equal(validateReadRequest({ method: 'OPTIONS', headers: { origin: policy.appOrigin, 'access-control-request-method': 'GET', ...changed } }, check.res, emptyQuerySchema, policy), null);
    assert.ok([400, 403].includes(check.result().status));
    assert.equal(check.headers['access-control-allow-methods'], undefined);
    assert.equal(check.headers['cache-control'], 'no-store');
  }
  for (const request of [
    { method: 'OPTIONS', headers: { 'access-control-request-method': 'GET' } },
    { method: 'GET', headers: { origin: policy.appOrigin, 'access-control-request-method': 'GET' } },
    { method: 'OPTIONS', body: 'unexpected', headers: { origin: policy.appOrigin, 'access-control-request-method': 'GET' } },
  ]) {
    const check = response();
    assert.equal(validateReadRequest(request, check.res, emptyQuerySchema, policy), null);
    assert.equal(check.result().status, 400);
  }
  const ordinary = response();
  validateReadRequest({ method: 'OPTIONS' }, ordinary.res, emptyQuerySchema, policy);
  assert.equal(ordinary.result().status, 405);
});

test('allowed origins can read schema/method errors, without expanding API methods', () => {
  for (const [method, query, status] of [['POST', {}, 405], ['GET', { unexpected: 'private-sentinel' }, 400]] as const) {
    const check = response();
    validateReadRequest({ method, query, headers: { origin: policy.appOrigin } }, check.res, emptyQuerySchema, policy);
    assert.equal(check.result().status, status);
    assert.equal(check.headers['access-control-allow-origin'], policy.appOrigin);
    assert.equal(check.headers['cache-control'], 'no-store');
    assert.ok(!JSON.stringify(check.result().body).includes('private-sentinel'));
  }
});

test('every real API rejects untrusted origins and handles preflights without provider calls', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not contact providers'); };
  for (const handler of [arrival, route, weather, incidents, health]) {
    const denied = response();
    await handler({ method: 'GET', headers: { origin: 'https://untrusted.invalid' } }, denied.res);
    assert.equal(denied.result().status, 403);
    const preflight = response();
    await handler({ method: 'OPTIONS', headers: { origin: config.security.appOrigin, 'access-control-request-method': 'HEAD' } }, preflight.res);
    assert.equal(preflight.result().status, 204);
  }
  assert.equal(calls, 0);
});
