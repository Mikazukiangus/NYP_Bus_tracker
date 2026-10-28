import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { errorRoutes, type ErrorContext } from '../shared/errors/events.ts';

export type LogRoute = typeof errorRoutes[number];
export type RequestLogContext = Readonly<{
  request: Readonly<{ id: string; method: NonNullable<ErrorContext['method']>; route: LogRoute }>;
  user: Readonly<{ kind: 'anonymous' }>;
}>;
const scopes = new AsyncLocalStorage<{ owner: object; context: RequestLogContext }>();
const anonymous = Object.freeze({ kind: 'anonymous' as const });

export function currentLogContext() { return scopes.getStore()?.context; }

// Only a fixed route label survives. Never retain a path parameter, query, URL or identity header.
export function logRoute(url: unknown): LogRoute {
  if (typeof url !== 'string') return 'other';
  const path = url.split('?', 1)[0].toLowerCase();
  if (path === '/api/busarrival') return '/api/bus-arrival';
  return errorRoutes.find(route => route.toLowerCase() === path) ?? 'other';
}

export function withLogContext<T>(req: { method?: unknown }, route: LogRoute, run: (context: RequestLogContext, created: boolean) => T): T {
  const existing = scopes.getStore();
  if (existing?.owner === req) return run(existing.context, false);
  const context: RequestLogContext = Object.freeze({
    request: Object.freeze({ id: randomUUID(), route,
      method: (['GET', 'HEAD', 'POST', 'OPTIONS'] as const).find(method => method === req.method) ?? 'OTHER' }),
    user: anonymous,
  });
  return scopes.run({ owner: req, context }, () => run(context, true));
}

// Response events can be emitted outside the request's async chain (or under another request).
export function inLogContext<T>(context: RequestLogContext, run: () => T): T {
  return scopes.run({ owner: {}, context }, run);
}
