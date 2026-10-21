import type { Request, Response } from 'express';
import { config } from '../config/server.ts';
import { cdnCache } from '../config/schema.ts';
import { logger } from '../security/logger.ts';
import { createIncidentService } from '../server/lta/incidents.ts';
import { validateReadRequest, emptyQuerySchema } from '../server/http/request.ts';
export type { TrafficIncident } from '../shared/transit/incidents.ts';
const service = createIncidentService(config.lta, { logger });
function send(res: Response | any, status: number, body: unknown, cacheControl: string) {
  if (res.setHeader) res.setHeader('Cache-Control', cacheControl);
  if (res.status && typeof res.status === 'function') {
    return res.status(status).json(body);
  }
  if (res.writeHead) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': cacheControl });
    return res.end(JSON.stringify(body));
  }
  return body;
}


export default async function handler(req: Request | any, res: Response | any) {
  if (!validateReadRequest(req, res, emptyQuerySchema)) return;
  const result = await service.incidents();
  if (result.kind === 'not_configured') return send(res, 503, { error: 'LTA_ACCOUNT_KEY not configured; traffic incidents unavailable.' }, 'no-store');
  if (result.kind === 'unavailable') return send(res, 502, { error: 'Failed to load traffic incidents from LTA DataMall.' }, 'no-store');
  if (result.kind === 'ok') return send(res, 200, result.body, cdnCache(config.lta.cache.incidentsSeconds, config.lta.cache.incidentsStaleSeconds));
}
