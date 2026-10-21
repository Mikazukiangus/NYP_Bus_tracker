import { parseHTML } from 'linkedom';

// Each test owns its document; restore the host even when an assertion fails.
export function withDocument<T>(run: (document: Document) => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  try { return run(document as unknown as Document); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}
