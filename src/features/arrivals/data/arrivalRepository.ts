import { config } from '../../../config';
import { fetchArrivalSnapshot, type ArrivalRequestOptions } from '../client';
import { ageServices, type ArrivalSnapshot } from '../domain/snapshot';

type LiveSnapshot = Extract<ArrivalSnapshot, { status: 'available' }>;
interface Dependencies {
  load: (stopCode: string, options?: ArrivalRequestOptions) => Promise<ArrivalSnapshot>;
  now?: () => number;
}
interface Settings { freshnessMs: number; maxEntries?: number }
const DEFAULT_MAX_CACHED_STOPS = 128; // Bound per-browser memory; in-flight requests are never evicted.

export function createArrivalRepository(settings: Settings, dependencies: Dependencies) {
  const now = dependencies.now ?? Date.now;
  const maxEntries = settings.maxEntries ?? DEFAULT_MAX_CACHED_STOPS;
  if (!Number.isFinite(settings.freshnessMs) || settings.freshnessMs < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError('Invalid arrival cache settings');
  }
  const snapshots = new Map<string, LiveSnapshot>();
  const pending = new Map<string, Promise<ArrivalSnapshot>>();
  const unavailable = (stopCode: string, reason: 'network' | 'invalid'): ArrivalSnapshot =>
    ({ status: 'unavailable', stopCode, receivedAtMs: now(), source: null, reason });

  function load(stopCode: string, options: ArrivalRequestOptions = {}): Promise<ArrivalSnapshot> {
    const key = stopCode.trim(); // Retain leading zeros.
    if (!/^\d{5}$/.test(key)) return Promise.resolve(unavailable(key, 'invalid'));
    // Manual refresh bypasses a settled value, but joins an already-running refresh.
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const cached = snapshots.get(key);
    const ageMs = cached ? now() - cached.receivedAtMs : Infinity;
    if (!options.forceRefresh && cached && ageMs >= 0 && ageMs < settings.freshnessMs) {
      snapshots.delete(key);
      snapshots.set(key, cached); // LRU order changes without extending freshness.
      return Promise.resolve(cached);
    }
    snapshots.delete(key);
    const task = Promise.resolve()
      .then(() => dependencies.load(key, options))
      .then(result => {
        if (result.stopCode !== key || !Number.isFinite(result.receivedAtMs)) return unavailable(key, 'invalid');
        // Empty live services are cacheable; simulated/unavailable data never is.
        if (result.status === 'available') {
          snapshots.set(key, result);
          while (snapshots.size > maxEntries) snapshots.delete(snapshots.keys().next().value!);
        }
        return result;
      })
      .catch(() => unavailable(key, 'network'))
      .finally(() => { pending.delete(key); });
    pending.set(key, task);
    return task;
  }

  async function services(stopCode: string, options?: ArrivalRequestOptions) {
    const snapshot = await load(stopCode, options);
    return snapshot.status === 'available' ? ageServices(snapshot.services, now()) : null;
  }
  return { load, services };
}

// All polling owners use this one repository. I/O validation remains in the transport client.
export const arrivalRepository = createArrivalRepository(
  { freshnessMs: config.polling.arrivalsSeconds * 1000 },
  { load: fetchArrivalSnapshot },
);
