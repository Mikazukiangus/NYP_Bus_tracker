import { withErrorTracking } from '../server/errors/reporting.ts';
import type { Request, Response } from 'express';
import { config } from '../config/server.ts';
import { cdnCache, type AppConfig } from '../config/schema.ts';
import { logger } from '../security/logger.ts';
import { createArrivalService } from '../server/lta/arrivals.ts';
import { validateReadRequest, arrivalQuerySchema } from '../server/http/request.ts';
export type { LTABusArrival, LTAService, LTABusArrivalResponse } from '../server/lta/arrivalTypes.ts';
const service = createArrivalService(config.lta, { logger, retry: config.outbound.retry });
function send(res: Response | any, status: number, body: unknown, cacheControl?: string) {
  if (cacheControl && res.setHeader) res.setHeader('Cache-Control', cacheControl);
  if (res.status && typeof res.status === 'function') return res.status(status).json(body);
  if (res.writeHead) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...(cacheControl ? { 'Cache-Control': cacheControl } : {}) });
    return res.end(JSON.stringify(body));
  }
  return body;
}
// Keep the deployed adapter and integration fixtures on the same validation/response path.
export function createArrivalHandler(arrivals: Pick<ReturnType<typeof createArrivalService>, 'arrivals'>, settings: Pick<AppConfig, 'security' | 'lta'> = config) {
  async function handler(req: Request | any, res: Response | any) {
    const query = validateReadRequest(req, res, arrivalQuerySchema, settings.security);
    if (!query) return;
    const result = await arrivals.arrivals(query.BusStopCode, query.ServiceNo);
    const cacheControl = result.kind === 'live' ? cdnCache(settings.lta.cache.arrivalsSeconds, settings.lta.cache.arrivalsStaleSeconds) : undefined;
    return send(res, 200, result.body, cacheControl);
  }
  return withErrorTracking(handler, '/api/bus-arrival');
}

export default createArrivalHandler(service);
