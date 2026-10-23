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
  async function fetchPage<T>(dataset: string, skip: number, accountKey: string, retryDelayMs: number, probe: boolean): Promise<T[]> {
    const res = await fetchReadWithBackoff(request, `${settings.baseUrl}/${dataset}?$skip=${skip}`, {
      redirect: 'error', // Never forward provider credentials to a redirected origin/protocol.
      headers: { AccountKey: accountKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(settings.pageTimeoutMs),
    }, { attempts: probe ? 1 : settings.pageAttempts, baseDelayMs: retryDelayMs, maxDelayMs: settings.retryMaxMs });
    if (res.ok) {
      const body = await readDependencyJson(res, raw => parseBoundary(pageSchema, raw));
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
      const rows: T[] = [];
      const concurrency = probe ? 1 : settings.pageConcurrency;
      for (let batch = 0; ; batch++) {
        const skips = Array.from({ length: concurrency }, (_, i) => (batch * concurrency + i) * PAGE_SIZE);
        const pages = await Promise.allSettled(skips.map((skip) => fetchPage<T>(dataset, skip, accountKey, retryDelayMs ?? settings.retryDelayMs, probe)));
        const end = pages.findIndex((page) => page.status === 'fulfilled' && page.value.length < PAGE_SIZE);
        for (const page of end < 0 ? pages : pages.slice(0, end + 1)) {
          if (page.status === 'rejected') throw page.reason;
          rows.push(...page.value);
        }
        if (end >= 0) {
          try { return validate ? validate(rows) : rows; } catch { throw new InvalidDependencyResponseError(); }
        }
      }
    });
  }

  return { fetchAll };
}
