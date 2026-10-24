import { config } from '../config/server.ts';
import { createLogger } from '../security/redact.ts';
import { createClientErrorHandler } from '../server/errors/ingest.ts';

// Deliberately not a business write or cookie-authenticated API. Payload is strict, bounded and untrusted.
const output = createLogger([config.lta.accountKey, config.weather.apiKey]);
export default createClientErrorHandler(config, event => output.error('errors.client_exception', {
  ...event, trusted: false, collectorEnvironment: config.public.errors.environment, collectorRelease: config.public.errors.release,
}));
