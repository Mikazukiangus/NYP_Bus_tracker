import type { Request, Response } from 'express';

// Live LTA DataMall TrafficIncidents (accidents, roadworks, breakdowns, ...) across Singapore.
// The client keeps only those near the bus route it is showing.
const LTA_URL = 'https://datamall2.mytransport.sg/ltaodataservice/TrafficIncidents';

interface LTAIncident {
  Type: string;
  Latitude: number;
  Longitude: number;
  Message: string;
}

export interface TrafficIncident {
  type: string;
  lat: number;
  lng: number;
  message: string;
}

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

export default async function handler(_req: Request | any, res: Response | any) {
  const accountKey = process.env.LTA_ACCOUNT_KEY?.trim();
  if (!accountKey) {
    return send(res, 503, { error: 'LTA_ACCOUNT_KEY not configured; traffic incidents unavailable.' }, 'no-store');
  }

  try {
    const ltaRes = await fetch(LTA_URL, {
      headers: { AccountKey: accountKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!ltaRes.ok) throw new Error(`LTA TrafficIncidents responded ${ltaRes.status}`);
    const body = (await ltaRes.json()) as { value?: LTAIncident[] };
    const incidents: TrafficIncident[] = (body.value ?? [])
      .filter((i) => Number.isFinite(i.Latitude) && Number.isFinite(i.Longitude))
      .map((i) => ({ type: i.Type, lat: i.Latitude, lng: i.Longitude, message: i.Message }));
    // LTA updates incidents every ~2 minutes
    return send(
      res,
      200,
      { incidents, fetchedAt: new Date().toISOString(), source: 'LTA_DATAMALL' },
      'public, s-maxage=120, stale-while-revalidate=300'
    );
  } catch (err) {
    console.error('Failed to fetch LTA TrafficIncidents:', err);
    return send(res, 502, { error: 'Failed to load traffic incidents from LTA DataMall.' }, 'no-store');
  }
}
