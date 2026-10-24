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
  if (stage === 'preview') conditions.push({ type: 'environment', op: 'eq', value: 'preview' });
  return {
    name: apiRateLimitPolicy.name,
    description: 'Shared GET/HEAD API budget per source IP and region. User limits await verified login.',
    active: true,
    conditionGroup: [{ conditions }],
    action: { mitigate: { action: 'rate_limit', rateLimit: {
      algo: 'fixed_window', window: apiRateLimitPolicy.windowSeconds,
      limit: apiRateLimitPolicy.requests, keys: ['ip'],
      action: stage === 'log' ? 'log' : 'rate_limit',
    } } },
  };
}
