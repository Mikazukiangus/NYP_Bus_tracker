import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { apiRateLimitPolicy, createApiRateLimitRule } from '../config/firewall';

function matches(rule: ReturnType<typeof createApiRateLimitRule>, path: string, method: string, environment: string) {
  return rule.conditionGroup.some(group => group.conditions.every(condition => {
    const value = { path, method, environment }[condition.type];
    if (condition.op === 'pre') return value?.startsWith(String(condition.value));
    if (condition.op === 'inc') return Array.isArray(condition.value) && condition.value.includes(value);
    return value === condition.value;
  }));
}

test('all public API adapters and the rewrite alias share the same IP budget', () => {
  const rule = createApiRateLimitRule('production');
  const paths = readdirSync(new URL('../api/', import.meta.url)).filter(name => name.endsWith('.ts')).map(name => `/api/${name.slice(0, -3)}`);
  const platform = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  paths.push(...platform.rewrites.filter((rewrite: { source: string }) => rewrite.source === '/api/BusArrival').map((rewrite: { source: string }) => rewrite.source));
  assert.ok(paths.includes('/api/BusArrival'));
  for (const path of [...paths, '/api/future-endpoint', '/api/bus-arrival/']) {
    for (const method of ['GET', 'HEAD']) assert.equal(matches(rule, path, method, 'production'), true, `${method} ${path}`);
  }
  const limit = rule.action.mitigate.rateLimit;
  assert.deepEqual(limit.keys, ['ip']); // No attacker-controlled header/user/query/path/host key.
  assert.equal(limit.action, 'rate_limit');
  assert.ok(limit.limit >= 10 * (60 / 15 + 10 * 60 / 30)); // Headroom for trip/saved-stop polling.
});

test('preflights, unsupported writes and static map/data/UI requests remain outside the API rule', () => {
  const rule = createApiRateLimitRule('production');
  for (const path of ['/', '/assets/index.js', '/bus-routes/network.json', '/route-shapes/72.json', '/apiculture']) {
    assert.equal(matches(rule, path, 'GET', 'production'), false);
  }
  for (const method of ['OPTIONS', 'POST', 'PUT', 'DELETE']) assert.equal(matches(rule, '/api/weather', method, 'production'), false);
  assert.equal(matches(rule, '/api/client-errors', 'POST', 'production'), true);
  for (const path of ['/api/client-errors/', '/api/client-errors/extra', '/api/client-errors-other']) assert.equal(matches(rule, path, 'POST', 'production'), false);
  assert.equal(matches(createApiRateLimitRule('preview'), '/api/client-errors', 'POST', 'production'), false);
  assert.equal(matches(createApiRateLimitRule('preview'), '/api/client-errors', 'POST', 'preview'), true);
});

test('rollout logs first, restricts enforcement to previews, then enforces production without widening paths', () => {
  const log = createApiRateLimitRule('log');
  const preview = createApiRateLimitRule('preview');
  assert.equal(log.action.mitigate.rateLimit.action, 'log');
  assert.equal(matches(log, '/api/health', 'GET', 'production'), true);
  assert.equal(matches(preview, '/api/health', 'GET', 'production'), false);
  assert.equal(matches(preview, '/api/health', 'GET', 'preview'), true);
  assert.equal(preview.name, log.name);
  assert.equal(preview.action.mitigate.rateLimit.action, 'rate_limit');
  assert.throws(() => createApiRateLimitRule('typo' as 'log'));
  preview.action.mitigate.rateLimit.keys.push('header:x-user-id');
  assert.deepEqual(createApiRateLimitRule('production').action.mitigate.rateLimit.keys, ['ip']);
  assert.equal(apiRateLimitPolicy.requests, 600);
});

test('offline CLI outputs parseable native policy and rejects missing/unknown stages', () => {
  const script = new URL('../scripts/write-firewall-rule.ts', import.meta.url);
  const result = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', script.pathname, 'log'], { encoding: 'utf8' }));
  assert.deepEqual(result, createApiRateLimitRule('log'));
  for (const args of [[], ['typo'], ['production', 'extra']]) {
    const bad = spawnSync(process.execPath, ['--import', 'tsx', script.pathname, ...args], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.equal(bad.stdout, '');
    assert.match(bad.stderr, /Usage:/);
  }
});
