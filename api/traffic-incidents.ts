import { withErrorTracking } from '../server/errors/reporting.ts';
import type { Request, Response } from 'express';
import { config } from '../config/server.ts';
import { incidentCacheControl } from '../server/http/cache.ts';
import { logger } from '../security/logger.ts';
import { createIncidentService } from '../server/lta/incidents.ts';
import { createIncidentPager } from '../server/lta/incidentPage.ts';
import { incidentQuerySchema } from '../shared/transit/incidentPagination.ts';
import { validateReadRequest } from '../server/http/request.ts';
export type { TrafficIncident } from '../shared/transit/incidents.ts';
const service = createIncidentService(config.lta, { logger, retry: config.outbound.retry });
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


export function createIncidentHandler(incidents = service.incidents) {
  const page = createIncidentPager();
  return async function handler(req: Request | any, res: Response | any) {
    const query = validateReadRequest(req, res, incidentQuerySchema, config.security);
    if (!query) return;
    const result = await incidents();
    if (result.kind === 'not_configured') return send(res, 503, { error: 'Traffic incidents are temporarily unavailable.' }, 'no-store');
    if (result.kind === 'unavailable') return send(res, 502, { error: 'Failed to load traffic incidents from LTA DataMall.' }, 'no-store');
    if (result.kind === 'ok') {
      const resultPage = page(result.body, query);
      if (resultPage.kind === 'changed') return send(res, 409, { error: 'Incident data changed. Restart from offset 0.', code: 'SNAPSHOT_CHANGED' }, 'no-store');
      // Page requests bypass CDN storage: each warm owner checks the supplied snapshot.
      return send(res, 200, resultPage.body, resultPage.kind === 'page' ? 'no-store' : incidentCacheControl(config.lta.cache, result.body.fetchedAt));
    }
  };
}
export default withErrorTracking(createIncidentHandler(), '/api/traffic-incidents');
