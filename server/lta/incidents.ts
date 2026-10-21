import type { AppConfig } from '../../config/schema.ts';
import type { TrafficIncident } from '../../shared/transit/incidents.ts';
interface LTAIncident { Type: string; Latitude: number; Longitude: number; Message: string }
export function parseIncidents(rows: LTAIncident[]): TrafficIncident[] {
  return rows.filter(row => Number.isFinite(row.Latitude) && Number.isFinite(row.Longitude))
    .map(row => ({ type: row.Type, lat: row.Latitude, lng: row.Longitude, message: row.Message }));
}
export type IncidentResult = { kind: 'not_configured' | 'unavailable' } | {
  kind: 'ok'; body: { incidents: TrafficIncident[]; fetchedAt: string; source: 'LTA_DATAMALL' };
};
export function createIncidentService(settings: AppConfig['lta'], dependencies: {
  request?: typeof fetch; now?: () => number;
  logger?: { error(event: string, metadata: Record<string, unknown>): void };
} = {}) {
  const request = dependencies.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = dependencies.now ?? Date.now;
  const logger = dependencies.logger ?? { error() {} };
  async function incidents(): Promise<IncidentResult> {
    if (!settings.accountKey) return { kind: 'not_configured' };
    try {
      const response = await request(`${settings.baseUrl}/TrafficIncidents`, {
        headers: { AccountKey: settings.accountKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(settings.timeoutMs),
      });
      if (!response.ok) throw new Error(`LTA TrafficIncidents responded ${response.status}`);
      const body = await response.json() as { value?: LTAIncident[] };
      return { kind: 'ok', body: { incidents: parseIncidents(body.value ?? []), fetchedAt: new Date(now()).toISOString(), source: 'LTA_DATAMALL' } };
    } catch (error) {
      logger.error('lta.incidents_request_failed', { error });
      return { kind: 'unavailable' };
    }
  }
  return { incidents };
}
