import type { AppConfig } from '../../config/schema.ts';
import { parseArrivalResponse } from '../../shared/transit/arrivals.ts';
import { safeFetch } from '../../security/ssrf.ts';
import { DEFAULT_READ_RETRY_POLICY, fetchReadWithBackoff, type ReadRetryPolicy } from '../../shared/http/readRetry.ts';
import { createCircuitBreaker, CircuitOpenError, DependencyHttpError, InvalidDependencyResponseError, readDependencyJson } from '../../shared/http/circuitBreaker.ts';
import type { ArrivalProvider, ArrivalProviderResult } from '../arrivals/provider.ts';

export interface LtaArrivalDependencies {
  request?: typeof fetch;
  now?: () => number;
  retry?: ReadRetryPolicy;
  logger?: { warn(event: string, metadata: Record<string, unknown>): void; error(event: string, metadata: Record<string, unknown>): void };
}

export function createLtaArrivalProvider(settings: AppConfig['lta'], dependencies: LtaArrivalDependencies = {}): ArrivalProvider {
  const request = dependencies.request ?? safeFetch;
  const logger = dependencies.logger ?? { warn() {}, error() {} };
  const circuit = createCircuitBreaker(settings.circuit, dependencies.now ?? Date.now);
  return {
    async fetchArrivals({ stopCode, serviceNo }): Promise<ArrivalProviderResult> {
      if (!settings.accountKey) return { status: 'unavailable', reason: 'not_configured' };
      let invalidResponse = false;
      try {
        const query = new URLSearchParams({ BusStopCode: stopCode });
        if (serviceNo) query.set('ServiceNo', serviceNo);
        const signal = AbortSignal.timeout(settings.timeoutMs);
        const body = await circuit.run(async probe => {
          const response = await fetchReadWithBackoff(request, `${settings.baseUrl}/v3/BusArrival?${query}`, {
            redirect: 'error', signal,
            headers: { AccountKey: settings.accountKey, Accept: 'application/json' },
          }, probe ? { ...(dependencies.retry ?? DEFAULT_READ_RETRY_POLICY), attempts: 1 } : dependencies.retry);
          if (!response.ok) {
            logger.warn('lta.arrivals_http_error', { status: response.status });
            await response.body?.cancel().catch(() => {});
            throw new DependencyHttpError(response.status);
          }
          return readDependencyJson(response, raw => {
            const parsed = parseArrivalResponse(raw, { expectedStopCode: stopCode });
            if (parsed.ok) return parsed.value;
            invalidResponse = true;
            logger.warn('lta.arrivals_invalid_response', { issues: parsed.issues });
            throw new InvalidDependencyResponseError();
          });
        }, signal);
        return { status: 'available', body: { ...body, source: 'LTA_DATAMALL_V3' } };
      } catch (error) {
        if (error instanceof InvalidDependencyResponseError) {
          if (!invalidResponse) logger.warn('lta.arrivals_invalid_response', { issues: [] });
          invalidResponse = true;
        } else if (!(error instanceof CircuitOpenError) && !(error instanceof DependencyHttpError)) logger.error('lta.arrivals_request_failed', { error });
        return { status: 'unavailable', reason: invalidResponse ? 'invalid_response' : 'unavailable' };
      }
    },
  };
}
