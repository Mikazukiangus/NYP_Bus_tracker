import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger, redact, REDACTED, safeError } from '../security/redact';
import { asyncHandler, errorHandler } from '../security/http-errors';

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalError = console.error;
afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  console.error = originalError;
});

test('redaction removes nested credential/header/cookie fields but keeps useful diagnostics', () => {
  const result: any = redact({ status: 401, nested: { AccountKey: 'private', 'X-API-Key': 'private', Authorization: 'private', cookie: 'private', client_secret: 'private' }, token: 'private' });
  assert.equal(result.status, 401);
  assert.equal(result.token, REDACTED);
  assert.ok(Object.values(result.nested).every((value) => value === REDACTED));
  assert.ok(!JSON.stringify(result).includes('private'));
  const headers = redact(new Headers({ Authorization: 'Basic opaque', 'Content-Type': 'application/json' })) as any;
  assert.equal(headers.authorization, REDACTED);
  assert.equal(headers['content-type'], 'application/json');
});

test('configured secrets and encoded forms are removed from unlabelled text and keys', () => {
  const secret = 'test-private/with+punctuation=';
  const variants = [secret, encodeURIComponent(secret), encodeURI(secret), Buffer.from(secret).toString('base64')];
  const serialized = JSON.stringify(redact({ [secret]: variants.join(' | ') }, [secret]));
  for (const value of variants) assert.ok(!serialized.includes(value));
  assert.equal(redact('\uD800', ['\uD800']), REDACTED);
});

test('unconfigured auth text, URL credentials/parameters/fragments, token formats and deploy hooks are removed', () => {
  const hook = 'https://api.vercel.com/v1/integrations/deploy/' + 'prj_test' + '/opaque';
  const token = 'ghp_' + 'a'.repeat(36);
  const text = `Bearer bearer-value Basic YTpi token=unknown-value ${token} ${hook} https://username:password@example.com/path?unknown=private-value#fragment-value`;
  const result = String(redact(text));
  for (const value of ['bearer-value', 'YTpi', 'unknown-value', token, 'opaque', 'username', 'password', 'private-value', 'fragment-value']) assert.ok(!result.includes(value));
  const pem = '-----BEGIN PRIVATE KEY-----\nprivate material\n-----END PRIVATE KEY-----';
  assert.equal(redact(pem), REDACTED);
});

test('raw errors, causes, stacks and binary data are omitted, including cyclic/unserializable metadata', () => {
  const error = new Error('private request', { cause: new Error('private cause') });
  const data: any = { error, raw: Buffer.from('private'), large: 1n };
  data.cycle = data;
  const serialized = JSON.stringify(redact(data));
  assert.ok(!serialized.includes('private'));
  assert.ok(serialized.includes('[CIRCULAR]'));
  assert.ok(serialized.includes('[BINARY OMITTED]'));
  assert.deepEqual(safeError(new DOMException('private', 'TimeoutError')), { kind: 'timeout' });
  assert.equal(redact({ get broken() { throw new Error('private getter'); } }), '[REDACTION FAILED: CONTENT OMITTED]');
});

test('logger emits one sanitized JSON record with no injected lines', () => {
  const output: string[] = [];
  const logger = createLogger(['private-sentinel'], (_level, line) => output.push(line));
  logger.warn('provider.failed', { status: 401, token: 'other-private', detail: 'private-sentinel\nforged-event', error: new Error('private-sentinel') });
  assert.equal(output.length, 1);
  assert.ok(!output[0].includes('\n'));
  assert.ok(!output[0].includes('private-sentinel'));
  assert.ok(!output[0].includes('other-private'));
  assert.equal(JSON.parse(output[0]).details.status, 401);
});

test('HTTP errors return generic JSON and safe logs, preserving only allowed client statuses', () => {
  const output: string[] = [];
  console.error = (line) => output.push(String(line));
  for (const requested of [400, 413, 415, 500, 401]) {
    let status = 0;
    let body: any;
    const error = Object.assign(new Error('private-message'), { status: requested });
    errorHandler(error, {} as any, {
      headersSent: false,
      status(value: number) { status = value; return this; },
      json(value: unknown) { body = value; },
    } as any, () => {});
    assert.equal(status, [400, 413, 415].includes(requested) ? requested : 500);
    assert.ok(!JSON.stringify(body).includes('private-message'));
  }
  assert.ok(!output.join('').includes('private-message'));
});

test('async API rejections are passed to error middleware instead of becoming unhandled errors', async () => {
  const error = new Error('private');
  const forwarded = await new Promise((resolve) => {
    asyncHandler(async () => { throw error; })({} as any, {} as any, resolve as any);
  });
  assert.equal(forwarded, error);
});

test('arrival upstream errors never print an echoed response body or raw request error', async () => {
  // A fresh process ensures the real handler/logger read a configured test key, independent of local secrets.
  const secret = `dummy-${'x'.repeat(24)}`;
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    const { default: handler } = await import('./api/bus-arrival.ts');
    const bodies = [];
    const res = { status() { return this; }, json(body) { bodies.push(body); } };
    globalThis.fetch = async () => new Response('UPSTREAM_ECHO_SENTINEL ' + process.env.LTA_ACCOUNT_KEY, { status: 401 });
    await handler({ query: { BusStopCode: '55329' } }, res);
    globalThis.fetch = async () => { throw new Error('RAW_ERROR_SENTINEL ' + process.env.LTA_ACCOUNT_KEY); };
    await handler({ query: { BusStopCode: '55329' } }, res);
    process.stdout.write(JSON.stringify(bodies.map(body => body.source)));
  `], { cwd: new URL('..', import.meta.url), env: { ...process.env, LTA_ACCOUNT_KEY: secret, DATA_GOV_SG_API_KEY: '' } });
  assert.deepEqual(JSON.parse(stdout), ['FALLBACK_SIMULATED', 'FALLBACK_SIMULATED']);
  assert.ok(stderr.includes('lta.arrivals_http_error'));
  assert.ok(stderr.includes('lta.arrivals_request_failed'));
  for (const value of [secret, 'UPSTREAM_ECHO_SENTINEL', 'RAW_ERROR_SENTINEL']) assert.ok(!(stdout + stderr).includes(value));
});
