import type { AppConfig } from '../../config/schema.ts';
import { createArrivalService as composeArrivalService } from '../arrivals/service.ts';
import { createLtaArrivalProvider, type LtaArrivalDependencies } from './arrivalProvider.ts';
import { generateSimulatedLtaResponse } from './simulatedArrivals.ts';
export type { ArrivalResult } from '../arrivals/provider.ts';

// Compatibility composition root: existing callers retain settings/dependency injection.
// The HTTP handler itself depends only on ArrivalService, not on this provider factory.
export function createArrivalService(settings: AppConfig['lta'], dependencies: LtaArrivalDependencies = {}) {
  const now = dependencies.now ?? Date.now;
  return composeArrivalService(createLtaArrivalProvider(settings, dependencies), (query, reason) => {
    const body = generateSimulatedLtaResponse(query.stopCode, query.serviceNo, now(), settings.baseUrl);
    if (reason !== 'not_configured') body.warning = reason === 'invalid_response'
      ? 'LTA returned invalid arrival data. These timings are simulated.'
      : 'Live LTA arrival data is temporarily unavailable. These timings are simulated.';
    return body;
  });
}
