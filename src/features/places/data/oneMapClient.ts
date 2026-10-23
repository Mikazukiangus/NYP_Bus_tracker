import { config } from '../../../config';
import type { PlaceResult } from '../model';
import { parseOneMapResults } from './oneMapMapper';
import { parseOneMapResponse } from './oneMapSchema';
import { fetchReadWithBackoff } from '../../../../shared/http/readRetry';
import { createCircuitBreaker, DependencyHttpError, readDependencyJson, type CircuitSettings } from '../../../../shared/http/circuitBreaker';
export function createOneMapClient(settings: { url: string; timeoutMs: number; circuit?: CircuitSettings }, request: typeof fetch = (...args) => fetch(...args), now = Date.now) {
  const circuit = createCircuitBreaker(settings.circuit ?? config.oneMapCircuit, now);
  // null when OneMap can't be reached or rate-limits us
  async function search(query: string, signal?: AbortSignal): Promise<PlaceResult[] | null> {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200) return null;
    try {
      const url = `${settings.url}?searchVal=${encodeURIComponent(query.trim())}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
      const timeout = AbortSignal.timeout(settings.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      return await circuit.run(async probe => {
        const res = await fetchReadWithBackoff(request, url, { signal: combined }, probe ? { ...config.retry, attempts: 1 } : config.retry);
        if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new DependencyHttpError(res.status); }
        return readDependencyJson(res, raw => parseOneMapResults(parseOneMapResponse(raw), query));
      }, combined);
    } catch {
      return null;
    }
  }

  return { search };
}
export const oneMapClient = createOneMapClient({ url: `${config.urls.oneMapBase}/api/common/elastic/search`, timeoutMs: config.timeouts.externalMs });
