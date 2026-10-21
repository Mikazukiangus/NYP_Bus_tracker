import type { Request, Response } from 'express';
import { config } from '../config/server.ts';
import { cdnCache } from '../config/schema.ts';
import { logger } from '../security/logger.ts';
import { createDatasetStore } from '../server/lta/datasets.ts';
import { buildRoute } from '../server/lta/buildRoute.ts';
import { validateReadRequest, routeQuerySchema } from '../server/http/request.ts';

// One store per warm function instance; CLI callers own a separate store.
const { getDatasets } = createDatasetStore(config.lta);

function send(res: Response | any, status: number, body: unknown, cacheControl?: string) {
  if (cacheControl && res.setHeader) res.setHeader('Cache-Control', cacheControl);
  if (res.status && typeof res.status === 'function') {
    return res.status(status).json(body);
  }
  if (res.writeHead) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body));
  }
  return body;
}

export default async function handler(req: Request | any, res: Response | any) {
  const query = validateReadRequest(req, res, routeQuerySchema, config.security);
  if (!query) return;
  const serviceNo = query.ServiceNo;

  const accountKey = config.lta.accountKey;
  if (!accountKey) {
    return send(res, 503, { error: 'LTA_ACCOUNT_KEY not configured; route data unavailable.' });
  }

  try {
    const data = await getDatasets(accountKey);
    const route = buildRoute(serviceNo, data);
    if (!route) {
      return send(res, 404, { error: `Bus service ${serviceNo} not found in LTA DataMall BusRoutes.` }, cdnCache(config.lta.cache.notFoundSeconds));
    }
    // Route data is near-static: cache at the edge for a day, serve stale for a week while revalidating
    return send(res, 200, route, cdnCache(config.lta.cache.routesSeconds, config.lta.cache.routesStaleSeconds));
  } catch (err) {
    logger.error('lta.routes_request_failed', { error: err });
    return send(res, 502, { error: 'Failed to load route data from LTA DataMall.' });
  }
}
