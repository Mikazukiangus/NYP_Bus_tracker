import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import handler from '../api/health';

const originalFetch = globalThis.fetch;
const originalLtaKey = process.env.LTA_ACCOUNT_KEY;
const originalNeaKey = process.env.DATA_GOV_SG_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLtaKey === undefined) delete process.env.LTA_ACCOUNT_KEY;
  else process.env.LTA_ACCOUNT_KEY = originalLtaKey;
  if (originalNeaKey === undefined) delete process.env.DATA_GOV_SG_API_KEY;
  else process.env.DATA_GOV_SG_API_KEY = originalNeaKey;
});

async function healthResponse() {
  let statusCode = 0;
  let body: any;
  const headers: Record<string, string> = {};
  await handler({}, {
    setHeader(name: string, value: string) { headers[name] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; },
  });
  return { statusCode, body, headers };
}

const validBody = (url: string) => url.includes('BusArrival')
  ? { BusStopCode: '55329', Services: [] }
  : { code: 0, data: { items: [{ forecasts: [] }] } };

test('healthy requires valid responses from both upstreams; credentials stay server-side', async () => {
  process.env.LTA_ACCOUNT_KEY = 'test-lta-secret';
  process.env.DATA_GOV_SG_API_KEY = 'test-nea-secret';
  const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    assert.ok(options?.signal);
    const headers = options?.headers as Record<string, string>;
    assert.equal(String(url).includes('BusArrival') ? headers.AccountKey : headers['x-api-key'],
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
  process.env.LTA_ACCOUNT_KEY = 'rejected-key';
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
  delete process.env.LTA_ACCOUNT_KEY;
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
  process.env.LTA_ACCOUNT_KEY = 'test-key';
  globalThis.fetch = async (url) => Response.json(String(url).includes('BusArrival')
    ? validBody(String(url)) : { code: 24, errorMsg: 'rate limited' });
  const { statusCode, body } = await healthResponse();
  assert.equal(statusCode, 503);
  assert.equal(body.neaWeather.reason, 'invalid_response');
});

test('timed out probes report failure without exposing the fetch error', async () => {
  process.env.LTA_ACCOUNT_KEY = 'test-key';
  globalThis.fetch = async () => { throw new DOMException('private request details', 'TimeoutError'); };
  const { statusCode, body } = await healthResponse();
  assert.equal(statusCode, 503);
  assert.equal(body.ltaDataMall.reason, 'timeout');
  assert.equal(body.neaWeather.reason, 'timeout');
  assert.ok(!JSON.stringify(body).includes('private request details'));
});
