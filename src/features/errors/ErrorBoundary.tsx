import { Component, useSyncExternalStore, type ReactNode } from 'react';
import { browserErrors, SAFE_ERROR_MESSAGE } from './reporting';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; errorId: string | null }> {
  state = { failed: false, errorId: null as string | null };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.setState({ errorId: browserErrors.capture(error, { operation: 'browser.render' }) }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" className="min-h-screen bg-warm-50 text-helvetia-950 flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
        <h1 className="font-bold text-xl">We couldn’t load this view</h1>
        <p className="mt-3">{SAFE_ERROR_MESSAGE}</p>
        {this.state.errorId && <p className="mt-3 text-sm break-all">Reference: {this.state.errorId}</p>}
        <button type="button" className="mt-5 rounded-xl bg-lemon px-4 py-2 font-bold" onClick={() => window.location.reload()}>Reload app</button>
      </div>
    </main>;
  }
}

export function GlobalErrorNotice() {
  const notice = useSyncExternalStore(browserErrors.subscribe, browserErrors.getNotice, () => null);
  if (!notice) return null;
  return <aside role="alert" className="fixed top-4 right-4 left-4 sm:left-auto z-[10000] max-w-lg rounded-xl bg-warm-50 border border-warm-300 p-4 text-helvetia-950 shadow-lg">
    <p>{SAFE_ERROR_MESSAGE}</p>
    {notice.errorId && <p className="mt-2 text-xs break-all">Reference: {notice.errorId}</p>}
    <button type="button" onClick={browserErrors.dismiss} className="mt-2 font-bold underline">Dismiss</button>
  </aside>;
}
