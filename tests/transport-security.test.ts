import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { createConfig, createPublicConfig } from '../config/schema';
import { createTransportSecurity, TRANSPORT_HEADERS } from '../security/transport';
import { setSecureCookie } from '../security/cookies';
import { checkBrowserSources, insecureResourceLiterals } from '../scripts/check-https';
import { createArrivalService } from '../server/lta/arrivals';
import { createIncidentService } from '../server/lta/incidents';
import { createLtaClient } from '../server/lta/client';
import { createWeatherService } from '../server/weather/service';
import { createHealthHandler } from '../api/health';

const root = path.resolve(import.meta.dirname, '..');
function request(secure: boolean, url = '/api/bus-arrival?BusStopCode=01001', remote = '127.0.0.1') {
  const app = express(); app.set('trust proxy', ['loopback']);
  const req = Object.assign(Object.create(express.request), {
    app, originalUrl: url, method: 'POST', headers: { host: 'attacker.example', 'x-forwarded-proto': secure ? 'https' : 'http' },
    socket: { encrypted: false, remoteAddress: remote }, connection: { encrypted: false, remoteAddress: remote },
  });
  const headers: Record<string, string> = {};
  let redirected: [number, string] | null = null, nextCalls = 0;
  const res = {
    setHeader(key: string, value: string) { headers[key] = value; },
    redirect(status: number, location: string) { redirected = [status, location]; },
  };
  return { req, res, headers, next: () => { nextCalls++; }, result: () => ({ redirected, nextCalls }) };
}
const middleware = createTransportSecurity({ production: true, appOrigin: 'https://nypbus-tracker.vercel.app' });

test('production redirects HTTP with method-preserving 308 and retains encoded path/query on the configured host', () => {
  for (const url of ['/api/bus-arrival?BusStopCode=01001&x=%2F', '//attacker.example/path?x=1']) {
    const check = request(false, url);
    middleware(check.req, check.res as any, check.next);
    assert.deepEqual(check.result(), { redirected: [308, `https://nypbus-tracker.vercel.app${url}`], nextCalls: 0 });
    assert.equal(check.headers['Cache-Control'], 'no-store');
    assert.equal(check.headers['Strict-Transport-Security'], undefined);
  }
});

test('HTTPS headers cover secure API/static/error paths and ignore spoofed proxy headers from untrusted peers', () => {
  for (const url of ['/', '/assets/app.js', '/api/health', '/missing']) {
    const check = request(true, url);
    middleware(check.req, check.res as any, check.next);
    assert.deepEqual(check.headers, TRANSPORT_HEADERS);
    assert.deepEqual(check.result(), { redirected: null, nextCalls: 1 });
  }
  const spoofed = request(true, '/', '203.0.113.10');
  assert.equal(spoofed.req.secure, false);
  middleware(spoofed.req, spoofed.res as any, spoofed.next);
  assert.equal(spoofed.result().redirected?.[0], 308);
});

test('localhost development retains HTTP/HMR and gets no sticky HSTS or upgrading CSP', () => {
  const check = request(false);
  createTransportSecurity({ production: false, appOrigin: 'https://nypbus-tracker.vercel.app' })(check.req, check.res as any, check.next);
  assert.deepEqual(check.headers, {});
  assert.deepEqual(check.result(), { redirected: null, nextCalls: 1 });
  assert.throws(() => createTransportSecurity({ production: true, appOrigin: 'http://example.com' }));
});

test('Vercel applies the same HSTS and transport CSP everywhere without changing immutable asset caching', () => {
  const config = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const all = config.headers.find((entry: any) => entry.source === '/(.*)');
  assert.deepEqual(Object.fromEntries(all.headers.map((header: any) => [header.key, header.value])), TRANSPORT_HEADERS);
  assert.match(TRANSPORT_HEADERS['Content-Security-Policy'], /upgrade-insecure-requests/);
  assert.match(TRANSPORT_HEADERS['Content-Security-Policy'], /connect-src 'self' https: wss:/);
  assert.ok(config.headers.some((entry: any) => entry.source === '/assets/(.*)' && entry.headers.some((header: any) => /immutable/.test(header.value))));
});

test('production, Vercel and every client build refuse HTTP endpoints including loopback', () => {
  for (const key of ['LTA_API_BASE_URL', 'OVERPASS_URLS', 'VITE_API_BASE_URL', 'VITE_DATA_BASE_URL', 'VITE_NEA_API_BASE_URL', 'VITE_ONEMAP_BASE_URL']) {
    const values = { [key]: 'http://127.0.0.1:12345/fixture' };
    assert.doesNotThrow(() => createConfig(values));
    for (const runtime of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) {
      assert.throws(() => createConfig({ ...values, ...runtime }), new RegExp(key));
    }
    assert.throws(() => createConfig(values, { requireHttps: true }), new RegExp(key));
  }
  assert.throws(() => createPublicConfig({ NODE_ENV: 'production', VITE_DATA_BASE_URL: 'http://localhost' }), /VITE_DATA_BASE_URL/);
  assert.doesNotThrow(() => createConfig({ NODE_ENV: 'production', VITE_API_BASE_URL: 'https://api.example.com' }));
});

test('canonical HTTPS origin and explicit proxy CIDRs validate without trusting every remote peer', () => {
  assert.equal(createConfig().security.appOrigin, 'https://nypbus-tracker.vercel.app');
  assert.deepEqual(createConfig().security.trustedProxyCidrs, ['loopback']);
  assert.deepEqual(createConfig({ TRUST_PROXY_CIDRS: 'none' }).security.trustedProxyCidrs, []);
  assert.deepEqual(createConfig({ TRUST_PROXY_CIDRS: '10.1.0.0/16,::1/128,10.1.0.0/16' }).security.trustedProxyCidrs, ['10.1.0.0/16', '::1/128']);
  for (const value of ['true', '1', '0.0.0.0/0', '::/0', '10.0.0.1/33', 'badhost']) assert.throws(() => createConfig({ TRUST_PROXY_CIDRS: value }), /TRUST_PROXY_CIDRS/);
  for (const value of ['http://example.com', 'https://example.com/path', 'https://user:secret@example.com']) assert.throws(() => createConfig({ APP_ORIGIN: value }), /APP_ORIGIN/);
});

test('future server cookies enforce Secure, HttpOnly, SameSite and __Host- scope without caller overrides', () => {
  let headers: string[] | undefined;
  const res = { getHeader() { return headers; }, setHeader(_name: string, value: string[]) { headers = value; return res; } };
  setSecureCookie(res as any, 'session', 'fixture;\r\n=/', 60000);
  assert.deepEqual(headers, ['__Host-session=fixture%3B%0D%0A%3D%2F; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=60']);
  setSecureCookie(res as any, 'session', '', 0);
  assert.equal(headers![1], '__Host-session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
  assert.equal(headers!.length, 2);
  setSecureCookie(res as any, 'other', 'fixture');
  assert.equal(headers![2], '__Host-other=fixture; Path=/; Secure; HttpOnly; SameSite=Lax');
  assert.throws(() => setSecureCookie(res as any, 'session', {} as string));
  for (const name of ['bad;name', '__Host-session', 'bad name']) assert.throws(() => setSecureCookie(res as any, name, 'fixture'));
  for (const age of [-1, NaN, Infinity, {}]) assert.throws(() => setSecureCookie(res as any, 'session', 'fixture', age as number));
});

test('browser HTTP/WS literals are flagged with locations; SVG namespace identifiers are excluded', async () => {
  assert.deepEqual(insecureResourceLiterals('<img src="http://example.com/a">\nfetch("http://localhost/api")\nnew WebSocket("ws://example.com")'), [
    { line: 1, scheme: 'http' }, { line: 2, scheme: 'http' }, { line: 3, scheme: 'ws' },
  ]);
  assert.deepEqual(insecureResourceLiterals('<svg xmlns="http://www.w3.org/2000/svg"/><img src="https://example.com">'), []);
  assert.deepEqual(insecureResourceLiterals('document.createElementNS("http://www.w3.org/2000/svg", "svg")'), []);
  assert.equal(insecureResourceLiterals('fetch("http://www.w3.org/2000/svg")').length, 1);
  assert.equal(insecureResourceLiterals('document.createElementNS("http://example.com/image", "svg")').length, 1);
  assert.deepEqual((await checkBrowserSources(root)).findings, []);
});

test('application cookie writes cannot bypass the secure helper', () => {
  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.[jt]sx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
  }
  for (const file of ['src', 'api', 'server', 'security'].flatMap(dir => files(path.join(root, dir)))) {
    if (file === path.join(root, 'security/cookies.ts')) continue;
    const source = readFileSync(file, 'utf8');
    assert.ok(!/\.\s*cookie\s*\(|document\s*\.\s*cookie\s*=|cookieStore\s*\.\s*set\s*\(|(?:set|append|setHeader)\s*\(\s*['"]set-cookie['"]|['"]set-cookie['"]\s*:/i.test(source), path.relative(root, file));
  }
});

test('provider requests and probes reject redirects before credentials can follow another host or HTTP downgrade', async () => {
  const settings = createConfig({ LTA_ACCOUNT_KEY: 'fixture', DATA_GOV_SG_API_KEY: 'fixture', LTA_PAGE_ATTEMPTS: '1' });
  const urls: string[] = [];
  const redirects: (RequestRedirect | undefined)[] = [];
  const request: typeof fetch = async (input, init) => {
    urls.push(String(input));
    redirects.push(init?.redirect);
    throw new TypeError('fixture redirect rejected');
  };
  assert.equal((await createArrivalService(settings.lta, { request }).arrivals('55329')).kind, 'simulated');
  assert.equal((await createIncidentService(settings.lta, { request }).incidents()).kind, 'unavailable');
  await assert.rejects(createLtaClient(settings.lta, request).fetchAll('BusStops', settings.lta.accountKey));
  const weather = await createWeatherService(settings.weather, settings.public.urls.neaBase, { request }).snapshot();
  assert.equal(weather.missing.length, 12);
  const original = globalThis.fetch;
  let health: any;
  try {
    globalThis.fetch = request;
    await createHealthHandler(settings)({ method: 'GET' } as any, { setHeader() {}, status() { return this; }, json(value: unknown) { health = value; } } as any);
  } finally { globalThis.fetch = original; }
  assert.equal(health.status, 'degraded');
  assert.ok(urls.length >= 6);
  assert.ok(redirects.every(policy => policy === 'error'));
  assert.ok(urls.every(url => url.startsWith('https:')));
});
