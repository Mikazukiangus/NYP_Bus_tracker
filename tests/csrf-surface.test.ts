import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readdirSync } from 'node:fs';
import express from 'express';
import { createServer } from 'node:http';
import arrival from '../api/bus-arrival';
import route from '../api/bus-route';
import weather from '../api/weather';
import incidents from '../api/traffic-incidents';
import health, { createHealthHandler } from '../api/health';
import { createConfig } from '../config/schema';
import { config } from '../config/server';
import { validateReadRequest, emptyQuerySchema } from '../server/http/request';
import { neaFixture } from './fixtures/nea';

const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
const endpoints = [
  { name: 'bus-arrival', query: '?BusStopCode=55329', handler: arrival },
  { name: 'bus-route', query: '?ServiceNo=72', handler: route },
  { name: 'weather', query: '', handler: weather },
  { name: 'traffic-incidents', query: '', handler: incidents },
  { name: 'health', query: '', handler: health },
];
const cookie = '__Host-session=synthetic-unrecognized-session';
function response() {
  let status = 0, body: unknown;
  const headers: Record<string, string> = {};
  return { headers, result: () => ({ status, body }),
    res: { setHeader(key: string, value: string) { headers[key] = value; },
      status(value: number) { status = value; return this; }, json(value: unknown) { body = value; } } };
}

test('the API inventory distinguishes business reads from the strict anonymous telemetry collector', () => {
  assert.deepEqual(readdirSync(new URL('../api/', import.meta.url)).filter(file => file.endsWith('.ts')).sort(), [...endpoints.map(endpoint => endpoint.name + '.ts'), 'client-errors.ts'].sort());
});

test('cookie-bearing cross-origin form requests cannot enter any public API service', async () => {
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls++; throw new Error('Rejected requests must not reach providers'); };
  const app = express();
  for (const endpoint of endpoints) app.all('/api/' + endpoint.name, (req, res, next) => Promise.resolve(endpoint.handler(req, res)).catch(next));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    const forms = [
      { origin: config.security.appOrigin, site: 'same-origin', type: 'application/x-www-form-urlencoded', body: 'action=delete' },
      { origin: 'https://untrusted.invalid', site: 'cross-site', type: 'application/x-www-form-urlencoded', body: 'action=delete' },
      { origin: 'https://sub.nypbus-tracker.vercel.app', site: 'same-site', type: 'text/plain', body: 'action=delete' },
      { origin: 'null', site: 'cross-site', type: 'multipart/form-data; boundary=fixture', body: '--fixture\r\nContent-Disposition: form-data; name="action"\r\n\r\ndelete\r\n--fixture--\r\n' },
    ];
    for (const endpoint of endpoints) {
      for (const form of forms) {
        const result = await nativeFetch(origin + '/api/' + endpoint.name + endpoint.query, {
          method: 'POST', headers: { Cookie: cookie, Origin: form.origin, 'Sec-Fetch-Site': form.site, 'Content-Type': form.type }, body: form.body,
        });
        assert.equal(result.status, form.origin === config.security.appOrigin ? 405 : 403, endpoint.name);
        if (result.status === 405) assert.equal(result.headers.get('allow'), 'GET, HEAD');
        assert.equal(result.headers.get('cache-control'), 'no-store');
        assert.equal(result.headers.get('set-cookie'), null);
        assert.ok(!(await result.text()).includes('synthetic-unrecognized-session'));
      }
      for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        const result = await nativeFetch(origin + '/api/' + endpoint.name + endpoint.query, { method, headers: { Cookie: cookie, Origin: 'https://untrusted.invalid' } });
        assert.equal(result.status, 403, endpoint.name + ' ' + method);
        await result.arrayBuffer();
      }
    }
    assert.equal(providerCalls, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('method overrides and action parameters cannot bypass the read-only gate', async () => {
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls++; throw new Error('Must reject before providers'); };
  for (const endpoint of endpoints) {
    const query = Object.fromEntries(new URLSearchParams(endpoint.query));
    const post = response();
    await endpoint.handler({ method: 'POST', query, body: '_method=GET', headers: { cookie, origin: config.security.appOrigin, 'x-http-method-override': 'GET' } }, post.res);
    assert.equal(post.result().status, 405);
    for (const key of ['_method', 'action']) {
      const get = response();
      await endpoint.handler({ method: 'GET', query: { ...query, [key]: 'DELETE' }, headers: { cookie, origin: config.security.appOrigin } }, get.res);
      assert.equal(get.result().status, 400);
    }
  }
  assert.equal(providerCalls, 0);
});

test('ordinary public reads remain usable without treating cookies or origin as authorization', () => {
  for (const method of ['GET', 'HEAD']) {
    for (const headers of [{}, { cookie }, { cookie, origin: config.security.appOrigin, 'sec-fetch-site': 'same-origin' }]) {
      const check = response();
      assert.deepEqual(validateReadRequest({ method, query: {}, headers }, check.res, emptyQuerySchema), {});
      assert.equal(check.result().status, 0);
      assert.equal(check.headers['Set-Cookie'], undefined);
    }
  }
});

test('incoming session cookies are not forwarded to authenticated provider requests', async () => {
  const headers: Headers[] = [];
  globalThis.fetch = async (url, init) => {
    headers.push(new Headers(init?.headers));
    return Response.json(String(url).includes('BusArrival') ? { BusStopCode: '55329', Services: [] } : neaFixture());
  };
  const handler = createHealthHandler(createConfig({ APP_ORIGIN: config.security.appOrigin, LTA_ACCOUNT_KEY: 'test-lta', DATA_GOV_SG_API_KEY: 'test-nea', HEALTH_BUS_STOP_CODE: '55329' }));
  const check = response();
  await handler({ method: 'GET', query: {}, headers: { cookie, origin: config.security.appOrigin } }, check.res);
  assert.equal(check.result().status, 200);
  assert.equal(headers.length, 2);
  assert.equal(headers[0].get('AccountKey'), 'test-lta');
  assert.equal(headers[1].get('x-api-key'), 'test-nea');
  for (const upstream of headers) {
    assert.equal(upstream.get('cookie'), null);
    assert.equal(upstream.get('authorization'), null);
    assert.equal(upstream.get('origin'), null);
  }
  assert.equal(check.headers['Set-Cookie'], undefined);
});
