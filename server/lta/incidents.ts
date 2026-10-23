import type { AppConfig } from '../../config/schema.ts';
import type { TrafficIncident } from '../../shared/transit/incidents.ts';
import { providerIncidentSchema } from '../../shared/transit/incidentValidation.ts';
import { parseBoundary } from '../../shared/input/primitives.ts';
import { safeFetch } from '../../security/ssrf.ts';
import { DEFAULT_READ_RETRY_POLICY, fetchReadWithBackoff, type ReadRetryPolicy } from '../../shared/http/readRetry.ts';
import { createCircuitBreaker, CircuitOpenError, DependencyHttpError, readDependencyJson } from '../../shared/http/circuitBreaker.ts';
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
  const circuit = createCircuitBreaker(settings.circuit, now);
  async function incidents(): Promise<IncidentResult> {
    if (!settings.accountKey) return { kind: 'not_configured' };
    try {
      const signal = AbortSignal.timeout(settings.timeoutMs);
      const body = await circuit.run(async probe => {
        const response = await fetchReadWithBackoff(request, `${settings.baseUrl}/TrafficIncidents`, {
          redirect: 'error',
          headers: { AccountKey: settings.accountKey, Accept: 'application/json' },
          signal,
        }, probe ? { ...(dependencies.retry ?? DEFAULT_READ_RETRY_POLICY), attempts: 1 } : dependencies.retry);
        if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new DependencyHttpError(response.status); }
        return readDependencyJson(response, raw => parseBoundary(providerIncidentSchema, raw));
      }, signal);
      return { kind: 'ok', body: { incidents: parseIncidents(body.value), fetchedAt: new Date(now()).toISOString(), source: 'LTA_DATAMALL' } };
    } catch (error) {
      if (!(error instanceof CircuitOpenError)) logger.error('lta.incidents_request_failed', { error });
      return { kind: 'unavailable' };
    }
  }
  return { incidents };
}
