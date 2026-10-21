import type { Request, Response } from 'express';
import { config as serverConfig } from '../config/server.ts';
import type { AppConfig } from '../config/schema.ts';
import { validateReadRequest, emptyQuerySchema } from '../server/http/request.ts';
import { parseArrivalResponse } from '../shared/transit/arrivals.ts';
import { neaSchemas } from '../shared/weather/validation.ts';

async function probe(url: string, headers: Record<string, string>, valid: (body: any) => boolean, timeoutMs: number) {
  const startedAt = Date.now();
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    httpStatus = response.status;
    if (!response.ok) throw new Error('upstream_http_error');
    if (!response.headers.get('content-type')?.includes('json')) throw new Error('invalid_response');
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

export function createHealthHandler(config: AppConfig) {
  return async function handler(req: Request | any, res: Response | any) {
    if (!validateReadRequest(req, res, emptyQuerySchema)) return;
    const ltaEndpoint = `${config.lta.baseUrl}/v3/BusArrival`;
    const neaEndpoint = `${config.public.urls.neaBase}/two-hr-forecast`;
    const ltaKey = config.lta.accountKey;
    const dataGovKey = config.weather.apiKey;
    const hasLtaKey = Boolean(ltaKey);
    const hasDataGovKey = Boolean(dataGovKey);
    const [ltaProbe, neaProbe] = await Promise.all([
      ltaKey
        ? probe(`${ltaEndpoint}?BusStopCode=${config.health.stopCode}`, { AccountKey: ltaKey, Accept: 'application/json' },
          (body) => parseArrivalResponse(body, { expectedStopCode: config.health.stopCode }).ok, config.health.timeoutMs)
        : Promise.resolve({ status: 'not_configured' as const, reason: 'LTA_ACCOUNT_KEY missing' }),
      probe(neaEndpoint, { Accept: 'application/json', ...(dataGovKey ? { 'x-api-key': dataGovKey } : {}) },
        (body) => neaSchemas.forecast2h.safeParse(body).success, config.health.timeoutMs),
    ]);
    const healthy = ltaProbe.status === 'ok' && neaProbe.status === 'ok';
    const httpStatus = healthy ? 200 : 503;

    const healthData = {
      status: healthy ? 'ok' : 'degraded',
      service: 'BusTrackerSG - A member of NYP Bus API',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: {
        nodeEnv: config.server.nodeEnv,
        ltaAccountKeyConfigured: hasLtaKey,
        dataGovSgApiKeyConfigured: hasDataGovKey,
        vercel: config.server.vercel
      },
      ltaDataMall: {
        apiVersion: 'v3',
        endpoint: ltaEndpoint,
        ...ltaProbe,
      },
      neaWeather: {
        source: config.public.urls.neaBase,
        endpoint: neaEndpoint,
        ...neaProbe,
        rateLimit: `${hasDataGovKey ? 'API key' : 'Keyless'} (weather budget: ${hasDataGovKey ? config.weather.keyedBudget : config.weather.keylessBudget} calls per ${config.weather.rateWindowMs / 1000} s per instance)`
      },
      endpoints: {
        health: '/api/health',
        weather: '/api/weather',
        busArrival: '/api/bus-arrival?BusStopCode=:code&ServiceNo=:service',
        busRoute: '/api/bus-route?ServiceNo=:service',
        trafficIncidents: '/api/traffic-incidents'
      }
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

export default createHealthHandler(serverConfig);
