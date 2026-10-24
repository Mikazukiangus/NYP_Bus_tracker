import { withErrorTracking } from '../server/errors/reporting.ts';
import type { Request, Response } from 'express';
import { config as serverConfig } from '../config/server.ts';
import type { AppConfig } from '../config/schema.ts';
import { validateReadRequest, emptyQuerySchema } from '../server/http/request.ts';
import { parseArrivalResponse } from '../shared/transit/arrivals.ts';
import { neaSchemas } from '../shared/weather/validation.ts';
import { safeFetch } from '../security/ssrf.ts';
import { logger } from '../security/logger.ts';

async function probe(url: string, headers: Record<string, string>, valid: (body: any) => boolean, timeoutMs: number) {
  const startedAt = Date.now();
  let httpStatus: number | null = null;
  try {
    const response = await safeFetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    httpStatus = response.status;
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) {
      await response.body?.cancel().catch(() => {});
      throw new Error('invalid_response');
    }
    if (!valid(await response.json())) throw new Error('invalid_response');
    return { status: 'ok' as const, httpStatus, latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString() };
  } catch (error) {
    // Do not expose upstream response bodies or errors which might include request credentials.
    const reason = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
      ? 'timeout'
      : httpStatus !== null && (httpStatus < 200 || httpStatus >= 300)
        ? 'upstream_http_error'
        : httpStatus !== null ? 'invalid_response' : 'connection_failed';
    return { status: 'unavailable' as const, httpStatus, latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString(), reason };
  }
}

export function createHealthHandler(config: AppConfig, diagnostics: Pick<typeof logger, 'warn'> = logger) {
  return async function handler(req: Request | any, res: Response | any) {
    if (!validateReadRequest(req, res, emptyQuerySchema, config.security)) return;
    const ltaEndpoint = `${config.lta.baseUrl}/v3/BusArrival`;
    const neaEndpoint = `${config.public.urls.neaBase}/two-hr-forecast`;
    const ltaKey = config.lta.accountKey;
    const dataGovKey = config.weather.apiKey;
    const [ltaProbe, neaProbe] = await Promise.all([
      ltaKey
        ? probe(`${ltaEndpoint}?BusStopCode=${config.health.stopCode}`, { AccountKey: ltaKey, Accept: 'application/json' },
          (body) => parseArrivalResponse(body, { expectedStopCode: config.health.stopCode }).ok, config.health.timeoutMs)
        : Promise.resolve({ status: 'not_configured' as const, reason: 'not_configured' }),
      probe(neaEndpoint, { Accept: 'application/json', ...(dataGovKey ? { 'x-api-key': dataGovKey } : {}) },
        (body) => neaSchemas.forecast2h.safeParse(body).success, config.health.timeoutMs),
    ]);
    const healthy = ltaProbe.status === 'ok' && neaProbe.status === 'ok';
    const httpStatus = healthy ? 200 : 503;
    // Operational details stay in restricted server logs. No URL, key-presence flag or raw error is returned.
    for (const [provider, result] of [['lta', ltaProbe], ['nea', neaProbe]] as const) {
      if (result.status !== 'ok') diagnostics.warn('health.probe_failed', { provider, ...result });
    }

    const healthData = {
      status: healthy ? 'ok' : 'degraded',
      service: 'BusTrackerSG - A member of NYP Bus API',
      timestamp: new Date().toISOString(),
    };

    if (res.setHeader) res.setHeader('Cache-Control', 'no-store');
    if (res.status && typeof res.status === 'function') {
      return res.status(httpStatus).json(healthData);
    } else if (res.writeHead && typeof res.writeHead === 'function') {
      res.writeHead(httpStatus, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(healthData, null, 2));
    }

    return healthData;
  };
}

export default withErrorTracking(createHealthHandler(serverConfig), '/api/health');
