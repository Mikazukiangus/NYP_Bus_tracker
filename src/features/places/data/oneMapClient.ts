import { config } from '../../../config';
import type { PlaceResult } from '../model';
import { parseOneMapResults } from './oneMapMapper';
import { parseOneMapResponse } from './oneMapSchema';
import { fetchReadWithBackoff } from '../../../../shared/http/readRetry';
import { createCircuitBreaker, DependencyHttpError, readDependencyJson, type CircuitSettings } from '../../../../shared/http/circuitBreaker';
import { createAsyncCache } from '../../../../shared/cache/asyncCache';
export function createOneMapClient(settings: { url: string; timeoutMs: number; circuit?: CircuitSettings; freshnessMs?: number; maxEntries?: number }, request: typeof fetch = (...args) => fetch(...args), now = Date.now) {
  const circuit = createCircuitBreaker(settings.circuit ?? config.oneMapCircuit, now);
  const cache = createAsyncCache<PlaceResult[]>({ freshnessMs: settings.freshnessMs ?? config.cache.placeSearchSeconds * 1000,
    maxEntries: settings.maxEntries ?? 64 }, () => true, now);
  // null when OneMap can't be reached or rate-limits us
  async function search(query: string, signal?: AbortSignal): Promise<PlaceResult[] | null> {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200) return null;
    const key = query.trim();
    try {
      return await cache.load(key, async ownerSignal => {
        const url = `${settings.url}?searchVal=${encodeURIComponent(key)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
        const timeout = AbortSignal.timeout(settings.timeoutMs);
        const combined = AbortSignal.any([ownerSignal, timeout]);
        return circuit.run(async probe => {
          const res = await fetchReadWithBackoff(request, url, { signal: combined, cache: 'no-store' }, probe ? { ...config.retry, attempts: 1 } : config.retry);
          if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new DependencyHttpError(res.status); }
          return readDependencyJson(res, raw => parseOneMapResults(parseOneMapResponse(raw), key));
        }, combined);
      }, signal);
    } catch {
      return null;
    }
  }

  return { search, invalidate: (query?: string) => cache.invalidate(query?.trim()) };
}
export const oneMapClient = createOneMapClient({ url: `${config.urls.oneMapBase}/api/common/elastic/search`, timeoutMs: config.timeouts.externalMs });
