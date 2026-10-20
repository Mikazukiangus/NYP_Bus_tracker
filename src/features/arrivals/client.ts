import { config, apiUrl } from '../../config';
import type { StopServiceArrivals } from '../../types/bus';
import { parseBus } from './decodeArrival';

// Fetch live arrivals for every service at a stop (one LTA BusArrival call, cached 15 s at the CDN).
// Returns null when the live feed is unavailable, including the server's no-key simulation.
export async function fetchStopArrivals(stopCode: string): Promise<StopServiceArrivals[] | null> {
  try {
    const res = await fetch(apiUrl(`/api/bus-arrival?BusStopCode=${encodeURIComponent(stopCode)}`), {
      signal: AbortSignal.timeout(config.timeouts.arrivalsMs),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.source !== 'LTA_DATAMALL_V3' || data.BusStopCode !== stopCode || !Array.isArray(data.Services)) return null;
    return data.Services.map((svc: any) => ({
      serviceNo: String(svc.ServiceNo),
      operator: svc.Operator,
      destinationCode: svc.NextBus?.DestinationCode || undefined,
      nextBus: parseBus(svc.NextBus),
      nextBus2: parseBus(svc.NextBus2),
      nextBus3: parseBus(svc.NextBus3),
    }));
  } catch {
    return null;
  }
}
