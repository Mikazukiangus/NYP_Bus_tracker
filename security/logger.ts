// Server and data scripts only. Client code must never import this module or config/server.ts.
import { appLogger } from './logging.ts';
import { trackedLog } from '../server/errors/reporting.ts';

export const logger = { info: appLogger.info,
  warn: (event: string, details?: Record<string, unknown>) => trackedLog('warn', event, details),
  error: (event: string, details?: Record<string, unknown>) => trackedLog('error', event, details),
};
