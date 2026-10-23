export interface ReadRetryPolicy { attempts: number; baseDelayMs: number; maxDelayMs: number }
export const DEFAULT_READ_RETRY_POLICY: Readonly<ReadRetryPolicy> = Object.freeze({ attempts: 2, baseDelayMs: 250, maxDelayMs: 2000 });

// Server transports use this safe marker only for recognized transient socket failures.
// It deliberately carries no URL, native cause, response body or credentials.
export class RetryableNetworkError extends Error {
  constructor() { super('Outbound connection temporarily unavailable.'); this.name = 'RetryableNetworkError'; }
}
export const isRetryableStatus = (status: number) => [408, 429, 500, 502, 503, 504].includes(status);
export function isRetryableFailure(error: unknown): boolean {
  // Browser fetch exposes network/CORS/TLS failures alike as TypeError. Only reads get
  // bounded retries (one by default); server safeFetch emits the narrower marker instead.
  return error instanceof RetryableNetworkError || error instanceof TypeError;
}

export function retryAfterMs(value: string | null, now: number): number | null {
  if (!value) return null;
  const raw = value.trim();
  if (/^\d+$/.test(raw)) return Number(raw) * 1000;
  // Avoid Date.parse accepting non-HTTP numeric/date shorthand.
  if (!/^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:, | )|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), )/i.test(raw)) return null;
  // HTTP's legacy asctime form omits the zone but still means GMT, not host time.
  const date = Date.parse(/^[A-Za-z]{3} .*\d{4}$/.test(raw) ? `${raw} GMT` : raw);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
export function backoffMs(attempt: number, base: number, cap: number, random = Math.random): number {
  const ceiling = Math.min(cap, base * 2 ** Math.min(attempt - 1, 30));
  // Equal jitter keeps a real pause while spreading concurrent clients.
  return Math.floor(ceiling * (0.5 + Math.min(1, Math.max(0, random())) / 2));
}
export function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const aborted = () => { clearTimeout(timer); signal.removeEventListener('abort', aborted); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, ms);
    signal.addEventListener('abort', aborted, { once: true });
  });
}
export interface RetryRuntime {
  now?: () => number;
  random?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}

// Retry at one explicit data-access boundary, never globally in fetch/safeFetch.
// One caller signal covers attempts, backoff AND subsequent body consumption.
export async function fetchReadWithBackoff(
  request: typeof fetch, input: Parameters<typeof fetch>[0], init: RequestInit & { signal: AbortSignal },
  policy: ReadRetryPolicy = DEFAULT_READ_RETRY_POLICY, runtime: RetryRuntime = {},
): Promise<Response> {
  if (!Number.isSafeInteger(policy.attempts) || policy.attempts < 1 || policy.attempts > 5 ||
      !Number.isSafeInteger(policy.baseDelayMs) || policy.baseDelayMs < 0 ||
      !Number.isSafeInteger(policy.maxDelayMs) || policy.maxDelayMs < policy.baseDelayMs || policy.maxDelayMs > 300000) {
    throw new Error('Invalid read retry policy.');
  }
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const safe = ['GET', 'HEAD'].includes(method) && init.body == null && !(input instanceof Request && input.body);
  const attempts = safe ? policy.attempts : 1;
  const now = runtime.now ?? Date.now;
  for (let attempt = 1; ; attempt++) {
    init.signal.throwIfAborted();
    let response: Response | undefined;
    try {
      response = await request(input, init);
    } catch (error) {
      if (init.signal.aborted) throw init.signal.reason;
      if (attempt >= attempts || !isRetryableFailure(error)) throw error;
    }
    if (response && (!isRetryableStatus(response.status) || attempt >= attempts)) return response;
    const advised = response ? retryAfterMs(response.headers.get('retry-after'), now()) : null;
    // Never shorten a provider's minimum delay to fit our local wait cap.
    if (response && advised !== null && advised > policy.maxDelayMs) return response;
    const delay = Math.max(backoffMs(attempt, policy.baseDelayMs, policy.maxDelayMs, runtime.random), advised ?? 0);
    if (response) await response.body?.cancel().catch(() => {});
    await (runtime.wait ?? waitForRetry)(delay, init.signal);
  }
}
