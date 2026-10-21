import type { AppConfig } from '../../config/schema.ts';
import { pageSchema } from './schemas';
import { parseBoundary } from '../../shared/input/primitives';

const PAGE_SIZE = 500;

// Transport settings and fetch are injected; no config loading or HTTP adapter dependency.
export function createLtaClient(settings: AppConfig['lta'], request: typeof fetch = (...args) => fetch(...args)) {
  async function fetchPage<T>(dataset: string, skip: number, accountKey: string, retryDelayMs = settings.retryDelayMs): Promise<T[]> {
    for (let attempt = 1; ; attempt++) {
      const res = await request(`${settings.baseUrl}/${dataset}?$skip=${skip}`, {
        redirect: 'error', // Never forward provider credentials to a redirected origin/protocol.
        headers: { AccountKey: accountKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(settings.pageTimeoutMs),
      }).catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))));
      if (!(res instanceof Error) && res.ok) {
        if (!res.headers.get('content-type')?.includes('json')) throw new Error('Invalid external data.');
        const body = parseBoundary(pageSchema, await res.json());
        return body.value as T[];
      }
      // A server error, too many requests or no answer may pass; anything else (a bad key) won't
      const retryable = res instanceof Error || res.status >= 500 || res.status === 429;
      if (!retryable || attempt >= settings.pageAttempts) {
        throw new Error(`LTA ${dataset} skip=${skip} failed (${res instanceof Error ? 'connection_or_timeout' : res.status})`);
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * 3 ** (attempt - 1)));
    }
  }

  // Fetch every page of a dataset, a batch of pages at a time, until a short page signals the end. Pages after the
  // end are asked for too (they come back empty), so one of those failing doesn't matter.
  async function fetchAll<T>(dataset: string, accountKey: string, retryDelayMs?: number): Promise<T[]> {
    const rows: T[] = [];
    for (let batch = 0; ; batch++) {
      const skips = Array.from({ length: settings.pageConcurrency }, (_, i) => (batch * settings.pageConcurrency + i) * PAGE_SIZE);
      const pages = await Promise.allSettled(skips.map((skip) => fetchPage<T>(dataset, skip, accountKey, retryDelayMs)));
      const end = pages.findIndex((page) => page.status === 'fulfilled' && page.value.length < PAGE_SIZE);
      for (const page of end < 0 ? pages : pages.slice(0, end + 1)) {
        if (page.status === 'rejected') throw page.reason;
        rows.push(...page.value);
      }
      if (end >= 0) return rows;
    }
  }

  return { fetchAll };
}
