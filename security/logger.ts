// Server and data scripts only. Client code must never import this module or config/server.ts.
import { config } from '../config/server.ts';
import { createLogger } from './redact.ts';
import { trackedLog } from '../server/errors/reporting.ts';

const base = createLogger([config.lta.accountKey, config.weather.apiKey]);
export const logger = { info: base.info,
  warn: (event: string, details?: Record<string, unknown>) => trackedLog('warn', event, details),
  error: (event: string, details?: Record<string, unknown>) => trackedLog('error', event, details),
};
