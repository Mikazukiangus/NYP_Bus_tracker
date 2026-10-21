import { config } from '../../../config';
import type { PlaceResult } from '../model';
import { parseOneMapResults } from './oneMapMapper';
import { parseOneMapResponse } from './oneMapSchema';
export function createOneMapClient(settings: { url: string; timeoutMs: number }, request: typeof fetch = (...args) => fetch(...args)) {
  // null when OneMap can't be reached or rate-limits us
  async function search(query: string, signal?: AbortSignal): Promise<PlaceResult[] | null> {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200) return null;
    try {
      const url = `${settings.url}?searchVal=${encodeURIComponent(query.trim())}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
      const timeout = AbortSignal.timeout(settings.timeoutMs);
      const res = await request(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
      return parseOneMapResults(parseOneMapResponse(await res.json()), query);
    } catch {
      return null;
    }
  }

  return { search };
}
export const oneMapClient = createOneMapClient({ url: `${config.urls.oneMapBase}/api/common/elastic/search`, timeoutMs: config.timeouts.externalMs });
