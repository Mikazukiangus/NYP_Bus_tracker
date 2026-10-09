import type { Request, Response } from 'express';

export default async function handler(req: Request | any, res: Response | any) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const neaRes = await fetch('https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast', {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (neaRes.ok) {
      const data = await neaRes.json();
      if (res.setHeader) {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      }

      if (res.status && typeof res.status === 'function') {
        return res.status(200).json(data);
      } else if (res.writeHead) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        });
        return res.end(JSON.stringify(data));
      }
      return data;
    } else {
      throw new Error(`NEA API returned status ${neaRes.status}`);
    }
  } catch (error: any) {
    console.error('Error fetching NEA two-hr-forecast:', error);
    const errorResponse = {
      error: 'Failed to fetch NEA 2-hour weather forecast',
      message: error?.message || 'Unknown error',
    };

    if (res.status && typeof res.status === 'function') {
      return res.status(502).json(errorResponse);
    } else if (res.writeHead) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(errorResponse));
    }
    return errorResponse;
  }
}
