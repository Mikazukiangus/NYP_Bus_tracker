import { isRetryableFailure, isRetryableStatus } from './readRetry.ts';

export interface CircuitSettings { failureThreshold: number; failureWindowMs: number; openMs: number }
export const DEFAULT_CIRCUIT_SETTINGS: Readonly<CircuitSettings> = Object.freeze({ failureThreshold: 3, failureWindowMs: 60000, openMs: 30000 });
export class CircuitOpenError extends Error {
  constructor(readonly retryAfterMs: number) { super('Upstream temporarily unavailable; circuit is open.'); this.name = 'CircuitOpenError'; }
}
export class DependencyHttpError extends Error {
  constructor(readonly status: number) { super('Upstream request failed.'); this.name = 'DependencyHttpError'; }
}
export class InvalidDependencyResponseError extends Error {
  constructor() { super('Invalid external data.'); this.name = 'InvalidDependencyResponseError'; }
}

export function isDependencyFailure(error: unknown): boolean {
  return error instanceof DependencyHttpError ? isRetryableStatus(error.status)
    : error instanceof InvalidDependencyResponseError || isRetryableFailure(error) || error instanceof Error && error.name === 'TimeoutError';
}

// Validated successes alone close a probe; parse errors have a fixed safe marker.
export async function readDependencyJson<T>(response: Response, parse: (raw: unknown) => T): Promise<T> {
  if (!response.headers.get('content-type')?.includes('json')) {
    await response.body?.cancel().catch(() => {});
    throw new InvalidDependencyResponseError();
  }
  const raw: unknown = await response.json().catch(error => {
    if (error instanceof SyntaxError) throw new InvalidDependencyResponseError();
    throw error;
  });
  try { return parse(raw); } catch { throw new InvalidDependencyResponseError(); }
}

// One owner per dependency/service instance. This is not a distributed limiter.
export function createCircuitBreaker(settings: CircuitSettings = DEFAULT_CIRCUIT_SETTINGS, clock = Date.now) {
  if (!Number.isSafeInteger(settings.failureThreshold) || settings.failureThreshold < 1 || settings.failureThreshold > 20 ||
      !Number.isSafeInteger(settings.failureWindowMs) || settings.failureWindowMs < 1 || settings.failureWindowMs > 600000 ||
      !Number.isSafeInteger(settings.openMs) || settings.openMs < 1 || settings.openMs > 300000) throw new Error('Invalid circuit breaker settings.');
  settings = Object.freeze({ ...settings });
  let state: 'closed' | 'open' | 'half-open' = 'closed';
  let epoch = 0, openUntil = 0, lastTime = -Infinity;
  let failures: number[] = [];
  // A backward wall-clock adjustment must not hold a circuit open indefinitely.
  const now = () => { const value = clock(); if (value < lastTime && state === 'open') openUntil = value + settings.openMs; lastTime = value; return value; };
  const open = (time: number) => { state = 'open'; openUntil = time + settings.openMs; epoch++; };
  const canRequest = () => state === 'closed' || state === 'open' && now() >= openUntil;
  const snapshot = () => { const time = now(); return { state, failures: failures.filter(t => time - t >= 0 && time - t <= settings.failureWindowMs).length, retryAfterMs: state === 'closed' ? 0 : Math.max(0, openUntil - time) }; };

  async function run<T>(operation: (probe: boolean) => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const started = now();
    if (state === 'half-open' || state === 'open' && started < openUntil) throw new CircuitOpenError(Math.max(0, openUntil - started));
    const probe = state === 'open';
    if (probe) state = 'half-open'; // Synchronous admission: only one probe.
    const ticket = epoch;
    try {
      const value = await operation(probe);
      signal?.throwIfAborted();
      if (ticket === epoch) {
        failures = [];
        if (probe) { state = 'closed'; epoch++; }
      }
      return value;
    } catch (error) {
      if (ticket === epoch) {
        const time = now();
        const cancelled = signal?.aborted && !(signal.reason instanceof Error && signal.reason.name === 'TimeoutError');
        const failed = !cancelled && (isDependencyFailure(error) || signal?.aborted && signal.reason instanceof Error && signal.reason.name === 'TimeoutError');
        if (failed) {
          failures = failures.filter(t => time - t >= 0 && time - t <= settings.failureWindowMs);
          failures.push(time);
          failures = failures.slice(-settings.failureThreshold);
          if (probe || failures.length >= settings.failureThreshold) open(time);
        } else if (probe) {
          // An abandoned/neutral probe says nothing about recovery; free its slot.
          state = 'open'; openUntil = time; epoch++;
        }
      }
      throw error;
    }
  }
  return { run, canRequest, snapshot };
}
