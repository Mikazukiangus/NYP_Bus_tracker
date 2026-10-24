export interface CacheSettings { freshnessMs: number; maxEntries: number }

// Fixed expiry from successful completion; LRU hits never prolong freshness.
export function createTtlCache<T>(settings: CacheSettings, now = Date.now) {
  if (!Number.isFinite(settings.freshnessMs) || settings.freshnessMs < 0 ||
      !Number.isSafeInteger(settings.maxEntries) || settings.maxEntries < 1) throw new RangeError('Invalid cache settings');
  const values = new Map<string, { at: number; value: T }>();
  function get(key: string): T | undefined {
    const hit = values.get(key);
    if (!hit) return;
    const age = now() - hit.at;
    values.delete(key);
    if (age < 0 || age >= settings.freshnessMs) return;
    values.set(key, hit);
    return hit.value;
  }
  function set(key: string, value: T) {
    values.delete(key);
    if (!settings.freshnessMs) return;
    values.set(key, { at: now(), value });
    while (values.size > settings.maxEntries) values.delete(values.keys().next().value!);
  }
  function invalidate(key?: string) { if (key === undefined) values.clear(); else values.delete(key); }
  return { get, set, invalidate };
}
