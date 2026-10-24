import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary, GlobalErrorNotice } from './features/errors/ErrorBoundary';
import { browserErrors, renderFatalMessage } from './features/errors/reporting';

browserErrors.install(window);
const container = document.getElementById('root')!;
createRoot(container, {
  onCaughtError: error => { browserErrors.capture(error, { operation: 'browser.render' }); },
  onRecoverableError: error => { browserErrors.capture(error, { operation: 'browser.recoverable' }); },
  onUncaughtError: error => { renderFatalMessage(container, browserErrors.capture(error, { operation: 'browser.render' })); },
}).render(<ErrorBoundary><App /><GlobalErrorNotice /></ErrorBoundary>);
