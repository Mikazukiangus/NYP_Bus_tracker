import type { AppConfig } from '../../config/schema.ts';
import { parseArrivalResponse, type LTABusArrivalResponse } from '../../shared/transit/arrivals.ts';
import { generateSimulatedLtaResponse } from './simulatedArrivals.ts';
import { safeFetch } from '../../security/ssrf.ts';
import { DEFAULT_READ_RETRY_POLICY, fetchReadWithBackoff, type ReadRetryPolicy } from '../../shared/http/readRetry.ts';
import { createCircuitBreaker, CircuitOpenError, DependencyHttpError, InvalidDependencyResponseError, readDependencyJson } from '../../shared/http/circuitBreaker.ts';
interface Dependencies {
  request?: typeof fetch;
  now?: () => number;
  retry?: ReadRetryPolicy;
  logger?: { warn(event: string, metadata: Record<string, unknown>): void; error(event: string, metadata: Record<string, unknown>): void };
}
export type ArrivalResult = { kind: 'live' | 'simulated'; body: LTABusArrivalResponse };
export function createArrivalService(settings: AppConfig['lta'], dependencies: Dependencies = {}) {
  const request = dependencies.request ?? safeFetch;
  const now = dependencies.now ?? Date.now;
  const logger = dependencies.logger ?? { warn() {}, error() {} };
  const circuit = createCircuitBreaker(settings.circuit, now);
  async function arrivals(busStopCode: string, serviceNo?: string): Promise<ArrivalResult> {
    let invalidResponse = false;
    if (settings.accountKey) {
      try {
        const query = new URLSearchParams({ BusStopCode: busStopCode });
        if (serviceNo) query.set('ServiceNo', serviceNo);
        const signal = AbortSignal.timeout(settings.timeoutMs);
        const body = await circuit.run(async probe => {
          const response = await fetchReadWithBackoff(request, `${settings.baseUrl}/v3/BusArrival?${query}`, {
            redirect: 'error',
            signal,
            headers: { AccountKey: settings.accountKey, Accept: 'application/json' },
          }, probe ? { ...(dependencies.retry ?? DEFAULT_READ_RETRY_POLICY), attempts: 1 } : dependencies.retry);
          if (!response.ok) {
            logger.warn('lta.arrivals_http_error', { status: response.status });
            await response.body?.cancel().catch(() => {});
            throw new DependencyHttpError(response.status);
          }
          return readDependencyJson(response, raw => {
            const parsed = parseArrivalResponse(raw, { expectedStopCode: busStopCode });
            if (parsed.ok) return parsed.value;
            invalidResponse = true;
            logger.warn('lta.arrivals_invalid_response', { issues: parsed.issues });
            throw new InvalidDependencyResponseError();
          });
        }, signal);
        return { kind: 'live', body: { ...body, source: 'LTA_DATAMALL_V3' } };
      } catch (error) {
        if (error instanceof InvalidDependencyResponseError) {
          if (!invalidResponse) logger.warn('lta.arrivals_invalid_response', { issues: [] });
          invalidResponse = true;
        } else if (!(error instanceof CircuitOpenError) && !(error instanceof DependencyHttpError)) logger.error('lta.arrivals_request_failed', { error });
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
