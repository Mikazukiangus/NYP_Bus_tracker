import type { Request, Response } from 'express';

export default async function handler(req: Request | any, res: Response | any) {
  const hasLtaKey = Boolean(process.env.LTA_ACCOUNT_KEY && process.env.LTA_ACCOUNT_KEY.trim() !== '');
  const hasDataGovKey = Boolean(process.env.DATA_GOV_SG_API_KEY && process.env.DATA_GOV_SG_API_KEY.trim() !== '');

  const healthData = {
    status: 'ok',
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
      endpoint: 'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival',
      status: hasLtaKey ? 'READY (LTA_ACCOUNT_KEY provided)' : 'AWAITING_KEY (Running with fallback mode)'
    },
    neaWeather: {
      source: 'https://api-open.data.gov.sg/v2/real-time/api',
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

  if (res.status && typeof res.status === 'function') {
    return res.status(200).json(healthData);
  } else if (res.writeHead && typeof res.writeHead === 'function') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(healthData, null, 2));
  }

  return healthData;
}
