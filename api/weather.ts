import type { Request, Response } from 'express';
import { config } from '../config/server.ts';
import { cdnCache } from '../config/schema.ts';
import { logger } from '../security/logger.ts';
import { createWeatherService } from '../server/weather/service.ts';
import { validateReadRequest, emptyQuerySchema } from '../server/http/request.ts';

// Cache/budget state survives requests in this warm function instance.
const weatherService = createWeatherService(config.weather, config.public.urls.neaBase, { logger });

export default async function handler(req: Request | any, res: Response | any) {
  if (!validateReadRequest(req, res, emptyQuerySchema)) return;
  const body = await weatherService.snapshot();
  const complete = body.missing.length === 0 && body.stale.length === 0;
  // Incomplete snapshots expire quickly so the client's follow-up request (after the rate-limit window) fills the gaps
  const cacheControl = complete
    ? cdnCache(config.weather.cacheSeconds, config.weather.staleSeconds)
    : cdnCache(config.weather.incompleteCacheSeconds);
  const status = body.missing.length === weatherService.datasetCount ? 502 : 200;

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
