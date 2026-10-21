import type { Request, Response } from 'express';
import { config } from '../config/server.ts';
import { cdnCache } from '../config/schema.ts';
import { logger } from '../security/logger.ts';
import { createArrivalService } from '../server/lta/arrivals.ts';
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
  const url = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
  const busStopCode = (req.query?.BusStopCode ?? req.query?.busStopCode ?? url.searchParams.get('BusStopCode') ?? url.searchParams.get('busStopCode'));
  const requestedService = (req.query?.ServiceNo ?? req.query?.serviceNo ?? url.searchParams.get('ServiceNo') ?? url.searchParams.get('serviceNo'));
  if (!busStopCode) return send(res, 400, {
    error: 'Missing required query parameter: BusStopCode',
    usage: '/api/bus-arrival?BusStopCode=83139&ServiceNo=15',
  });
  if (typeof busStopCode !== 'string' || !/^\d{5}$/.test(busStopCode)) return send(res, 400, { error: 'Invalid query parameter: BusStopCode', usage: '/api/bus-arrival?BusStopCode=83139&ServiceNo=15' });
  if (requestedService !== undefined && requestedService !== null && requestedService !== '' && (typeof requestedService !== 'string' || !/^[0-9A-Za-z]{1,6}$/.test(requestedService))) return send(res, 400, { error: 'Invalid query parameter: ServiceNo', usage: '/api/bus-arrival?BusStopCode=83139&ServiceNo=15' });
  const serviceNo = typeof requestedService === 'string' && requestedService ? requestedService : undefined;
  const result = await service.arrivals(busStopCode, serviceNo);
  const cacheControl = result.kind === 'live' ? cdnCache(config.lta.cache.arrivalsSeconds, config.lta.cache.arrivalsStaleSeconds) : undefined;
  return send(res, 200, result.body, cacheControl);
}
