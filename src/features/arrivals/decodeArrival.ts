import type { BusArrivalInfo } from '../../types/bus';
import type { LTAArrivalSlot, LTABusArrival } from '../../../shared/transit/arrivals';

// Only validated wire records reach this mapper. Provider visits are not route stop sequences.
export function parseBus(raw?: LTAArrivalSlot, nowMs = Date.now()): BusArrivalInfo | null {
  if (!raw?.EstimatedArrival) return null;
  const bus = raw as LTABusArrival;
  const estimatedArrivalAtMs = Date.parse(bus.EstimatedArrival);
  const lat = Number(bus.Latitude), lng = Number(bus.Longitude);
  const position = bus.Latitude && bus.Longitude && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? { lat, lng } : null;
  const monitoring = bus.Monitored === 1 ? 'live' : bus.Monitored === 0 ? 'scheduled' : 'unknown';
  return {
    estimatedArrivalAtMs, estimatedMinutes: Math.max(0, Math.round((estimatedArrivalAtMs - nowMs) / 60000)),
    ...(bus.OriginCode ? { originCode: bus.OriginCode } : {}), ...(bus.DestinationCode ? { destinationCode: bus.DestinationCode } : {}),
    ...(bus.VisitNumber ? { visitNumber: Number(bus.VisitNumber) } : {}),
    load: bus.Load, type: bus.Type, feature: bus.Feature, position, monitoring,
    ...(position ?? {}), ...(bus.Monitored === undefined ? {} : { monitored: bus.Monitored === 1 }),
  };
}
