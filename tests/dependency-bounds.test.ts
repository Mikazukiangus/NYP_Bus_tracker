import test from 'node:test';
import assert from 'node:assert/strict';
import { readDependencyJson } from '../shared/http/circuitBreaker.ts';
import { parseOverpass, createShapeWorkBudget } from '../server/overpassSchema.ts';
import { createConfig } from '../config/schema.ts';
import { createLtaClient } from '../server/lta/client.ts';

test('dependency bodies reject actual decoded bytes beyond the budget before parsing', async () => {
  let parsed = false;
  const response = new Response(JSON.stringify({ value: 'x'.repeat(1000) }), { headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } });
  await assert.rejects(readDependencyJson(response, raw => { parsed = true; return raw; }, { maxBytes: 100 }), /Invalid external data/);
  assert.equal(parsed, false);
});

test('dependency JSON rejects excessive nesting and malformed UTF-8, preserving quoted braces', async () => {
  const response = (body: BodyInit) => new Response(body, { headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(readDependencyJson(response('[[[[[0]]]]]'), x => x, { maxDepth: 4 }), /Invalid external data/);
  await assert.rejects(readDependencyJson(response(new Uint8Array([34, 255, 34])), x => x), /Invalid external data/);
  assert.deepEqual(await readDependencyJson(response('{"text":"[[[[["}'), x => x, { maxDepth: 1 }), { text: '[[[[[' });
});

test('Overpass rejects oversized individual geometry before building routes', () => {
  assert.throws(() => parseOverpass({ elements: [{ type: 'way', id: 1, geometry: Array.from({ length: 20001 }, () => ({ lat: 1.3, lon: 103.8 })) }] }));
});

test('body overflow cancels the stream and cancellation interrupts stalled body reads', async () => {
  let cancelled = 0;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(101)); }, cancel() { cancelled++; } });
  await assert.rejects(readDependencyJson(new Response(body, { headers: { 'Content-Type': 'application/json' } }), x => x, { maxBytes: 100 }));
  assert.equal(cancelled, 1);
  const controller = new AbortController();
  const stalled = readDependencyJson(new Response(new ReadableStream(), { headers: { 'Content-Type': 'application/json' } }), x => x, { signal: controller.signal });
  controller.abort();
  await assert.rejects(stalled, { name: 'AbortError' });
});

test('LTA collections reject excess pages and rows without returning partial datasets', async () => {
  const provider: typeof fetch = async input => {
    const skip = Number(new URL(String(input)).searchParams.get('$skip'));
    return Response.json({ value: Array.from({ length: skip < 2000 ? 500 : 0 }, () => ({})) });
  };
  const settings = { ...createConfig().lta, pageConcurrency: 1 };
  let calls = 0;
  await assert.rejects(createLtaClient({ ...settings, maxPages: 2 }, async (...args) => { calls++; return provider(...args); }).fetchAll('BusStops', 'dummy'), /Invalid external data/);
  assert.equal(calls, 2);
  await assert.rejects(createLtaClient({ ...settings, maxRows: 500 }, provider).fetchAll('BusStops', 'dummy'), /Invalid external data/);
});

test('LTA rejects late completion even if an injected transport ignores cancellation', async () => {
  const request: typeof fetch = async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return Response.json({ value: [] });
  };
  await assert.rejects(createLtaClient({ ...createConfig().lta, collectionTimeoutMs: 5 }, request).fetchAll('BusStops', 'dummy'), { name: 'TimeoutError' });
});

test('shape budgets bound repeated way expansion and worst-case simplification work', () => {
  const budget = createShapeWorkBudget({ routePoints: 5, totalPoints: 8, comparisons: 2 });
  budget.admitRoute(5); budget.admitRoute(3);
  assert.throws(() => budget.admitRoute(1), /work budget/);
  assert.throws(() => createShapeWorkBudget({ routePoints: 5, totalPoints: 8, comparisons: 2 }).admitRoute(6), /work budget/);
  budget.compare(); budget.compare();
  assert.throws(() => budget.compare(), /work budget/);
});
