import type { LTAService } from './arrivalTypes.ts';
import type { SimulatedArrivalResponse } from '../arrivals/provider.ts';
// Generate realistic Singapore LTA v3 payload when LTA_ACCOUNT_KEY is not configured yet
export function generateSimulatedLtaResponse(busStopCode: string, serviceNo: string | undefined, nowMs: number, baseUrl: string): SimulatedArrivalResponse {
  const now = new Date(nowMs);
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
    'odata.metadata': `${baseUrl}/v3/BusArrival`,
    BusStopCode: busStopCode,
    Services: services,
    source: 'FALLBACK_SIMULATED',
    warning: 'LTA_ACCOUNT_KEY environment variable not configured. Set LTA_ACCOUNT_KEY in Vercel to receive live Singapore LTA feed.',
  };
}
