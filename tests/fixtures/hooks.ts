import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';

export type Rig<T> = { read(): T; change(action: () => void | Promise<unknown>): Promise<void>; poll(ms: number): Promise<void>; rerender(): Promise<void> };
export async function withHook<T>(hook: () => T, run: (rig: Rig<T>) => Promise<void>, overrides: Record<string, unknown> = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  const callbacks = new Map<number, () => unknown>();
  const patches: Record<string, unknown> = { window, document, navigator: {}, IS_REACT_ACT_ENVIRONMENT: true,
    setInterval(fn: () => unknown, delay: number) { callbacks.set(delay, fn); return delay; },
    clearInterval(id: number) { callbacks.delete(id); }, ...overrides };
  const descriptors = new Map(Object.keys(patches).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(patches)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(document.getElementById('root')! as unknown as HTMLElement);
  let value: T;
  function Harness() { value = hook(); return null; }
  const change = async (action: () => void | Promise<unknown>) => { await act(async () => { await action(); }); };
  try {
    await change(() => root.render(createElement(Harness)));
    await run({ read: () => value!, change, rerender: () => change(() => root.render(createElement(Harness))), poll: ms => change(async () => { await callbacks.get(ms)?.(); }) });
  } finally {
    await change(() => root.unmount());
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}
