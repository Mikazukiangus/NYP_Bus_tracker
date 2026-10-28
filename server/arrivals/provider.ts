import type { LTABusArrivalResponse } from '../../shared/transit/arrivals.ts';

// Adapters normalize upstream data into the existing validated application wire contract.
// Credentials, URLs and dependency resilience policies belong to the concrete adapter.
export interface ArrivalQuery { stopCode: string; serviceNo?: string }
export type LiveArrivalResponse = LTABusArrivalResponse & { source: 'LTA_DATAMALL_V3' };
export type SimulatedArrivalResponse = LTABusArrivalResponse & { source: 'FALLBACK_SIMULATED' };
export type ArrivalUnavailableReason = 'not_configured' | 'invalid_response' | 'unavailable';
export type ArrivalProviderResult =
  | { status: 'available'; body: LiveArrivalResponse }
  | { status: 'unavailable'; reason: ArrivalUnavailableReason };
export interface ArrivalProvider {
  // Expected dependency failures are unavailable; an available empty feed is a success.
  fetchArrivals(query: ArrivalQuery): Promise<ArrivalProviderResult>;
}
export type ArrivalResult =
  | { kind: 'live'; body: LiveArrivalResponse }
  | { kind: 'simulated'; body: SimulatedArrivalResponse };
export interface ArrivalService {
  arrivals(stopCode: string, serviceNo?: string): Promise<ArrivalResult>;
}
export type SimulatedArrivalFactory = (query: ArrivalQuery, reason: ArrivalUnavailableReason) => SimulatedArrivalResponse;
