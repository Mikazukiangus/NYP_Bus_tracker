import type { Request, Response } from 'express';

export interface LTABusArrival {
  OriginCode: string;
  DestinationCode: string;
  EstimatedArrival: string;
  Latitude: string;
  Longitude: string;
  VisitNumber: string;
  Load: 'SEA' | 'SDA' | 'LSD';
  Feature: 'WAB' | '';
  Type: 'SD' | 'DD' | 'BD';
  Monitored?: number;
}

export interface LTAService {
  ServiceNo: string;
  Operator: string;
  NextBus?: LTABusArrival;
  NextBus2?: LTABusArrival;
  NextBus3?: LTABusArrival;
}

export interface LTABusArrivalResponse {
  'odata.metadata': string;
  BusStopCode: string;
  Services: LTAService[];
  source?: 'LTA_DATAMALL_V3' | 'FALLBACK_SIMULATED';
  warning?: string;
}

// Generate realistic Singapore LTA v3 payload when LTA_ACCOUNT_KEY is not configured yet
function generateSimulatedLtaResponse(busStopCode: string, serviceNo?: string): LTABusArrivalResponse {
  const now = new Date();
  const serviceList = serviceNo ? [serviceNo.toUpperCase()] : ['14', '65', '147'];

  const services: LTAService[] = serviceList.map((svc) => {
    const seed = (parseInt(svc.replace(/\D/g, '') || '10', 10) * 17 + parseInt(busStopCode.slice(-3) || '12', 10)) % 100;
    
    // Arrival in minutes
    const min1 = (now.getMinutes() * 60 + now.getSeconds() + seed * 9) % 360 / 60;
    const min2 = min1 + 5 + (seed % 5);
    const min3 = min2 + 8 + ((seed * 2) % 6);

    const eta1 = new Date(now.getTime() + min1 * 60000).toISOString();
    const eta2 = new Date(now.getTime() + min2 * 60000).toISOString();
    const eta3 = new Date(now.getTime() + min3 * 60000).toISOString();

    const loads: ('SEA' | 'SDA' | 'LSD')[] = ['SEA', 'SEA', 'SDA', 'SEA', 'LSD'];
    const types: ('SD' | 'DD' | 'BD')[] = ['DD', 'DD', 'SD', 'DD', 'SD'];

    return {
      ServiceNo: svc,
      Operator: svc.startsWith('9') || svc.startsWith('18') || svc.startsWith('19') ? 'SMRT' : 'SBST',
      NextBus: {
        OriginCode: '10009',
        DestinationCode: '45009',
        EstimatedArrival: eta1,
        Latitude: '1.3022',
        Longitude: '103.8360',
        VisitNumber: '1',
        Load: loads[seed % loads.length],
        Feature: 'WAB',
        Type: types[seed % types.length],
        Monitored: 1,
      },
      NextBus2: {
        OriginCode: '10009',
        DestinationCode: '45009',
        EstimatedArrival: eta2,
        Latitude: '1.3060',
        Longitude: '103.8400',
        VisitNumber: '1',
        Load: loads[(seed + 1) % loads.length],
        Feature: 'WAB',
        Type: types[(seed + 2) % types.length],
        Monitored: 1,
      },
      NextBus3: {
        OriginCode: '10009',
        DestinationCode: '45009',
        EstimatedArrival: eta3,
        Latitude: '1.3110',
        Longitude: '103.8480',
        VisitNumber: '1',
        Load: loads[(seed + 3) % loads.length],
        Feature: 'WAB',
        Type: types[(seed + 4) % types.length],
        Monitored: 1,
      },
    };
  });

  return {
    'odata.metadata': 'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival',
    BusStopCode: busStopCode,
    Services: services,
    source: 'FALLBACK_SIMULATED',
    warning: 'LTA_ACCOUNT_KEY environment variable not configured. Set LTA_ACCOUNT_KEY in Vercel to receive live Singapore LTA feed.',
  };
}

export default async function handler(req: Request | any, res: Response | any) {
  // Support both Express req.query and standard URL params
  const url = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
  const busStopCode = (req.query?.BusStopCode || req.query?.busStopCode || url.searchParams.get('BusStopCode') || url.searchParams.get('busStopCode')) as string | undefined;
  const serviceNo = (req.query?.ServiceNo || req.query?.serviceNo || url.searchParams.get('ServiceNo') || url.searchParams.get('serviceNo')) as string | undefined;

  if (!busStopCode) {
    const errorBody = {
      error: 'Missing required query parameter: BusStopCode',
      usage: '/api/bus-arrival?BusStopCode=83139&ServiceNo=15',
    };
    if (res.status && typeof res.status === 'function') {
      return res.status(400).json(errorBody);
    } else if (res.writeHead) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(errorBody));
    }
    return errorBody;
  }

  const accountKey = process.env.LTA_ACCOUNT_KEY?.trim();

  // If LTA_ACCOUNT_KEY is available, fetch live from LTA DataMall v3
  if (accountKey) {
    try {
      const queryParams = new URLSearchParams({ BusStopCode: busStopCode });
      if (serviceNo) {
        queryParams.set('ServiceNo', serviceNo);
      }

      const ltaUrl = `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?${queryParams.toString()}`;

      const ltaResponse = await fetch(ltaUrl, {
        headers: {
          AccountKey: accountKey,
          Accept: 'application/json',
        },
      });

      if (ltaResponse.ok) {
        const data: LTABusArrivalResponse = await ltaResponse.json();
        data.source = 'LTA_DATAMALL_V3';

        if (res.setHeader) {
          res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
        }

        if (res.status && typeof res.status === 'function') {
          return res.status(200).json(data);
        } else if (res.writeHead) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
          });
          return res.end(JSON.stringify(data));
        }
        return data;
      } else {
        const errorText = await ltaResponse.text();
        console.warn(`LTA DataMall error (${ltaResponse.status}):`, errorText);
        // Fall back gracefully so user app continues working
      }
    } catch (err) {
      console.error('Failed to fetch from LTA DataMall v3:', err);
      // Fall back gracefully
    }
  }

  // Fallback mode when LTA_ACCOUNT_KEY is not set or LTA service is unreachable
  const simulated = generateSimulatedLtaResponse(busStopCode, serviceNo);
  if (res.status && typeof res.status === 'function') {
    return res.status(200).json(simulated);
  } else if (res.writeHead) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(simulated));
  }
  return simulated;
}
