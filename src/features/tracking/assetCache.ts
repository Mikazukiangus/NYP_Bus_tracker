export interface AssetCacheSettings { freshnessMs: number; maxEntries?: number }
const DEFAULT_MAX_ENTRIES = 64; // Per-browser memory policy; pending work is never evicted.

// Cache validated successes only. Consumers own cancellation, not these shared requests.
export function createAssetCache<T>(settings: AssetCacheSettings, cacheable: (value: T) => boolean, now = Date.now) {
  const maxEntries = settings.maxEntries ?? DEFAULT_MAX_ENTRIES;
  if (!Number.isFinite(settings.freshnessMs) || settings.freshnessMs < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError('Invalid route asset cache settings');
  }
  const values = new Map<string, { at: number; value: T }>();
  const pending = new Map<string, Promise<T>>();
  return function get(key: string, load: () => Promise<T>): Promise<T> {
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const cached = values.get(key);
    const age = cached ? now() - cached.at : Infinity;
    if (cached && age >= 0 && age < settings.freshnessMs) {
      values.delete(key);
      values.set(key, cached); // LRU reads do not extend expiry.
      return Promise.resolve(cached.value);
    }
    values.delete(key);
    const task = Promise.resolve().then(load).then(value => {
      if (settings.freshnessMs > 0 && cacheable(value)) {
        values.set(key, { at: now(), value });
        while (values.size > maxEntries) values.delete(values.keys().next().value!);
      }
      return value;
    }).finally(() => { pending.delete(key); });
    pending.set(key, task);
    return task;
  };
}
