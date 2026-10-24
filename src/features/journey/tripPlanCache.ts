import { config } from '../../config';
import { createTtlCache } from '../../../shared/cache/ttlCache';
import { coordinate } from '../../../shared/transit/validation';
import type { BusNetwork } from '../network/model';
import { planTrips, type TripPlan } from '../../services/tripPlanner';

export function createTripPlanCache(
  settings: { freshnessMs: number; maxEntries?: number },
  compute = planTrips,
  now = Date.now,
) {
  type Cache = ReturnType<typeof createTtlCache<TripPlan>>;
  let networks = new WeakMap<BusNetwork, Cache>();
  // Validate settings even before the first network is requested.
  const policy = { ...settings, maxEntries: settings.maxEntries ?? 16 };
  createTtlCache<TripPlan>(policy, now);
  function plan(network: BusNetwork, from: { lat: number; lng: number }, to: { lat: number; lng: number }): TripPlan {
    if (!coordinate(from.lat, from.lng) || !coordinate(to.lat, to.lng)) throw new RangeError('Invalid trip coordinates');
    let cache = networks.get(network);
    if (!cache) { cache = createTtlCache<TripPlan>(policy, now); networks.set(network, cache); }
    // Exact coordinates preserve walking distances and stop choice; refreshed networks get a new owner.
    const key = JSON.stringify([network.datasetVersion ?? network.generatedAt, from.lat, from.lng, to.lat, to.lng]);
    const hit = cache.get(key);
    if (hit) return hit;
    const result = compute(network, from, to);
    cache.set(key, result);
    return result;
  }
  function invalidate(network?: BusNetwork) { if (network) networks.delete(network); else networks = new WeakMap(); }
  return { plan, invalidate };
}

export const tripPlanCache = createTripPlanCache({ freshnessMs: config.cache.tripPlansSeconds * 1000 });
