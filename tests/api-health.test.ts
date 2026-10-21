import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createHealthHandler } from '../api/health';
import { createConfig } from '../config/schema';
import { neaFixture } from './fixtures/nea';

const originalFetch = globalThis.fetch;
const env: Record<string, string> = {};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(env)) delete env[key];
});

async function healthResponse() {
  let statusCode = 0;
  let body: any;
  const headers: Record<string, string> = {};
  await createHealthHandler(createConfig(env))({ method: 'GET' }, {
    setHeader(name: string, value: string) { headers[name] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; },
  });
  return { statusCode, body, headers };
}

const validBody = (url: string) => url.includes('BusArrival')
  ? { BusStopCode: '55329', Services: [] }
  : neaFixture();

test('healthy requires valid responses from both upstreams; credentials stay server-side', async () => {
  env.LTA_ACCOUNT_KEY = 'test-lta-secret';
  env.DATA_GOV_SG_API_KEY = 'test-nea-secret';
  const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    assert.ok(options?.signal);
    const headers = new Headers(options?.headers);
    assert.equal(headers.get(String(url).includes('BusArrival') ? 'AccountKey' : 'x-api-key'),
      String(url).includes('BusArrival') ? 'test-lta-secret' : 'test-nea-secret');
    return Response.json(validBody(String(url)));
  };
  const { statusCode, body, headers } = await healthResponse();
  assert.equal(calls.length, 2);
  assert.equal(statusCode, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.ltaDataMall.status, 'ok');
  assert.equal(body.neaWeather.status, 'ok');
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.ok(!JSON.stringify(body).includes('test-lta-secret'));
  assert.ok(!JSON.stringify(body).includes('test-nea-secret'));
});

test('a configured but rejected LTA key reports degraded rather than ready', async () => {
  env.LTA_ACCOUNT_KEY = 'rejected-key';
  globalThis.fetch = async (url) => String(url).includes('BusArrival')
    ? new Response('private upstream details', { status: 401 })
    : Response.json(validBody(String(url)));
  const { statusCode, body } = await healthResponse();
  assert.equal(statusCode, 503);
  assert.equal(body.status, 'degraded');
  assert.equal(body.environment.ltaAccountKeyConfigured, true);
  assert.equal(body.ltaDataMall.httpStatus, 401);
  assert.equal(body.ltaDataMall.reason, 'upstream_http_error');
  assert.ok(!JSON.stringify(body).includes('private upstream details'));
});

test('missing LTA credentials skip the authenticated probe and report degraded', async () => {
  delete env.LTA_ACCOUNT_KEY;
  globalThis.fetch = async (url) => {
    assert.ok(!String(url).includes('BusArrival'));
    return Response.json(validBody(String(url)));
  };
  const { statusCode, body } = await healthResponse();
  assert.equal(statusCode, 503);
  assert.equal(body.ltaDataMall.status, 'not_configured');
  assert.equal(body.neaWeather.status, 'ok');
});

test('HTTP 200 with an invalid NEA payload is unavailable', async () => {
  env.LTA_ACCOUNT_KEY = 'test-key';
  globalThis.fetch = async (url) => Response.json(String(url).includes('BusArrival')
    ? validBody(String(url)) : { code: 24, errorMsg: 'rate limited' });
  const { statusCode, body } = await healthResponse();
  assert.equal(statusCode, 503);
  assert.equal(body.neaWeather.reason, 'invalid_response');
});

test('timed out probes report failure without exposing the fetch error', async () => {
  env.LTA_ACCOUNT_KEY = 'test-key';
  globalThis.fetch = async () => { throw new DOMException('private request details', 'TimeoutError'); };
  const { statusCode, body } = await healthResponse();
  assert.equal(statusCode, 503);
  assert.equal(body.ltaDataMall.reason, 'timeout');
  assert.equal(body.neaWeather.reason, 'timeout');
  assert.ok(!JSON.stringify(body).includes('private request details'));
});

test('health uses the configured provider bases and probe stop', async () => {
  Object.assign(env, {
    LTA_ACCOUNT_KEY: 'test-key', LTA_API_BASE_URL: 'https://lta.example.com/data',
    VITE_NEA_API_BASE_URL: 'https://nea.example.com/api', HEALTH_BUS_STOP_CODE: '54009',
  });
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json(String(url).includes('BusArrival')
      ? { BusStopCode: '54009', Services: [] } : validBody(String(url)));
  };
  const { statusCode, body } = await healthResponse();
  assert.equal(statusCode, 200);
  assert.deepEqual(calls, [
    'https://lta.example.com/data/v3/BusArrival?BusStopCode=54009', 'https://nea.example.com/api/two-hr-forecast',
  ]);
  assert.equal(body.neaWeather.source, 'https://nea.example.com/api');
});
