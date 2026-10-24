import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConfig } from '../config/schema';
import { createWeatherService } from '../server/weather/service';
import { parseForecast2h } from '../shared/weather/parsers';

import { neaFixture as raw } from './fixtures/nea';

test('weather refresh consumes only its window budget, then fills a partial snapshot', async () => {
  let now = Date.UTC(2026, 9, 19);
  let calls = 0;
  const settings = createConfig().weather;
  const request: typeof fetch = async () => { calls++; return Response.json(raw()); };
  const service = createWeatherService(settings, 'https://fixture.invalid', { request, now: () => now });
  const first = await service.snapshot();
  assert.equal(calls, 5);
  assert.equal(first.missing.length, 7);
  await service.snapshot();
  assert.equal(calls, 5);
  now += settings.rateWindowMs + 1;
  assert.equal((await service.snapshot()).missing.length, 2);
  now += settings.rateWindowMs + 1;
  const complete = await service.snapshot();
  assert.deepEqual(complete.missing, []);
  assert.deepEqual(complete.stale, []);
  assert.equal(calls, 12);
  // Browser fallback and server use the exact same forecast normalization.
  assert.deepEqual(complete.forecast2h, parseForecast2h(raw()));
});

test('weather retains last good values and timestamps when refreshes fail', async () => {
  let now = Date.UTC(2026, 9, 19);
  let failed = false;
  const warnings: string[] = [];
  const settings = { ...createConfig().weather, apiKey: 'fixture', keyedBudget: 12 };
  const request: typeof fetch = async () => failed ? new Response('', { status: 503 }) : Response.json(raw());
  const service = createWeatherService(settings, 'https://fixture.invalid', {
    request, now: () => now, logger: { warn: (_event, metadata) => { warnings.push(String(metadata.dataset)); } },
  });
  const before = await service.snapshot();
  failed = true;
  now += settings.outlookTtlMs + 1;
  const after = await service.snapshot();
  assert.deepEqual(after.missing, []);
  assert.equal(after.stale.length, 12);
  assert.deepEqual(after.forecast2h, before.forecast2h);
  assert.deepEqual(after.fetchedAt, before.fetchedAt);
  assert.equal(warnings.length, 12);
});

test('overlapping weather requests reserve the budget before awaiting the provider', async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const request: typeof fetch = async () => { calls++; await gate; return Response.json(raw()); };
  const service = createWeatherService(createConfig().weather, 'https://fixture.invalid', { request });
  const first = service.snapshot();
  const second = service.snapshot();
  await Promise.resolve();
  assert.equal(calls, 5);
  release();
  assert.equal((await first).missing.length, 7);
  assert.equal((await second).missing.length, 7);
});

test('weather service caches are isolated and failures never fabricate readings', async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return new Response('', { status: 500 }); };
  const settings = createConfig().weather;
  const a = createWeatherService(settings, 'https://fixture.invalid', { request });
  const b = createWeatherService(settings, 'https://fixture.invalid', { request });
  assert.equal((await a.snapshot()).missing.length, 12);
  assert.equal((await b.snapshot()).missing.length, 12);
  assert.equal(calls, 10);
});
