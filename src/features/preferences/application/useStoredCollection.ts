import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtomicCollection } from '../../../services/atomicPreferences';
import type { PersistenceResult } from '../../../services/persistence';

type Change<T> = (items: T[]) => T[];
// Commands must express the desired result (set/remove), so rebasing onto another tab's data is idempotent.
export function useStoredCollection<T>(store: AtomicCollection<T>, initial: () => T[]) {
  const [state, setState] = useState(() => {
    const saved = store.read();
    return { items: saved.status === 'saved' ? saved.items : initial(),
      persistence: saved.status === 'unavailable' ? 'session-only' as PersistenceResult['status'] : null };
  });
  const current = useRef(state.items);
  const journal = useRef<Change<T>[]>([]);
  const queue = useRef(Promise.resolve());
  const active = useRef(true);
  const rebase = useCallback((base: T[]) => journal.current.reduce((items, change) => change(items), base), []);

  useEffect(() => {
    active.current = true;
    const sync = () => {
      const saved = store.read();
      if (saved.status !== 'saved') return;
      const items = rebase(saved.items);
      current.current = items;
      setState(previous => ({ ...previous, items }));
    };
    const unsubscribe = store.subscribe(sync);
    sync(); // Close the gap between the first read and subscribing.
    return () => { active.current = false; unsubscribe(); };
  }, [store, rebase]);

  const apply = useCallback((change: Change<T>) => {
    journal.current.push(change);
    const items = change(current.current);
    current.current = items;
    setState(previous => ({ ...previous, items }));
    const run = async () => {
      const changes = journal.current.slice();
      if (!changes.length) return;
      const result = await store.update(base => changes.reduce((next, update) => update(next), base), current.current);
      if (result.status === 'saved') journal.current.splice(0, changes.length);
      if (!active.current) return;
      // Another tab can commit between releasing the lock and this continuation; read again before publishing.
      const saved = store.read();
      const items = result.status === 'saved' && saved.status === 'saved' ? rebase(saved.items) : rebase(result.items);
      current.current = items;
      setState({ items, persistence: result.status });
    };
    queue.current = queue.current.then(run, run);
    return queue.current;
  }, [store, rebase]);
  return { items: state.items, persistence: state.persistence, current, apply };
}
