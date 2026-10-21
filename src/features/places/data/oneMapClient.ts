import { config } from '../../../config';
import type { PlaceResult } from '../model';
import { parseOneMapResults, type OneMapResult } from './oneMapMapper';
export function createOneMapClient(settings: { url: string; timeoutMs: number }, request: typeof fetch = (...args) => fetch(...args)) {
  // null when OneMap can't be reached or rate-limits us
  async function search(query: string, signal?: AbortSignal): Promise<PlaceResult[] | null> {
    try {
      const url = `${settings.url}?searchVal=${encodeURIComponent(query.trim())}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
      const timeout = AbortSignal.timeout(settings.timeoutMs);
      const res = await request(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!res.ok) return null;
      const body = (await res.json()) as { results?: OneMapResult[] };
      return Array.isArray(body?.results) ? parseOneMapResults(body.results, query) : null;
    } catch {
      return null;
    }
  }

  return { search };
}
export const oneMapClient = createOneMapClient({ url: `${config.urls.oneMapBase}/api/common/elastic/search`, timeoutMs: config.timeouts.externalMs });
