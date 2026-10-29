import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as firewall from '../config/firewall.ts';
import { reportPolicy } from '../shared/errors/events.ts';

test('separate edge budgets prevent one IP consuming a warm collector window and bound health probes', () => {
  assert.equal(typeof firewall.createSensitiveEndpointRules, 'function');
  const [health, collector] = firewall.createSensitiveEndpointRules('production');
  assert.equal(health.action.mitigate.rateLimit.limit, 30);
  assert.equal(collector.action.mitigate.rateLimit.limit, 10);
  assert.ok(collector.action.mitigate.rateLimit.limit < reportPolicy.serverEvents);
  assert.deepEqual(collector.action.mitigate.rateLimit.keys, ['ip']);
  assert.deepEqual(collector.conditionGroup[0].conditions, [
    { type: 'path', op: 'eq', value: '/api/client-errors' }, { type: 'method', op: 'inc', value: ['POST'] },
  ]);
  assert.deepEqual(health.conditionGroup[0].conditions, [
    { type: 'path', op: 'eq', value: '/api/health' }, { type: 'method', op: 'inc', value: ['GET', 'HEAD'] },
  ]);
  for (const rule of firewall.createSensitiveEndpointRules('preview')) assert.deepEqual(rule.conditionGroup[0].conditions.at(-1), { type: 'environment', op: 'eq', value: 'preview' });
  for (const rule of firewall.createSensitiveEndpointRules('log')) assert.equal(rule.action.mitigate.rateLimit.action, 'log');
  assert.throws(() => firewall.createSensitiveEndpointRules('unsafe' as any));
});
