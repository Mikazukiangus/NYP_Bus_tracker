import type { AppConfig } from '../../config/schema.ts';
import type { TrafficIncident } from '../../shared/transit/incidents.ts';
import { providerIncidentSchema } from '../../shared/transit/incidentValidation.ts';
import { parseBoundary } from '../../shared/input/primitives.ts';
import { safeFetch } from '../../security/ssrf.ts';
import { fetchReadWithBackoff, type ReadRetryPolicy } from '../../shared/http/readRetry.ts';
interface LTAIncident { Type: string; Latitude: number; Longitude: number; Message: string }
export function parseIncidents(rows: LTAIncident[]): TrafficIncident[] {
  return rows.filter(row => Number.isFinite(row.Latitude) && Number.isFinite(row.Longitude))
    .map(row => ({ type: row.Type, lat: row.Latitude, lng: row.Longitude, message: row.Message }));
}
export type IncidentResult = { kind: 'not_configured' | 'unavailable' } | {
  kind: 'ok'; body: { incidents: TrafficIncident[]; fetchedAt: string; source: 'LTA_DATAMALL' };
};
export function createIncidentService(settings: AppConfig['lta'], dependencies: {
  request?: typeof fetch; now?: () => number; retry?: ReadRetryPolicy;
  logger?: { error(event: string, metadata: Record<string, unknown>): void };
} = {}) {
  const request = dependencies.request ?? safeFetch;
  const now = dependencies.now ?? Date.now;
  const logger = dependencies.logger ?? { error() {} };
  async function incidents(): Promise<IncidentResult> {
    if (!settings.accountKey) return { kind: 'not_configured' };
    try {
      const response = await fetchReadWithBackoff(request, `${settings.baseUrl}/TrafficIncidents`, {
        redirect: 'error',
        headers: { AccountKey: settings.accountKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(settings.timeoutMs),
      }, dependencies.retry);
      if (!response.ok) throw new Error(`LTA TrafficIncidents responded ${response.status}`);
      if (!response.headers.get('content-type')?.includes('json')) throw new Error('Invalid external data.');
      const body = parseBoundary(providerIncidentSchema, await response.json());
      return { kind: 'ok', body: { incidents: parseIncidents(body.value), fetchedAt: new Date(now()).toISOString(), source: 'LTA_DATAMALL' } };
    } catch (error) {
      logger.error('lta.incidents_request_failed', { error });
      return { kind: 'unavailable' };
    }
  }
  return { incidents };
}
