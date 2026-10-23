import type { AppConfig } from '../config/schema.ts';
import { safeFetch } from '../security/ssrf.ts';
import { backoffMs, isRetryableFailure, isRetryableStatus, retryAfterMs, waitForRetry, type RetryRuntime } from '../shared/http/readRetry.ts';

// Explicit POST exception: the offline builder's fixed Overpass interpreter query
// reads OSM data. This is not a general-purpose retryable POST transport.
export async function fetchOverpassQuery(settings: AppConfig['shapes'], query: string, dependencies: RetryRuntime & {
  request?: typeof safeFetch;
  logger?: { info(event: string, metadata: Record<string, unknown>): void; warn(event: string, metadata: Record<string, unknown>): void };
} = {}): Promise<unknown> {
  const request = dependencies.request ?? safeFetch;
  const now = dependencies.now ?? Date.now;
  const wait = dependencies.wait ?? waitForRetry;
  const deadline = now() + settings.deadlineMs;
  const overall = AbortSignal.timeout(settings.deadlineMs);
  const disabled = new Set<string>();
  const cooldown = new Map<string, number>();
  for (let round = 1; round <= settings.rounds; round++) {
    for (const url of settings.instances) {
      const origin = new URL(url).origin;
      const remaining = deadline - now();
      if (remaining < 30000 || overall.aborted) break;
      if (disabled.has(url) || (cooldown.get(origin) ?? 0) > now()) continue;
      try {
        dependencies.logger?.info('build.shapes_query', { round, rounds: settings.rounds, provider: new URL(url).hostname });
        const res = await request(url, {
          redirect: 'error', method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': settings.userAgent },
          body: new URLSearchParams({ data: query }).toString(),
          signal: AbortSignal.any([overall, AbortSignal.timeout(Math.min(settings.timeoutMs, remaining))]),
          timeoutMs: Math.min(settings.timeoutMs, remaining),
        });
        if (res.ok) {
          if (!res.headers.get('content-type')?.includes('json')) {
            await res.body?.cancel().catch(() => {});
            throw new Error('Invalid external data.');
          }
          return await res.json();
        }
        const retryable = isRetryableStatus(res.status);
        const advised = retryAfterMs(res.headers.get('retry-after'), now());
        if (retryable && advised !== null) cooldown.set(origin, now() + advised);
        if (!retryable) disabled.add(url);
        await res.body?.cancel().catch(() => {});
        dependencies.logger?.warn('build.shapes_provider_failed', { status: res.status });
      } catch (error) {
        // A per-attempt timeout can retry within the separate rebuild deadline.
        // Invalid JSON, TLS/configuration and SSRF refusals disable this endpoint.
        if (!isRetryableFailure(error) && !(error instanceof Error && error.name === 'TimeoutError')) disabled.add(url);
        dependencies.logger?.warn('build.shapes_provider_failed', { error });
      }
    }
    const active = settings.instances.filter(url => !disabled.has(url));
    if (!active.length || round === settings.rounds || overall.aborted) break;
    const readyIn = Math.max(0, Math.min(...active.map(url => (cooldown.get(new URL(url).origin) ?? 0) - now())));
    const pause = Math.max(readyIn, backoffMs(round, settings.retryPauseMs, 300000, dependencies.random));
    if (now() + pause + 30000 > deadline) break;
    await wait(pause, overall);
  }
  throw new Error('All Overpass instances failed after bounded retries; try again later.');
}
