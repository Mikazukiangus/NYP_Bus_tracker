import { createTtlCache, type CacheSettings } from './ttlCache.ts';

interface Pending<T> { promise: Promise<T>; controller: AbortController; users: number }

// Each subscriber owns cancellation. Only the last departing subscriber cancels shared I/O.
export function createAsyncCache<T>(settings: CacheSettings, cacheable: (value: T) => boolean, now = Date.now) {
  const values = createTtlCache<T>(settings, now);
  const pending = new Map<string, Pending<T>>();
  function subscribe(key: string, entry: Pending<T>, signal?: AbortSignal): Promise<T> {
    entry.users++;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (complete: () => void) => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', abort);
        entry.users--;
        complete();
      };
      const abort = () => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', abort);
        entry.users--;
        const reason = signal!.reason;
        if (!entry.users) {
          if (pending.get(key) === entry) pending.delete(key);
          entry.controller.abort();
          // Let the bounded loader release its circuit/probe before the last caller resumes.
          entry.promise.then(() => reject(reason), () => reject(reason));
        } else reject(reason);
      };
      signal?.addEventListener('abort', abort, { once: true });
      entry.promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
      if (signal?.aborted) abort();
    });
  }
  function load(key: string, loader: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const active = pending.get(key);
    if (active) return subscribe(key, active, signal);
    const hit = values.get(key);
    if (hit !== undefined) return Promise.resolve(hit);
    let resolve!: (value: T) => void, reject!: (error: unknown) => void;
    const base = new Promise<T>((r, j) => { resolve = r; reject = j; });
    const entry: Pending<T> = { controller: new AbortController(), users: 0, promise: base };
    entry.promise = base.then(value => {
      if (pending.get(key) === entry && !entry.controller.signal.aborted && cacheable(value)) values.set(key, value);
      return value;
    }).finally(() => { if (pending.get(key) === entry) pending.delete(key); });
    pending.set(key, entry); // Reserve before invoking a loader, including synchronous/re-entrant loaders.
    const subscriber = subscribe(key, entry, signal);
    try { Promise.resolve(loader(entry.controller.signal)).then(resolve, reject); }
    catch (error) { reject(error); }
    return subscriber;
  }
  function invalidate(key?: string) {
    values.invalidate(key);
    for (const [id, entry] of pending) {
      if (key !== undefined && key !== id) continue;
      pending.delete(id);
      entry.controller.abort(); // Even an abort-ignoring late completion cannot publish after invalidation.
    }
  }
  return { load, invalidate };
}
