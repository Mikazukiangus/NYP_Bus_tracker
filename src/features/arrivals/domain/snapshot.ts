import type { BusArrivalInfo, StopServiceArrivals } from '../../../types/bus';
export type ArrivalSnapshot =
  | { status: 'available'; stopCode: string; receivedAtMs: number; source: 'LTA_DATAMALL_V3'; services: StopServiceArrivals[] }
  | { status: 'unavailable'; stopCode: string; receivedAtMs: number; source: 'FALLBACK_SIMULATED' | null; reason: 'simulated' | 'invalid' | 'network' };
export function ageBus(bus: BusArrivalInfo | null, nowMs: number): BusArrivalInfo | null {
  if (bus?.estimatedArrivalAtMs === undefined) return bus;
  const estimatedMinutes = Math.max(0, Math.round((bus.estimatedArrivalAtMs - nowMs) / 60000));
  return estimatedMinutes === bus.estimatedMinutes ? bus : { ...bus, estimatedMinutes };
}
export function ageServices(services: StopServiceArrivals[] | null, nowMs: number): StopServiceArrivals[] | null {
  if (!services) return null;
  let changed = false;
  const aged = services.map(service => {
    const nextBus = ageBus(service.nextBus, nowMs);
    const nextBus2 = ageBus(service.nextBus2, nowMs);
    const nextBus3 = ageBus(service.nextBus3, nowMs);
    if (nextBus === service.nextBus && nextBus2 === service.nextBus2 && nextBus3 === service.nextBus3) return service;
    changed = true;
    return { ...service, nextBus, nextBus2, nextBus3 };
  });
  return changed ? aged : services;
}
