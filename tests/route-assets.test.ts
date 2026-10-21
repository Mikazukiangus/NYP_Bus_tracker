import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssetCache } from '../src/features/tracking/assetCache';
import { createRouteRepository } from '../src/features/tracking/routeRepository';
import { createShapeRepository } from '../src/features/tracking/shapeRepository';

const route = (serviceNo = '72', datasetVersion = 'generation-a') => ({
  serviceNo, datasetVersion, operator: 'GAS', category: 'Trunk',
  direction1: { origin: 'Start', destination: 'End', path: [[1.3, 103.8], [1.31, 103.81]], stops: [
    { code: '01001', name: 'Start', road: 'Road', lat: 1.3, lng: 103.8 },
    { code: '01002', name: 'End', road: 'Road', lat: 1.31, lng: 103.81 },
  ] },
});
const shapes = (serviceNo = '72') => ({ serviceNo, shapes: [{ osmId: 1, path: [[1.3, 103.8], [1.31, 103.81]] }] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

test('tracking and selected legs share route/shape requests and reuse settled successes', async () => {
  const calls: string[] = [];
  const request: typeof fetch = async input => {
    const url = String(input); calls.push(url);
    const service = /\/([^/]+)\.json$/.exec(url)![1];
    return Response.json(url.includes('route-shapes') ? shapes(service) : route(service));
  };
  const routes = createRouteRepository({ freshnessMs: 1000 }, { request });
  const geometry = createShapeRepository({ freshnessMs: 1000 }, { request });
  const load = async (service: string) => Promise.all([
    routes.fetchBusRoute(service, 'generation-a'), geometry.fetchRouteShapes(service),
  ]);
  const results = await Promise.all(['72', ' 72 ', '45'].map(load));
  assert.equal(calls.length, 4); // Previously six for these overlapping consumers.
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0][0].status, 'ok');
  assert.equal(results[0][1].length, 1);
  assert.deepEqual(await load('72'), results[0]);
  assert.equal(calls.length, 4);
});

test('route cache isolates service and requested generation including unversioned loads', async () => {
  let version = 'generation-a';
  const calls: string[] = [];
  const request: typeof fetch = async input => {
    const url = String(input); calls.push(url);
    if (url.includes('index.json')) return Response.json({ services: ['72'] });
    return Response.json(route('72', version));
  };
  const repo = createRouteRepository({ freshnessMs: 1000 }, { request });
  assert.equal((await repo.fetchBusRoute('72', version)).status, 'ok');
  version = 'generation-b';
  const newer = await repo.fetchBusRoute('72', version);
  assert.equal(newer.status, 'ok');
  if (newer.status === 'ok') assert.equal(newer.route.datasetVersion, version);
  assert.equal((await repo.fetchBusRoute('72')).status, 'ok');
  assert.equal(calls.length, 3);
  assert.equal((await repo.fetchBusRoute('72', 'generation-c')).status, 'unavailable');
  const count = calls.length;
  assert.equal((await repo.fetchBusRoute('72', 'generation-a')).status, 'ok');
  assert.equal(calls.length, count);
});

test('lowercase and padded services use canonical URLs and one shared result', async () => {
  const calls: string[] = [];
  const request: typeof fetch = async input => {
    const url = String(input); calls.push(url);
    return Response.json(url.includes('route-shapes') ? shapes('10A') : route('10A'));
  };
  const repo = createRouteRepository({ freshnessMs: 1000 }, { request });
  const geometry = createShapeRepository({ freshnessMs: 1000 }, { request });
  await Promise.all([repo.fetchBusRoute(' 10a '), repo.fetchBusRoute('10A'),
    geometry.fetchRouteShapes(' 10a '), geometry.fetchRouteShapes('10A')]);
  assert.deepEqual(calls.sort(), ['/bus-routes/10A.json', '/route-shapes/10A.json']);
});

test('invalid static routes fall back, while unavailable and not-found routes remain retryable', async () => {
  let mode: 'unavailable' | 'missing' | 'ok' = 'unavailable';
  let apiCalls = 0;
  const request: typeof fetch = async input => {
    const url = String(input);
    if (url.includes('index.json')) return Response.json({ services: ['72'] });
    if (!url.includes('/api/')) return Response.json(route('45'));
    apiCalls++;
    return mode === 'ok' ? Response.json(route()) : new Response('', { status: mode === 'missing' ? 404 : 503 });
  };
  const repo = createRouteRepository({ freshnessMs: 1000 }, { request });
  assert.equal((await repo.fetchBusRoute('72')).status, 'unavailable');
  mode = 'missing';
  assert.equal((await repo.fetchBusRoute('72')).status, 'not_found');
  mode = 'ok';
  assert.equal((await repo.fetchBusRoute('72')).status, 'ok');
  assert.equal((await repo.fetchBusRoute('72')).status, 'ok');
  assert.equal(apiCalls, 3);
});

test('failed route indexes retry and successful indexes share and expire', async () => {
  let time = 0, indexCalls = 0, apiCalls = 0;
  const request: typeof fetch = async input => {
    if (String(input).includes('index.json')) {
      indexCalls++;
      return indexCalls === 1 ? new Response('<html>') : Response.json({ services: ['72'] });
    }
    if (String(input).includes('/api/')) apiCalls++;
    return new Response('', { status: 503 });
  };
  const repo = createRouteRepository({ freshnessMs: 1000 }, { request, now: () => time });
  assert.equal((await repo.fetchBusRoute('45')).status, 'unavailable');
  const missing = await Promise.all(['45', '50'].map(code => repo.fetchBusRoute(code)));
  assert.deepEqual(missing.map(r => r.status), ['not_found', 'not_found']);
  assert.equal(indexCalls, 2); assert.equal(apiCalls, 1);
  time = 1000;
  assert.equal((await repo.fetchBusRoute('45')).status, 'not_found');
  assert.equal(indexCalls, 3);
});

test('malformed, HTML, HTTP and network shape failures never poison success cache', async () => {
  for (const fail of [
    () => Response.json({ ...shapes(), serviceNo: '45' }),
    () => Response.json({ shapes: [null] }),
    () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('', { status: 503 }),
    () => { throw new Error('fixture connection failure'); },
  ]) {
    let calls = 0;
    const repo = createShapeRepository({ freshnessMs: 1000 }, { request: async () => ++calls === 1 ? fail() : Response.json(shapes()) });
    assert.deepEqual(await repo.fetchRouteShapes('72'), []);
    assert.equal((await repo.fetchRouteShapes('72')).length, 1);
    assert.equal((await repo.fetchRouteShapes('72')).length, 1);
    assert.equal(calls, 2);
  }
});

test('validated empty shapes cache while expired failures allow immediate recovery', async () => {
  let time = 0, calls = 0, available = true;
  const repo = createShapeRepository({ freshnessMs: 1000 }, { now: () => time, request: async () => {
    calls++;
    return available ? Response.json({ serviceNo: '72', shapes: [] }) : new Response('', { status: 503 });
  } });
  assert.deepEqual(await repo.fetchRouteShapes('72'), []);
  time = 999;
  assert.deepEqual(await repo.fetchRouteShapes('72'), []);
  assert.equal(calls, 1);
  time = 1000; available = false;
  await repo.fetchRouteShapes('72');
  available = true;
  await repo.fetchRouteShapes('72');
  assert.equal(calls, 3);
});

test('asset expiry is fixed at completion and clock rollback invalidates settled values', async () => {
  let time = 0, calls = 0;
  const gate = deferred<number>();
  const get = createAssetCache<number>({ freshnessMs: 1000 }, () => true, () => time);
  const load = () => { calls++; return calls === 1 ? gate.promise : Promise.resolve(calls); };
  const first = get('72', load);
  const shared = get('72', load);
  assert.equal(first, shared);
  time = 500;
  gate.resolve(1);
  await first;
  time = 1499; assert.equal(await get('72', load), 1);
  time = 1500; assert.equal(await get('72', load), 2);
  time = 1499; assert.equal(await get('72', load), 3);
});

test('LRU bounds settled assets without evicting pending work or leaking across stores', async () => {
  const get = createAssetCache<number>({ freshnessMs: 1000, maxEntries: 2 }, () => true, () => 0);
  const gate = deferred<number>();
  const pending = get('pending', () => gate.promise);
  await get('a', async () => 1); await get('b', async () => 2);
  assert.equal(await get('a', async () => 99), 1); // Touch A, so B is evicted next.
  await get('c', async () => 3);
  assert.equal(await get('b', async () => 4), 4);
  assert.equal(get('pending', async () => 99), pending);
  gate.resolve(5); assert.equal(await pending, 5);
  const separate = createAssetCache<number>({ freshnessMs: 1000 }, () => true, () => 0);
  assert.equal(await separate('pending', async () => 6), 6);
});

test('pending-only mode shares work, clears rejected promises and validates settings', async () => {
  const get = createAssetCache<number>({ freshnessMs: 0 }, () => true);
  let calls = 0;
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([get('72', load), get('72', load)]), [1, 1]);
  assert.equal(await get('72', load), 2);
  await assert.rejects(get('72', async () => { throw new Error('fixture'); }));
  assert.equal(await get('72', load), 3);
  for (const settings of [{ freshnessMs: -1 }, { freshnessMs: NaN }, { freshnessMs: 1, maxEntries: 0 }]) {
    assert.throws(() => createAssetCache(settings, () => true), RangeError);
  }
});
