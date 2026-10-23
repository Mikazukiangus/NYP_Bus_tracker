export type PersistenceResult = { status: 'saved' | 'session-only' | 'invalid' };

// Storage access itself can throw (privacy settings), as can serialization and quota checks.
export function persistValue(key: string, value: unknown, storage?: Pick<Storage, 'setItem'>): PersistenceResult {
  try {
    (storage ?? window.localStorage).setItem(key, JSON.stringify(value));
    return { status: 'saved' };
  } catch {
    return { status: 'session-only' };
  }
}
