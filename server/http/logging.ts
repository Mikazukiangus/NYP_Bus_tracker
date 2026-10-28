import type { RequestHandler } from 'express';
import { appLogger } from '../../security/logging.ts';
import { inLogContext, logRoute, withLogContext, type LogRoute, type RequestLogContext } from '../../security/log-context.ts';

function observeResponse(res: any, context: RequestLogContext) {
  const started = performance.now();
  let completed = false;
  if (!res.headersSent) res.setHeader?.('X-Request-ID', context.request.id);
  const finish = () => complete('completed');
  const close = () => complete(res.writableFinished ? 'completed' : 'aborted');
  function complete(outcome: 'completed' | 'aborted' | 'handler_returned') {
    if (completed) return;
    completed = true;
    res.off?.('finish', finish); res.off?.('close', close);
    inLogContext(context, () => appLogger.info('http.request_completed', {
      statusCode: Number.isInteger(res.statusCode) && res.statusCode >= 100 && res.statusCode <= 599 ? res.statusCode : null,
      durationMs: Math.max(0, Math.round((performance.now() - started) * 1000) / 1000), outcome,
    }));
  }
  if (typeof res.once === 'function') { res.once('finish', finish); res.once('close', close); }
  return () => { if (typeof res.once !== 'function') complete('handler_returned'); };
}

export function withRequestLogging<T extends (req: any, res: any) => unknown>(handler: T, route: LogRoute) {
  return async (req: any, res: any) => withLogContext(req, route, async (context, created) => {
    if (!created) return handler(req, res);
    const fallback = observeResponse(res, context);
    try { return await handler(req, res); }
    finally { fallback(); }
  });
}

// Covers standalone transport/middleware errors too; API wrappers reuse this scope and listener pair.
export const requestLoggingMiddleware: RequestHandler = (req, res, next) => withLogContext(req, logRoute(req.url), (context, created) => {
  if (created) observeResponse(res, context);
  next();
});
