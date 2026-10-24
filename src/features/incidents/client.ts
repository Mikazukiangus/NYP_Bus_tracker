import { config, apiUrl } from '../../config';
import type { TrafficIncident } from '../../types/bus';
import { parseIncidentResponse } from '../../../shared/transit/incidentValidation';
import { incidentPagination } from '../../../shared/transit/incidentPagination';

// Live LTA traffic incidents across Singapore; null if unavailable
export async function fetchTrafficIncidents(): Promise<{ incidents: TrafficIncident[]; fetchedAt: string } | null> {
  try {
    const deadlineSignal = AbortSignal.timeout(config.timeouts.requestMs); // One deadline for every page/restart.
    for (let attempt = 0; attempt < 2; attempt++) {
      let offset = 0, snapshot: string | undefined, total: number | undefined, fetchedAt: string | undefined;
      const incidents: TrafficIncident[] = [];
      for (let pages = 0; pages <= Math.ceil(incidentPagination.maxItems / incidentPagination.defaultLimit); pages++) {
        const params = new URLSearchParams({ limit: String(incidentPagination.defaultLimit), offset: String(offset) });
        if (snapshot) params.set('snapshot', snapshot);
        let res = await fetch(apiUrl(`/api/traffic-incidents?${params}`), { signal: deadlineSignal, cache: 'no-store' });
        // Rolling upgrades: older functions reject pagination keys before returning any data.
        if (pages === 0 && attempt === 0 && res.status === 400) {
          await res.body?.cancel();
          res = await fetch(apiUrl('/api/traffic-incidents'), { signal: deadlineSignal, cache: 'no-store' });
          if (!res.ok || !res.headers.get('content-type')?.includes('json')) { await res.body?.cancel().catch(() => {}); return null; }
          const legacy = parseIncidentResponse(await res.json());
          return legacy.pagination ? null : { incidents: legacy.incidents, fetchedAt: legacy.fetchedAt };
        }
        if (res.status === 409) { await res.body?.cancel(); break; } // Discard partial old generation, restart once.
        if (!res.ok || !res.headers.get('content-type')?.includes('json')) { await res.body?.cancel().catch(() => {}); return null; }
        const body = parseIncidentResponse(await res.json());
        if (!body.pagination) return pages === 0 ? { incidents: body.incidents, fetchedAt: body.fetchedAt } : null;
        const page = body.pagination;
        if (page.offset !== offset || page.limit !== incidentPagination.defaultLimit ||
          snapshot !== undefined && (page.snapshot !== snapshot || page.total !== total)) return null;
        snapshot = page.snapshot; total = page.total;
        if (!fetchedAt || Date.parse(body.fetchedAt) < Date.parse(fetchedAt)) fetchedAt = body.fetchedAt;
        incidents.push(...body.incidents);
        if (page.nextOffset === null) return incidents.length === total ? { incidents, fetchedAt } : null;
        offset = page.nextOffset;
      }
    }
    return null;
  } catch {
    return null;
  }
}
