import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from './logger.ts';

// Express 4 does not forward rejected handler promises to its error middleware automatically.
export const asyncHandler = (handler: (...args: any[]) => unknown): RequestHandler =>
  (req, res, next) => { Promise.resolve().then(() => handler(req, res)).catch(next); };

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  logger.error('server.request_failed', { error });
  if (res.headersSent) { res.end(); return; }
  const status = [400, 413, 415].includes(error?.status) ? error.status : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error.' : 'Invalid request.' });
};
