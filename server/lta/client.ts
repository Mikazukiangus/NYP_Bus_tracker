import type { AppConfig } from '../../config/schema.ts';
import { pageSchema } from './schemas.ts';
import { parseBoundary } from '../../shared/input/primitives.ts';
import { safeFetch } from '../../security/ssrf.ts';
import { fetchReadWithBackoff } from '../../shared/http/readRetry.ts';
import { createCircuitBreaker, DependencyHttpError, InvalidDependencyResponseError, readDependencyJson } from '../../shared/http/circuitBreaker.ts';

const PAGE_SIZE = 500;
class LtaPageError extends DependencyHttpError {
  constructor(dataset: string, skip: number, status: number) {
    super(status);
    this.message = `LTA ${dataset} skip=${skip} failed (${status})`;
  }
}

// Transport settings and fetch are injected; no config loading or HTTP adapter dependency.
export function createLtaClient(settings: AppConfig['lta'], request: typeof fetch = safeFetch, now = Date.now) {
  const circuits = new Map<string, ReturnType<typeof createCircuitBreaker>>();
  async function fetchPage<T>(dataset: string, skip: number, accountKey: string, retryDelayMs: number, probe: boolean, overall: AbortSignal, consumeBytes: (bytes: number) => void): Promise<T[]> {
    const signal = AbortSignal.any([overall, AbortSignal.timeout(settings.pageTimeoutMs)]);
    const res = await fetchReadWithBackoff(request, `${settings.baseUrl}/${dataset}?$skip=${skip}`, {
      redirect: 'error', // Never forward provider credentials to a redirected origin/protocol.
      headers: { AccountKey: accountKey, Accept: 'application/json' },
      signal: signal,
    }, { attempts: probe ? 1 : settings.pageAttempts, baseDelayMs: retryDelayMs, maxDelayMs: settings.retryMaxMs });
    if (res.ok) {
      const body = await readDependencyJson(res, raw => parseBoundary(pageSchema, raw), { signal, consumeBytes });
      return body.value as T[];
    }
    await res.body?.cancel().catch(() => {});
    throw new LtaPageError(dataset, skip, res.status);
  }

  // Fetch every page of a dataset, a batch of pages at a time, until a short page signals the end. Pages after the
  // end are asked for too (they come back empty), so one of those failing doesn't matter.
  async function fetchAll<T>(dataset: string, accountKey: string, retryDelayMs?: number, validate?: (rows: T[]) => T[]): Promise<T[]> {
    let circuit = circuits.get(dataset);
    if (!circuit) { circuit = createCircuitBreaker(settings.circuit, now); circuits.set(dataset, circuit); }
    return circuit.run(async probe => {
      const budget = new AbortController();
      const overall = AbortSignal.any([budget.signal, AbortSignal.timeout(settings.collectionTimeoutMs)]);
      let decodedBytes = 0;
      const consumeBytes = (bytes: number) => {
        decodedBytes += bytes;
        if (decodedBytes > settings.maxCollectionBytes) {
          const error = new InvalidDependencyResponseError();
          budget.abort(error); // Cancel peers instead of continuing to allocate the rest of this batch.
          throw error;
        }
      };
      const rows: T[] = [];
      const concurrency = probe ? 1 : settings.pageConcurrency;
      for (let pageIndex = 0; pageIndex < settings.maxPages; pageIndex += concurrency) {
        overall.throwIfAborted();
        const skips = Array.from({ length: Math.min(concurrency, settings.maxPages - pageIndex) }, (_, i) => (pageIndex + i) * PAGE_SIZE);
        const pages = await Promise.allSettled(skips.map((skip) => fetchPage<T>(dataset, skip, accountKey, retryDelayMs ?? settings.retryDelayMs, probe, overall, consumeBytes)));
        overall.throwIfAborted();
        const end = pages.findIndex((page) => page.status === 'fulfilled' && page.value.length < PAGE_SIZE);
        for (const page of end < 0 ? pages : pages.slice(0, end + 1)) {
          if (page.status === 'rejected') throw page.reason;
          if (rows.length + page.value.length > settings.maxRows) throw new InvalidDependencyResponseError();
          rows.push(...page.value);
        }
        if (end >= 0) {
          try { return validate ? validate(rows) : rows; } catch { throw new InvalidDependencyResponseError(); }
        }
      }
      throw new InvalidDependencyResponseError();
    });
  }

  return { fetchAll };
}
