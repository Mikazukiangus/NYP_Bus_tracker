import type { PreferenceLocks } from '../../src/services/atomicPreferences';

// Simulates independent callers sharing a lock manager, not a store instance or its memory cache.
export function serialLocks(): PreferenceLocks {
  const tails = new Map<string, Promise<unknown>>();
  return { request(name: string, _options: unknown, work: () => unknown) {
    const task = (tails.get(name) ?? Promise.resolve()).then(work);
    tails.set(name, task.catch(() => {}));
    return task;
  } } as unknown as PreferenceLocks;
}
