import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { createIncidentHandler } from '../api/traffic-incidents';
import { createIncidentPager } from '../server/lta/incidentPage';
import { createIncidentService, type IncidentResult } from '../server/lta/incidents';
import { createConfig } from '../config/schema';
import { config } from '../config/server';
import { validateReadRequest } from '../server/http/request';
import { incidentQuerySchema, incidentPagination } from '../shared/transit/incidentPagination';
import { parseIncidentResponse, providerIncidentSchema } from '../shared/transit/incidentValidation';
import { fetchTrafficIncidents } from '../src/features/incidents/client';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const stamp = '2026-10-24T08:00:00.000Z';
function body(count: number, prefix = 'row') {
  return { source: 'LTA_DATAMALL' as const, fetchedAt: stamp,
    incidents: Array.from({ length: count }, (_, i) => ({ type: 'Roadworks', lat: 1.3, lng: 103.8, message: `${prefix}-${String(i).padStart(4, '0')}` })) };
}
function response() {
  let status = 0, value: any;
  const headers: Record<string, string> = {};
  const res = { setHeader(name: string, text: string) { headers[name] = text; }, status(code: number) { status = code; return this; }, json(data: unknown) { value = data; } };
  return { res, read: () => ({ status, value, headers }) };
}
function page(bodyValue: ReturnType<typeof body>, offset = 0, size = 100) {
  const pager = createIncidentPager();
  const first = pager(bodyValue, { limit: size });
  assert.equal(first.kind, 'page');
  if (first.kind !== 'page') throw Error('expected page');
  const result = offset ? pager(bodyValue, { limit: size, offset, snapshot: first.body.pagination.snapshot }) : first;
  assert.equal(result.kind, 'page');
  if (result.kind !== 'page') throw Error('expected page');
  return result.body;
}

// Native request validation is shared by Express and Vercel, before service/cache work.
test('incident page inputs reject malformed/duplicate/unbounded continuation keys before service work', async () => {
  let calls = 0;
  const handler = createIncidentHandler(async () => { calls++; return { kind: 'ok', body: body(3) }; });
  const queries = ['limit=0', 'limit=201', 'limit=-1', 'limit=1.5', 'limit=01', 'limit=1e2', 'limit=%201', 'offset=-1',
    'offset=10001', 'offset=1', 'snapshot=private_input_sentinel', 'limit=2&limit=3', 'offset=0&offset=1', 'limit%5B%5D=2', 'cursor=private_input_sentinel'];
  for (const query of queries) {
    const result = response();
    await handler({ method: 'GET', url: `/api/traffic-incidents?${query}` }, result.res);
    assert.equal(result.read().status, 400, query);
    assert.equal(result.read().headers['Cache-Control'], 'no-store');
    assert.ok(!JSON.stringify(result.read().value).includes('private_input_sentinel'));
  }
  for (const query of [{ limit: ['1'] }, { offset: { value: '0' } }, { limit: 1 }]) {
    const result = response(); await handler({ method: 'GET', query }, result.res); assert.equal(result.read().status, 400);
  }
  assert.equal(calls, 0);
  assert.deepEqual(incidentQuerySchema.parse({ offset: '0' }), { offset: 0 });
  assert.deepEqual(incidentQuerySchema.parse({ limit: '200' }), { limit: 200 });
});

test('offset traversal is deterministic across provider order and owners; duplicates are retained without mutation', () => {
  const original = body(7); original.incidents.push({ ...original.incidents[1] });
  const initialOrder = JSON.stringify(original);
  original.incidents.reverse(); const reversedOrder = JSON.stringify(original);
  const pager = createIncidentPager();
  const first = pager(original, { limit: 3 }); assert.equal(first.kind, 'page');
  if (first.kind !== 'page') return;
  const gathered = [...first.body.incidents]; let next = first.body.pagination.nextOffset;
  while (next !== null) {
    const owner = createIncidentPager();
    const differentOwner = { ...original, fetchedAt: '2026-10-24T08:00:10.000Z', incidents: [...original.incidents].reverse() };
    const result = owner(differentOwner, { limit: 3, offset: next, snapshot: first.body.pagination.snapshot });
    assert.equal(result.kind, 'page'); if (result.kind !== 'page') return;
    gathered.push(...result.body.incidents); next = result.body.pagination.nextOffset;
  }
  assert.deepEqual(gathered.map(row => row.message), JSON.parse(initialOrder).incidents.map((row: { message: string }) => row.message).sort());
  assert.equal(JSON.stringify(original), reversedOrder);
  assert.equal(gathered.length, 8);
});

test('snapshot changes return safe 409/no-store instead of serving shifted offsets; equal content survives timestamp refresh', async () => {
  let current = body(4);
  const handler = createIncidentHandler(async () => ({ kind: 'ok', body: current }));
  const first = response(); await handler({ method: 'GET', query: { limit: '2' } }, first.res);
  const snapshot = first.read().value.pagination.snapshot;
  const req = { method: 'GET', query: { limit: '2', offset: '2', snapshot } };
  current = { ...current, fetchedAt: '2026-10-24T08:01:00.000Z', incidents: [...current.incidents].reverse() };
  const unchanged = response(); await handler(req, unchanged.res); assert.equal(unchanged.read().status, 200);
  current = body(5);
  const changed = response(); await handler(req, changed.res);
  assert.equal(changed.read().status, 409); assert.equal(changed.read().headers['Cache-Control'], 'no-store');
  assert.deepEqual(changed.read().value, { error: 'Incident data changed. Restart from offset 0.', code: 'SNAPSHOT_CHANGED' });
});

test('default/max page sizes, empty/out-of-range results, legacy compatibility and metadata relations are validated', () => {
  const pager = createIncidentPager(), full = body(201);
  const legacy = pager(full, {}); assert.equal(legacy.kind, 'legacy'); if (legacy.kind === 'legacy') assert.equal(legacy.body, full);
  const first = pager(full, { offset: 0 }); assert.equal(first.kind, 'page');
  if (first.kind !== 'page') return;
  assert.equal(first.body.incidents.length, incidentPagination.defaultLimit);
  assert.equal(page(full, 0, 200).incidents.length, 200);
  assert.equal(page(body(0)).pagination.nextOffset, null);
  assert.equal(page(full, 10000).incidents.length, 0);
  assert.ok(parseIncidentResponse(first.body));
  for (const patch of [{ total: 0 }, { nextOffset: 0 }, { nextOffset: null }, { offset: 1 }, { limit: 0 }, { snapshot: 'bad' }, { total: 10001 }]) {
    assert.throws(() => parseIncidentResponse({ ...first.body, pagination: { ...first.body.pagination, ...patch } }), /^Error: Invalid external data\.$/);
  }
  assert.throws(() => parseIncidentResponse({ ...first.body, incidents: first.body.incidents.slice(1) }));
  assert.ok(!providerIncidentSchema.safeParse({ value: Array(10001).fill({ Type: 'X', Latitude: 1, Longitude: 1, Message: 'X' }) }).success);
});

test('each cached incident provider snapshot serves every page with one upstream invocation', async () => {
  let calls = 0;
  const service = createIncidentService({ ...createConfig().lta, accountKey: 'fixture' }, { request: async () => {
    calls++; return Response.json({ value: body(205).incidents.map(row => ({ Type: row.type, Latitude: row.lat, Longitude: row.lng, Message: row.message })) });
  } });
  const handler = createIncidentHandler(service.incidents);
  let snapshot: string | undefined;
  for (const offset of [0, 100, 200]) {
    const result = response(); await handler({ method: 'GET', query: { limit: '100', offset: String(offset), ...(snapshot ? { snapshot } : {}) } }, result.res);
    assert.equal(result.read().status, 200); snapshot = result.read().value.pagination.snapshot;
    assert.equal(result.read().headers['Cache-Control'], 'no-store');
  }
  assert.equal(calls, 1);
});

function useHandler(handler: ReturnType<typeof createIncidentHandler>, seen: { urls: string[]; signals: unknown[] }) {
  globalThis.fetch = async (input, init) => {
    seen.urls.push(String(input)); seen.signals.push(init?.signal);
    const result = response(); const url = new URL(String(input), 'https://fixture.invalid');
    await handler({ method: 'GET', url: url.pathname + url.search }, result.res);
    return Response.json(result.read().value, { status: result.read().status });
  };
}

test('browser drains pages atomically with one deadline and retains every incident for route filtering', async () => {
  const full = body(205); const seen = { urls: [] as string[], signals: [] as unknown[] };
  useHandler(createIncidentHandler(async () => ({ kind: 'ok', body: full })), seen);
  const result = await fetchTrafficIncidents(); assert.equal(result?.incidents.length, 205);
  assert.deepEqual(result?.incidents, full.incidents);
  assert.equal(seen.urls.length, 3); assert.equal(new Set(seen.signals).size, 1);
  assert.ok(seen.signals[0] instanceof AbortSignal);
  assert.ok(seen.urls.slice(1).every(url => new URL(url, 'https://fixture.invalid').searchParams.has('snapshot')));
});

test('browser discards mixed generations, restarts once on 409 and never publishes partial pages', async () => {
  let calls = 0; let current = body(101, 'old');
  const handler = createIncidentHandler(async (): Promise<IncidentResult> => {
    calls++; if (calls === 2) current = body(102, 'new');
    return { kind: 'ok', body: current };
  });
  const seen = { urls: [] as string[], signals: [] as unknown[] }; useHandler(handler, seen);
  const result = await fetchTrafficIncidents(); assert.equal(calls, 4); assert.equal(result?.incidents.length, 102);
  assert.ok(result?.incidents.every(row => row.message.startsWith('new-')));
  let failures = 0; globalThis.fetch = async () => { failures++; return Response.json({}, { status: 409 }); };
  assert.equal(await fetchTrafficIncidents(), null); assert.equal(failures, 2);
});

test('browser rejects broken/missing continuation metadata, changed totals and later-page outages', async () => {
  for (const bad of [null, 'missing', 'differentSnapshot', 'differentTotal', 'wrongOffset', 429]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++; const next = page(body(101), calls === 1 ? 0 : 100);
      if (calls === 1) return Response.json(next);
      if (bad === 429) return Response.json({}, { status: 429 });
      if (bad === null) return Response.json({ ...next, pagination: { ...next.pagination, nextOffset: 'https://bad.invalid' } });
      if (bad === 'missing') { const { pagination: _, ...legacy } = next; return Response.json(legacy); }
      if (bad === 'differentSnapshot') next.pagination.snapshot = 'f'.repeat(64);
      if (bad === 'differentTotal') next.pagination.total = 100;
      if (bad === 'wrongOffset') next.pagination.offset = 99;
      return Response.json(next);
    };
    assert.equal(await fetchTrafficIncidents(), null); assert.equal(calls, 2);
  }
});

test('browser supports old complete responses and one bounded old-server query fallback', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(calls === 1 ? {} : body(2), { status: calls === 1 ? 400 : 200 }); };
  assert.equal((await fetchTrafficIncidents())?.incidents.length, 2); assert.equal(calls, 2);
  globalThis.fetch = async () => Response.json(body(1));
  assert.equal((await fetchTrafficIncidents())?.incidents.length, 1);
});

test('real HTTP pagination preserves HEAD, preflights, method guards and unpaged legacy completeness', async () => {
  let calls = 0; const full = body(205);
  const handler = createIncidentHandler(async () => { calls++; return { kind: 'ok', body: full }; });
  const app = express(); app.all('/api/traffic-incidents', (req, res) => { void handler(req, res); });
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}/api/traffic-incidents`;
    const first = await originalFetch(base + '?limit=100'); assert.equal(first.status, 200); const parsed = parseIncidentResponse(await first.json()); assert.equal(parsed.incidents.length, 100);
    const head = await originalFetch(base + '?limit=100', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    const legacy = await originalFetch(base); assert.equal(parseIncidentResponse(await legacy.json()).incidents.length, 205);
    const before = calls;
    const preflight = await originalFetch(base, { method: 'OPTIONS', headers: { Origin: config.security.appOrigin, 'Access-Control-Request-Method': 'GET' } });
    assert.equal(preflight.status, 204); assert.equal(calls, before);
    const invalid = response(); validateReadRequest({ method: 'GET', query: { limit: '0' } }, invalid.res, incidentQuerySchema); assert.equal(invalid.read().status, 400);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
