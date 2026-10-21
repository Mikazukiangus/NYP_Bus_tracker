import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { LookupOptions } from 'node:dns';
import { createServer } from 'node:http';
import { MockAgent } from 'undici';
import { assertPublicUrl, createGuardedLookup, createSafeFetcher, isPublicAddress, safeFetch, SsrfBlockedError, type AddressResolver } from '../security/ssrf.ts';
import { createConfig } from '../config/schema.ts';
import { createArrivalService } from '../server/lta/arrivals.ts';
import { createIncidentService } from '../server/lta/incidents.ts';
import { createLtaClient } from '../server/lta/client.ts';
import { createWeatherService } from '../server/weather/service.ts';
import { createHealthHandler } from '../api/health.ts';
import { redact } from '../security/redact.ts';

const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
const public4 = { address: '93.184.215.14', family: 4 };
const public6 = { address: '2606:4700:4700::1111', family: 6 };
function resolveWith(resolve: AddressResolver, options: LookupOptions = { all: true }) {
  return new Promise<{ address: unknown; family: unknown }>((accept, reject) => {
    createGuardedLookup(resolve)('public.example', options, (error, address, family) => error ? reject(error) : accept({ address, family }));
  });
}

test('SSRF address policy rejects private, metadata, special-use and IPv6 transition ranges', () => {
  for (const address of ['0.0.0.0', '0.1.2.3', '10.0.0.1', '100.64.0.1', '100.100.100.200', '100.127.255.255',
    '127.0.0.1', '127.255.255.255', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '168.63.129.16', '192.0.0.1', '192.0.2.1', '198.18.1.1', '198.19.255.255', '198.51.100.1', '203.0.113.1',
    '224.0.0.1', '239.1.2.3', '240.0.0.1', '255.255.255.255', '::', '::1', 'fe80::1', 'fec0::1', 'fc00::1', 'fd00:ec2::254',
    'ff02::1', '::ffff:127.0.0.1', '::ffff:93.184.215.14', '::127.0.0.1', '64:ff9b::a00:1', '64:ff9b:1::1',
    '2002:7f00:1::1', '2001::1', '2001:db8::1', '2001:20::1', '3fff::1', '4000::1', 'fe80::1%en0', 'not-an-ip']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['8.8.8.8', public4.address, '100.63.255.255', '100.128.0.1', '172.15.255.255', '172.32.0.1', public6.address]) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test('SSRF URL policy catches alternate IP encodings, unsafe schemes and ambiguous authorities', () => {
  for (const url of ['file:///etc/passwd', 'ftp://public.example/file', 'data:text/plain,hello', 'gopher://public.example',
    'javascript:alert(1)', '//public.example', '/relative', 'https:public.example', 'https://user:pass@public.example',
    'https://@public.example', 'https://public.example/#', 'https://public.example/#secret', 'https://public.example/\npath',
    ' https://public.example', 'https://public.example\\@127.0.0.1', 'https://localhost', 'https://LOCALHOST.',
    'https://a.localhost.', 'https://metadata.google.internal', 'https://printer.local', 'https://router.home.arpa', 'https://intranet',
    'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://0177.0.0.1', 'http://%31%32%37.0.0.1',
    'https://[::1]', 'https://[::ffff:7f00:1]', 'https://169.254.169.254/latest/meta-data/', 'https://public.example/' + 'a'.repeat(4096)]) {
    assert.throws(() => assertPublicUrl(url), SsrfBlockedError, url);
  }
  assert.throws(() => assertPublicUrl({} as string), SsrfBlockedError);
  for (const url of ['https://public.example/path?search=a%20b', 'http://public.example/path', 'https://public.example:8443/path',
    'https://8.8.8.8/', 'https://[2606:4700:4700::1111]/', 'https://public.example.']) assert.ok(assertPublicUrl(url));
});

test('socket lookup returns exactly the validated addresses and checks new resolutions for rebinding', async () => {
  let calls = 0;
  const resolve: AddressResolver = async () => ++calls === 1 ? [public4, public6] : [{ address: '127.0.0.1', family: 4 }];
  assert.deepEqual((await resolveWith(resolve)).address, [public4, public6]);
  await assert.rejects(resolveWith(resolve), SsrfBlockedError);
  assert.equal(calls, 2);
  assert.deepEqual(await resolveWith(async () => [public4, public6], { family: 6 }), { address: public6.address, family: 6 });
  assert.deepEqual((await resolveWith(async () => [public4, public6], { family: 4, all: true })).address, [public4]);
});

test('socket lookup fails closed on mixed public/private results, empty answers and resolution errors', async () => {
  for (const records of [[public4, { address: '::1', family: 6 }], [public6, { address: '10.0.0.1', family: 4 }], [],
    [{ address: 'bad', family: 4 }], [{ ...public4, family: 6 }], Array(65).fill(public4)]) {
    await assert.rejects(resolveWith(async () => records, { family: 4, all: true }), SsrfBlockedError);
  }
  await assert.rejects(resolveWith(async () => { throw new Error('DNS_PRIVATE_SENTINEL'); }), error => {
    assert.ok(error instanceof SsrfBlockedError);
    assert.ok(!String(error).includes('DNS_PRIVATE_SENTINEL'));
    return true;
  });
});

test('guarded native fetch never opens a socket to a private literal or resolved private destination', async () => {
  let sockets = 0, requests = 0, resolutions = 0;
  const trap = createServer((_req, res) => { requests++; res.end('private trap'); });
  trap.on('connection', () => { sockets++; });
  await new Promise<void>(resolve => trap.listen(0, '127.0.0.1', resolve));
  const address = trap.address(); assert.ok(address && typeof address === 'object');
  const client = createSafeFetcher(async () => { resolutions++; return [{ address: '127.0.0.1', family: 4 }]; });
  try {
    await assert.rejects(client.fetch(`http://127.0.0.1:${address.port}/`), SsrfBlockedError);
    assert.equal(resolutions, 0);
    await assert.rejects(client.fetch(`http://public.example:${address.port}/`, { signal: AbortSignal.timeout(2000) }), SsrfBlockedError);
    assert.ok(resolutions > 0, 'the real native socket connector must invoke the guarded lookup');
    assert.equal(sockets, 0); assert.equal(requests, 0);
  } finally { await client.close(); await new Promise<void>(resolve => trap.close(() => resolve())); }
});

test('safe fetch pins its dispatcher and redirect policy, snapshots URLs and accepts Request inputs', async () => {
  const calls: { url: string; options: any }[] = [];
  globalThis.fetch = async (input, options) => { calls.push({ url: input instanceof Request ? input.url : String(input), options }); return Response.json({ ok: true }); };
  const unsafeDispatcher = {};
  const url = new URL('https://public.example/data?key=fixture');
  assert.equal((await safeFetch(url, { redirect: 'follow', dispatcher: unsafeDispatcher, headers: { Accept: 'application/json' } } as RequestInit)).status, 200);
  url.hostname = '127.0.0.1';
  await safeFetch(new Request('https://public.example/request', { headers: { Accept: 'application/json' } }));
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.startsWith('https://public.example/'));
  for (const { options } of calls) { assert.equal(options.redirect, 'error'); assert.notEqual(options.dispatcher, unsafeDispatcher); assert.equal(options.headers.get('accept'), 'application/json'); }
  for (const name of ['Host', 'Proxy-Authorization', 'Connection', 'Upgrade']) await assert.rejects(safeFetch('https://public.example', {headers:{[name]:'fixture'}}), SsrfBlockedError);
  await assert.rejects(safeFetch(new Request('https://127.0.0.1')), SsrfBlockedError);
  assert.equal(calls.length, 2);
});

test('native fetch cannot follow redirects even when callers request follow or manual modes', async () => {
  const mock = new MockAgent(); mock.disableNetConnect();
  const pool = mock.get('https://public.example');
  let targets = 0;
  pool.intercept({path:'/private'}).reply(() => { targets++; return {statusCode:200, data:'private'}; });
  for (const [index, location] of ['http://127.0.0.1/private', '/private', 'file:///etc/passwd', 'https://other.example/private'].entries()) {
    pool.intercept({path:'/redirect'+index}).reply(302, '', {headers:{location}});
  }
  // Replace only fixture network I/O. Native fetch still enforces the wrapper's redirect mode.
  globalThis.fetch = (input, options) => nativeFetch(input, {...options, dispatcher:mock} as RequestInit);
  try {
    for (let i = 0; i < 4; i++) await assert.rejects(safeFetch('https://public.example/redirect'+i, {redirect:i%2?'manual':'follow'}), /Outbound request failed/);
    assert.equal(targets, 0);
  } finally { await mock.close(); }
});

test('redirect responses and native errors expose no supplied destination, credentials or cause', async () => {
  let cancelled = 0;
  globalThis.fetch = async () => new Response(new ReadableStream({cancel(){cancelled++;}}), {status:302, headers:{Location:'http://127.0.0.1/secret'}});
  await assert.rejects(safeFetch('https://public.example'), SsrfBlockedError);
  assert.equal(cancelled,1);
  globalThis.fetch = async () => {throw new TypeError('URL_PRIVATE_SENTINEL', {cause:new Error('KEY_PRIVATE_SENTINEL')});};
  await assert.rejects(safeFetch('https://public.example?token=fixture'), error => {
    assert.ok(error instanceof Error); assert.equal(error.message,'Outbound request failed.'); assert.equal(error.cause,undefined);
    assert.ok(!JSON.stringify(redact({error})).includes('SENTINEL')); return true;
  });
  globalThis.fetch = async () => {throw new DOMException('URL_PRIVATE_SENTINEL','TimeoutError');};
  await assert.rejects(safeFetch('https://public.example'), error => error instanceof Error && error.name==='TimeoutError' && !error.message.includes('SENTINEL'));
});

test('all default provider transports and health probes reject private configuration before network calls', async () => {
  let calls = 0;
  globalThis.fetch = async () => {calls++; throw new Error('private destinations must not reach fetch');};
  const settings = createConfig({LTA_ACCOUNT_KEY:'test-lta', LTA_API_BASE_URL:'https://127.0.0.1', VITE_NEA_API_BASE_URL:'https://127.0.0.1', LTA_PAGE_ATTEMPTS:'1'});
  assert.equal((await createArrivalService(settings.lta).arrivals('55329')).kind,'simulated');
  assert.equal((await createIncidentService(settings.lta).incidents()).kind,'unavailable');
  await assert.rejects(createLtaClient(settings.lta).fetchAll('BusStops',settings.lta.accountKey));
  assert.equal((await createWeatherService(settings.weather,settings.public.urls.neaBase).snapshot()).missing.length,12);
  let health:any;
  await createHealthHandler(settings)({method:'GET'}, {setHeader(){},status(){return this;},json(body:unknown){health=body;}});
  assert.equal(health.status,'degraded'); assert.equal(calls,0);
});
