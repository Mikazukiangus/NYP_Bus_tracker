import type { ArrivalProvider, ArrivalService, SimulatedArrivalFactory } from './provider.ts';

export function createArrivalService(provider: ArrivalProvider, simulate: SimulatedArrivalFactory): ArrivalService {
  return {
    async arrivals(stopCode, serviceNo) {
      const query = { stopCode, serviceNo };
      const result = await provider.fetchArrivals(query);
      if (result.status === 'available') return { kind: 'live', body: result.body };
      return { kind: 'simulated', body: simulate(query, result.reason) };
    },
  };
}
