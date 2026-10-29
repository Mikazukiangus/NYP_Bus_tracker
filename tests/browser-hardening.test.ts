import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRANSPORT_HEADERS, reportOnlyCsp } from '../security/transport.ts';
import { createPublicConfig } from '../config/public.ts';
test('production headers explicitly restrict browser capabilities and cross-origin embedding', () => {
  const headers: Record<string, string> = TRANSPORT_HEADERS;
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Permissions-Policy'], 'geolocation=(self), camera=(), microphone=()');
  assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin');
  assert.equal(headers['Cross-Origin-Resource-Policy'], 'same-site');
  assert.match(readFileSync(new URL('../server.ts', import.meta.url), 'utf8'), /app\.disable\('x-powered-by'\)/);
});
test('CSP candidate derives exact configured origins and rejects injected directives', () => {
  const urls = createPublicConfig({ VITE_API_BASE_URL: 'https://api.example.com/v1', VITE_DATA_BASE_URL: 'https://data.example.com' }).urls;
  assert.match(reportOnlyCsp(urls), /https:\/\/api.example.com https:\/\/data.example.com/);
  assert.doesNotMatch(reportOnlyCsp(urls), /\/v1/);
  assert.throws(() => reportOnlyCsp({ ...urls, apiBase: 'https://bad.example; script-src *' }));
  assert.throws(() => reportOnlyCsp({ ...urls, apiBase: 'http://bad.example' }));
});
test('narrow CSP is staged in report-only mode while retaining the enforced script protection', () => {
  const headers: Record<string, string> = TRANSPORT_HEADERS;
  const policy = headers['Content-Security-Policy-Report-Only'];
  assert.ok(policy);
  assert.match(policy, /connect-src 'self' https:\/\/api-open\.data\.gov\.sg https:\/\/www\.onemap\.gov\.sg;/);
  assert.doesNotMatch(policy, /(?:src[^;]*)(?:https:;|wss:|'unsafe-eval')/);
  assert.match(policy, /object-src 'none'/);
  assert.match(headers['Content-Security-Policy'], /script-src 'self';/);
});
