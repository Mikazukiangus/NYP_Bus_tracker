// Server and data scripts only. Client code must never import this module or config/server.ts.
import { config } from '../config/server.ts';
import { createLogger } from './redact.ts';

export const logger = createLogger([config.lta.accountKey, config.weather.apiKey]);
