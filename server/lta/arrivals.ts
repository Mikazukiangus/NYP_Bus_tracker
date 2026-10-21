import type { AppConfig } from '../../config/schema.ts';
import { parseArrivalResponse, type LTABusArrivalResponse } from '../../shared/transit/arrivals.ts';
import { generateSimulatedLtaResponse } from './simulatedArrivals.ts';
interface Dependencies {
  request?: typeof fetch;
  now?: () => number;
  logger?: { warn(event: string, metadata: Record<string, unknown>): void; error(event: string, metadata: Record<string, unknown>): void };
}
export type ArrivalResult = { kind: 'live' | 'simulated'; body: LTABusArrivalResponse };
export function createArrivalService(settings: AppConfig['lta'], dependencies: Dependencies = {}) {
  const request = dependencies.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = dependencies.now ?? Date.now;
  const logger = dependencies.logger ?? { warn() {}, error() {} };
  async function arrivals(busStopCode: string, serviceNo?: string): Promise<ArrivalResult> {
    let invalidResponse = false;
    if (settings.accountKey) {
      try {
        const query = new URLSearchParams({ BusStopCode: busStopCode });
        if (serviceNo) query.set('ServiceNo', serviceNo);
        const response = await request(`${settings.baseUrl}/v3/BusArrival?${query}`, {
          redirect: 'error',
          signal: AbortSignal.timeout(settings.timeoutMs),
          headers: { AccountKey: settings.accountKey, Accept: 'application/json' },
        });
        if (response.ok) {
          const raw: unknown = response.headers.get('content-type')?.includes('json')
            ? await response.json().catch(() => undefined) : undefined;
          const parsed = parseArrivalResponse(raw, { expectedStopCode: busStopCode });
          if (parsed.ok) return { kind: 'live', body: { ...parsed.value, source: 'LTA_DATAMALL_V3' } };
          invalidResponse = true;
          logger.warn('lta.arrivals_invalid_response', { issues: parsed.issues });
        }
        // Providers can echo credentials. Do not read/log their error bodies.
        if (!response.ok) logger.warn('lta.arrivals_http_error', { status: response.status });
      } catch (error) {
        logger.error('lta.arrivals_request_failed', { error });
      }
    }
    const body = generateSimulatedLtaResponse(busStopCode, serviceNo, now(), settings.baseUrl);
    if (settings.accountKey) body.warning = invalidResponse
      ? 'LTA returned invalid arrival data. These timings are simulated.'
      : 'Live LTA arrival data is temporarily unavailable. These timings are simulated.';
    return { kind: 'simulated', body };
  }
  return { arrivals };
}
