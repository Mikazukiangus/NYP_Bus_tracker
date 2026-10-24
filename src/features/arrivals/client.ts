import { config, apiUrl } from '../../config';
import type { StopServiceArrivals } from '../../types/bus';
import { parseBus } from './decodeArrival';
import { parseArrivalResponse } from '../../../shared/transit/arrivals';
import type { ArrivalSnapshot } from './domain/snapshot';
import { browserErrors } from '../errors/reporting';

export interface ArrivalRequestOptions { forceRefresh?: boolean }

// Uncached transport boundary. Application consumers share the arrival repository.
export async function fetchArrivalSnapshot(stopCode: string, options: ArrivalRequestOptions = {}): Promise<ArrivalSnapshot> {
  try {
    const res = await fetch(apiUrl(`/api/bus-arrival?BusStopCode=${encodeURIComponent(stopCode)}`), {
      signal: AbortSignal.timeout(config.timeouts.arrivalsMs),
      ...(options.forceRefresh ? { cache: 'no-store' as const } : {}),
    });
    if (!res.ok) return { status: 'unavailable', stopCode, receivedAtMs: Date.now(), source: null, reason: 'network' };
    const parsed = res.headers.get('content-type')?.includes('json')
      ? parseArrivalResponse(await res.json().catch(() => undefined), { expectedStopCode: stopCode, requireSource: true }) : null;
    const receivedAtMs = Date.now();
    if (!parsed?.ok) return { status: 'unavailable', stopCode, receivedAtMs, source: null, reason: 'invalid' };
    if (parsed.value.source !== 'LTA_DATAMALL_V3') return { status: 'unavailable', stopCode, receivedAtMs, source: 'FALLBACK_SIMULATED', reason: 'simulated' };
    const services = parsed.value.Services.map(svc => ({
      serviceNo: svc.ServiceNo, operator: svc.Operator,
      nextBus: parseBus(svc.NextBus, receivedAtMs), nextBus2: parseBus(svc.NextBus2, receivedAtMs), nextBus3: parseBus(svc.NextBus3, receivedAtMs),
    }));
    return { status: 'available', stopCode, receivedAtMs, source: 'LTA_DATAMALL_V3', services };
  } catch (error) {
    browserErrors.capture(error, { operation: 'arrivals.fetch', route: '/api/bus-arrival', method: 'GET' });
    return { status: 'unavailable', stopCode, receivedAtMs: Date.now(), source: null, reason: 'network' };
  }
}
// Compatibility convenience for multi-stop consumers; empty live data remains distinct from unavailable.
export async function fetchStopArrivals(stopCode: string): Promise<StopServiceArrivals[] | null> {
  const snapshot = await fetchArrivalSnapshot(stopCode);
  return snapshot.status === 'available' ? snapshot.services : null;
}
