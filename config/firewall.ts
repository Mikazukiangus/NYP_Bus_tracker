import { z } from '../shared/input/zod.ts';

// Deployment policy, not runtime env: changing it requires staging/publishing the WAF rule.
export const apiRateLimitPolicy = Object.freeze(z.strictObject({
  name: z.string().min(1).max(160),
  pathPrefix: z.literal('/api/'),
  methods: z.tuple([z.literal('GET'), z.literal('HEAD')]).readonly(),
  requests: z.number().int().min(1).max(10_000_000),
  windowSeconds: z.number().int().min(10).max(600),
}).parse({
  name: 'Public API per-IP limit',
  pathPrefix: '/api/',
  methods: ['GET', 'HEAD'],
  requests: 600,
  windowSeconds: 60,
}));

const stageSchema = z.enum(['log', 'preview', 'production']);
export type FirewallStage = z.infer<typeof stageSchema>;

// Same rule/name through all rollout stages: no extra rule slots or per-path buckets.
export function createApiRateLimitRule(input: FirewallStage) {
  const stage = stageSchema.parse(input);
  const conditions: { type: string; op: string; value: string | readonly string[] }[] = [
    { type: 'path', op: 'pre', value: apiRateLimitPolicy.pathPrefix },
    { type: 'method', op: 'inc', value: [...apiRateLimitPolicy.methods] },
  ];
  const reports = [
    { type: 'path', op: 'eq', value: '/api/client-errors' },
    { type: 'method', op: 'eq', value: 'POST' },
  ];
  if (stage === 'preview') {
    conditions.push({ type: 'environment', op: 'eq', value: 'preview' });
    reports.push({ type: 'environment', op: 'eq', value: 'preview' });
  }
  return {
    name: apiRateLimitPolicy.name,
    description: 'Shared API reads and client-error POST budget per IP and region. User limits await verified login.',
    active: true,
    conditionGroup: [{ conditions }, { conditions: reports }],
    action: { mitigate: { action: 'rate_limit', rateLimit: {
      algo: 'fixed_window', window: apiRateLimitPolicy.windowSeconds,
      limit: apiRateLimitPolicy.requests, keys: ['ip'],
      action: stage === 'log' ? 'log' : 'rate_limit',
    } } },
  };
}

// Separate, opt-in publication artifacts; generating these does not change the existing rule.
// Ten reports/IP/minute fits the browser's own budget and stays below a warm collector's 100.
export function createSensitiveEndpointRules(input: FirewallStage) {
  const stage = stageSchema.parse(input);
  return [
    { name: 'Public health probe limit', path: '/api/health', methods: ['GET', 'HEAD'], requests: 30 },
    { name: 'Anonymous error collector limit', path: '/api/client-errors', methods: ['POST'], requests: 10 },
  ].map(policy => ({
    name: policy.name, description: 'Additional endpoint budget per IP and region; retain the shared API rule.', active: true,
    conditionGroup: [{ conditions: [
      { type: 'path', op: 'eq', value: policy.path }, { type: 'method', op: 'inc', value: policy.methods },
      ...(stage === 'preview' ? [{ type: 'environment', op: 'eq', value: 'preview' }] : []),
    ] }],
    action: { mitigate: { action: 'rate_limit', rateLimit: { algo: 'fixed_window', window: 60,
      limit: policy.requests, keys: ['ip'], action: stage === 'log' ? 'log' : 'rate_limit' } } },
  }));
}
