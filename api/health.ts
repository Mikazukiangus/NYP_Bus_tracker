import type { Request, Response } from 'express';

const LTA_ENDPOINT = 'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival';
const NEA_ENDPOINT = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';

async function probe(url: string, headers: Record<string, string>, valid: (body: any) => boolean) {
  const startedAt = Date.now();
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    httpStatus = response.status;
    if (!response.ok) throw new Error('upstream_http_error');
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

export default async function handler(_req: Request | any, res: Response | any) {
  const ltaKey = process.env.LTA_ACCOUNT_KEY?.trim();
  const dataGovKey = process.env.DATA_GOV_SG_API_KEY?.trim();
  const hasLtaKey = Boolean(ltaKey);
  const hasDataGovKey = Boolean(dataGovKey);
  const [ltaProbe, neaProbe] = await Promise.all([
    ltaKey
      ? probe(`${LTA_ENDPOINT}?BusStopCode=55329`, { AccountKey: ltaKey, Accept: 'application/json' },
        (body) => body?.BusStopCode === '55329' && Array.isArray(body.Services))
      : Promise.resolve({ status: 'not_configured' as const, reason: 'LTA_ACCOUNT_KEY missing' }),
    probe(NEA_ENDPOINT, { Accept: 'application/json', ...(dataGovKey ? { 'x-api-key': dataGovKey } : {}) },
      (body) => body?.code === 0 && Array.isArray(body.data?.items) && body.data.items.length > 0),
  ]);
  const healthy = ltaProbe.status === 'ok' && neaProbe.status === 'ok';
  const httpStatus = healthy ? 200 : 503;

  const healthData = {
    status: healthy ? 'ok' : 'degraded',
    service: 'BusTrackerSG - A member of NYP Bus API',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      ltaAccountKeyConfigured: hasLtaKey,
      dataGovSgApiKeyConfigured: hasDataGovKey,
      vercel: Boolean(process.env.VERCEL)
    },
    ltaDataMall: {
      apiVersion: 'v3',
      endpoint: LTA_ENDPOINT,
      ...ltaProbe,
    },
    neaWeather: {
      source: 'https://api-open.data.gov.sg/v2/real-time/api',
      endpoint: NEA_ENDPOINT,
      ...neaProbe,
      rateLimit: hasDataGovKey ? 'API key (higher limit)' : 'Keyless (6 calls per 10 s; datasets fill in over ~25 s on a cold start)'
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
}
