import { config } from '../config';
import type { PersistenceResult } from './persistence';

export type CollectionRead<T> = { status: 'saved'; items: T[] } | { status: 'missing' | 'invalid' | 'unavailable' };
export type CollectionUpdate<T> = PersistenceResult & { items: T[] };
export type PreferenceLocks = Pick<LockManager, 'request'>;
export interface AtomicCollection<T> {
  read(): CollectionRead<T>;
  update(change: (items: T[]) => T[], fallback: T[]): Promise<CollectionUpdate<T>>;
  subscribe(listener: () => void): () => void;
}
const CHANGED = 'bustrackersg:preferences-changed';

export function notifyPreferences(key: string) {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new window.CustomEvent(CHANGED, { detail: key }));
  } catch { /* A notification failure cannot roll back an already committed storage write. */ }
}
export function watchPreferences(key: string, listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) listener(); };
  const local = (event: Event) => { if ((event as CustomEvent).detail === key) listener(); };
  window.addEventListener('storage', storage);
  window.addEventListener(CHANGED, local);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener(CHANGED, local); };
}

export function atomicCollection<T>(key: string, read: () => CollectionRead<T>, save: (items: T[]) => PersistenceResult,
  locks?: PreferenceLocks): AtomicCollection<T> {
  return { read, subscribe: listener => watchPreferences(key, listener),
    async update(change, fallback) {
      const sessionOnly = (): CollectionUpdate<T> => ({ items: change(fallback), status: 'session-only' });
      try {
        const manager = locks ?? (typeof navigator !== 'undefined' ? navigator.locks : undefined);
        if (!manager) return sessionOnly(); // No unlocked write pretending to be an atomic mutation.
        return await manager.request(`bustrackersg:collection:${key}`, {
          mode: 'exclusive', signal: AbortSignal.timeout(config.timeouts.preferenceLockMs),
        }, () => {
          const stored = read();
          if (stored.status === 'unavailable' || stored.status === 'invalid') return sessionOnly();
          const items = change(stored.status === 'saved' ? stored.items : fallback);
          const result = save(items); // No await between reading the latest record and writing its replacement.
          if (result.status === 'saved') notifyPreferences(key);
          return { ...result, items };
        });
      } catch { return sessionOnly(); }
    },
  };
}
