import type { ErrorRequestHandler, RequestHandler } from 'express';
import { captureServerError } from '../server/errors/reporting.ts';
import { SAFE_ERROR_MESSAGE } from '../shared/errors/events.ts';

// Express 4 does not forward rejected handler promises to its error middleware automatically.
export const asyncHandler = (handler: (...args: any[]) => unknown): RequestHandler =>
  (req, res, next) => { Promise.resolve().then(() => handler(req, res)).catch(next); };

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = [400, 413, 415].includes(error?.status) ? error.status : 500;
  const errorId = status === 500 ? captureServerError(error) : null;
  if (res.headersSent) { res.end(); return; }
  res.setHeader?.('Cache-Control', 'no-store');
  res.status(status).json({ error: status === 500 ? SAFE_ERROR_MESSAGE : 'Invalid request.', ...(status === 500 && errorId ? { errorId } : {}) });
};
