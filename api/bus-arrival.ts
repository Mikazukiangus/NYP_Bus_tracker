import type { Request, Response } from 'express';
import { config } from '../config/server.ts';
import { cdnCache } from '../config/schema.ts';
import { logger } from '../security/logger.ts';
import { createArrivalService } from '../server/lta/arrivals.ts';
import { validateReadRequest, arrivalQuerySchema } from '../server/http/request.ts';
export type { LTABusArrival, LTAService, LTABusArrivalResponse } from '../server/lta/arrivalTypes.ts';
const service = createArrivalService(config.lta, { logger });
function send(res: Response | any, status: number, body: unknown, cacheControl?: string) {
  if (cacheControl && res.setHeader) res.setHeader('Cache-Control', cacheControl);
  if (res.status && typeof res.status === 'function') return res.status(status).json(body);
  if (res.writeHead) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...(cacheControl ? { 'Cache-Control': cacheControl } : {}) });
    return res.end(JSON.stringify(body));
  }
  return body;
}
export default async function handler(req: Request | any, res: Response | any) {
  const query = validateReadRequest(req, res, arrivalQuerySchema, config.security);
  if (!query) return;
  const result = await service.arrivals(query.BusStopCode, query.ServiceNo);
  const cacheControl = result.kind === 'live' ? cdnCache(config.lta.cache.arrivalsSeconds, config.lta.cache.arrivalsStaleSeconds) : undefined;
  return send(res, 200, result.body, cacheControl);
}
