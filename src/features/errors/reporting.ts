import { config, apiUrl } from '../../config';
import { createErrorReporter, reportPolicy, SAFE_ERROR_MESSAGE, type ErrorContext, type ErrorEvent } from '../../../shared/errors/events';

export function createBrowserErrorTracking(request: typeof fetch = (...args) => fetch(...args)) {
  let installed = false, running = false;
  const queue: ErrorEvent[] = [];
  const listeners = new Set<() => void>();
  let notice: { errorId: string | null } | null = null;
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (installed && queue.length) {
        const event = queue.shift()!;
        try {
          const res = await request(apiUrl('/api/client-errors'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event),
            signal: AbortSignal.timeout(config.errors.timeoutMs), credentials: 'omit', cache: 'no-store',
            redirect: 'error', referrerPolicy: 'no-referrer', keepalive: true,
          });
          await res.body?.cancel().catch(() => {});
        } catch { /* Single attempt; never recursively report telemetry/network failures. */ }
      }
    } finally { running = false; }
  }
  const reporter = createErrorReporter({ source: 'browser', ...config.errors }, event => {
    if (!installed || queue.length >= reportPolicy.browserEvents) return;
    queue.push(event); void drain();
  });
  const publish = (errorId: string | null) => { notice = { errorId }; for (const listener of listeners) listener(); };
  let cleanup: (() => void) | undefined;
  return {
    capture: reporter.capture,
    notify(error: unknown, context: ErrorContext) { const id = reporter.capture(error, context); publish(id); return id; },
    getNotice: () => notice,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dismiss() { notice = null; for (const listener of listeners) listener(); },
    install(target: Window) {
      if (cleanup) return cleanup;
      installed = true;
      const onError = (event: globalThis.ErrorEvent) => {
        if (!event.error) return; // Resource errors already have feature-specific fallbacks.
        publish(reporter.capture(event.error, { operation: 'browser.error' })); event.preventDefault();
      };
      const onRejection = (event: PromiseRejectionEvent) => {
        try { if (event.reason instanceof Error && event.reason.name === 'AbortError') return; } catch { /* Safe unknown failure. */ }
        publish(reporter.capture(event.reason, { operation: 'browser.unhandled' })); event.preventDefault();
      };
      target.addEventListener('error', onError); target.addEventListener('unhandledrejection', onRejection);
      cleanup = () => {
        target.removeEventListener('error', onError); target.removeEventListener('unhandledrejection', onRejection);
        installed = false; queue.length = 0; cleanup = undefined;
      };
      return cleanup;
    },
  };
}
export const browserErrors = createBrowserErrorTracking();
export { SAFE_ERROR_MESSAGE };

export function renderFatalMessage(container: HTMLElement | null, errorId: string | null) {
  if (!container) return;
  const document = container.ownerDocument, panel = document.createElement('main');
  panel.setAttribute('role', 'alert');
  const message = document.createElement('p'); message.textContent = SAFE_ERROR_MESSAGE; panel.append(message);
  if (errorId) { const reference = document.createElement('p'); reference.textContent = `Reference: ${errorId}`; panel.append(reference); }
  const button = document.createElement('button'); button.textContent = 'Reload app'; button.onclick = () => window.location.reload(); panel.append(button);
  container.replaceChildren(panel);
}
