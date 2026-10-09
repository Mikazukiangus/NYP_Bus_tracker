import type { Request, Response } from 'express';

export default async function handler(req: Request | any, res: Response | any) {
  const hasLtaKey = Boolean(process.env.LTA_ACCOUNT_KEY && process.env.LTA_ACCOUNT_KEY.trim() !== '');

  const healthData = {
    status: 'ok',
    service: 'BusTrackerSG - A member of NYP Bus API',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      ltaAccountKeyConfigured: hasLtaKey,
      vercel: Boolean(process.env.VERCEL)
    },
    ltaDataMall: {
      apiVersion: 'v3',
      endpoint: 'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival',
      status: hasLtaKey ? 'READY (LTA_ACCOUNT_KEY provided)' : 'AWAITING_KEY (Running with fallback mode)'
    },
    endpoints: {
      health: '/api/health',
      weather: '/api/weather',
      busArrival: '/api/bus-arrival?BusStopCode=:code&ServiceNo=:service'
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
