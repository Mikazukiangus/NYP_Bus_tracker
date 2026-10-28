import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { ErrorBoundary, GlobalErrorNotice } from '../src/features/errors/ErrorBoundary';
import { browserErrors, SAFE_ERROR_MESSAGE } from '../src/features/errors/reporting';

test('a real React render failure reports safely, shows its reference and provides a working reload action', async () => {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  let reloads = 0, caught = 0;
  const reports: Record<string, unknown>[] = [];
  Object.defineProperty(window, 'location', { configurable: true, value: { reload() { reloads++; } } });
  const patches = { window, document, IS_REACT_ACT_ENVIRONMENT: true, fetch: async (_input: unknown, init?: RequestInit) => {
    reports.push(JSON.parse(String(init?.body))); return new Response(null, { status: 204 });
  } };
  const descriptors = new Map(Object.keys(patches).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(patches)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(document.getElementById('root')! as unknown as HTMLElement, { onCaughtError() { caught++; } });
  const uninstall = browserErrors.install(window as unknown as Window);
  function Broken(): never { throw new Error('<img src=x onerror=alert(1)> PRIVATE_RENDER_FAILURE'); }
  try {
    await act(async () => { root.render(createElement(ErrorBoundary, null, createElement(Broken))); });
    assert.equal(caught, 1); assert.equal(reports.length, 1);
    const alert = document.querySelector('[role="alert"]')!;
    assert.ok(alert.textContent.includes(SAFE_ERROR_MESSAGE));
    assert.ok(alert.textContent.includes(`Reference: ${reports[0].eventId}`));
    assert.doesNotMatch(document.body.innerHTML + JSON.stringify(reports), /PRIVATE_RENDER_FAILURE|onerror=|<img/);
    assert.equal((reports[0].context as Record<string, unknown>).operation, 'browser.render');
    document.querySelector('button')!.click(); assert.equal(reloads, 1);
    await act(async () => { root.render(createElement(GlobalErrorNotice)); });
    await act(async () => { browserErrors.notify(new TypeError('PRIVATE_UNHANDLED_FAILURE'), { operation: 'browser.unhandled' }); });
    assert.equal(reports.length, 2);
    assert.ok(document.querySelector('[role="alert"]')!.textContent.includes(SAFE_ERROR_MESSAGE));
    assert.doesNotMatch(document.body.innerHTML, /PRIVATE_UNHANDLED_FAILURE/);
    await act(async () => { document.querySelector('button')!.click(); });
    assert.equal(document.querySelector('[role="alert"]'), null);
  } finally {
    await act(async () => root.unmount());
    uninstall(); browserErrors.dismiss();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
