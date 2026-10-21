import { config, apiUrl } from '../../config';
import type { TrafficIncident } from '../../types/bus';
import { parseIncidentResponse } from '../../../shared/transit/incidentValidation';

// Live LTA traffic incidents across Singapore; null if unavailable
export async function fetchTrafficIncidents(): Promise<TrafficIncident[] | null> {
  try {
    const res = await fetch(apiUrl('/api/traffic-incidents'), { signal: AbortSignal.timeout(config.timeouts.requestMs) });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return parseIncidentResponse(await res.json()).incidents;
  } catch {
    return null;
  }
}
