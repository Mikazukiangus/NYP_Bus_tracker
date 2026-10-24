import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../../config/server.ts';
import { createLogger } from '../../security/redact.ts';
import { createErrorReporter, errorOperations, errorRoutes, SAFE_ERROR_MESSAGE, type ErrorContext } from '../../shared/errors/events.ts';
import { weatherKeys } from '../../shared/weather/types.ts';

const base = createLogger([config.lta.accountKey, config.weather.apiKey]);
export const requestErrors = new AsyncLocalStorage<Omit<ErrorContext, 'operation'>>();
export const serverErrors = createErrorReporter({ source: 'server', ...config.public.errors }, event => base.error('errors.exception', { ...event }));
export function captureServerError(error: unknown, operation: ErrorContext['operation'] = 'server.request_failed', extra: Pick<ErrorContext, 'dataset'> = {}) {
  return serverErrors.capture(error, { ...requestErrors.getStore(), ...extra, operation });
}
export function trackedLog(level: 'warn' | 'error', event: string, details?: Record<string, unknown>) {
  if (details && Object.hasOwn(details, 'error') && (errorOperations as readonly string[]).includes(event)) {
    const dataset = event === 'nea.dataset_refresh_failed' && typeof details.dataset === 'string' && (weatherKeys as readonly string[]).includes(details.dataset)
      ? details.dataset as ErrorContext['dataset'] : undefined;
    captureServerError(details.error, event as ErrorContext['operation'], dataset ? { dataset } : {});
  } else base[level](event, details);
}
function sendUnexpected(res: any, errorId: string | null) {
  if (res.headersSent) { res.end?.(); return; }
  const body = { error: SAFE_ERROR_MESSAGE, ...(errorId ? { errorId } : {}) };
  res.setHeader?.('Cache-Control', 'no-store');
  if (res.status && res.json) return res.status(500).json(body);
  res.writeHead?.(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end?.(JSON.stringify(body));
}
export function withErrorTracking<T extends (req: any, res: any) => unknown>(handler: T, route: typeof errorRoutes[number]) {
  return async (req: any, res: any) => requestErrors.run({
    route, requestId: crypto.randomUUID(),
    method: ['GET', 'HEAD', 'POST', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER',
  }, async () => {
    try { return await handler(req, res); }
    catch (error) { return sendUnexpected(res, captureServerError(error)); }
  });
}
