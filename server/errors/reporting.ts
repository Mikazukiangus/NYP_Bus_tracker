import { config } from '../../config/server.ts';
import { appLogger as base } from '../../security/logging.ts';
import { currentLogContext } from '../../security/log-context.ts';
import { withRequestLogging } from '../http/logging.ts';
import { createErrorReporter, errorOperations, errorRoutes, SAFE_ERROR_MESSAGE, type ErrorContext } from '../../shared/errors/events.ts';
import { weatherKeys } from '../../shared/weather/types.ts';

export const serverErrors = createErrorReporter({ source: 'server', ...config.public.errors }, event => base.error('errors.exception', { ...event }));
export function captureServerError(error: unknown, operation: ErrorContext['operation'] = 'server.request_failed', extra: Pick<ErrorContext, 'dataset'> = {}) {
  const request = currentLogContext()?.request;
  return serverErrors.capture(error, { ...(request ? { route: request.route, requestId: request.id, method: request.method } : {}), ...extra, operation });
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
  return withRequestLogging(async (req: any, res: any) => {
    try { return await handler(req, res); }
    catch (error) { return sendUnexpected(res, captureServerError(error)); }
  }, route);
}
