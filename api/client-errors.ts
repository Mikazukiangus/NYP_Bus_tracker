import { config } from '../config/server.ts';
import { appLogger } from '../security/logging.ts';
import { withRequestLogging } from '../server/http/logging.ts';
import { createClientErrorHandler } from '../server/errors/ingest.ts';

// Deliberately not a business write or cookie-authenticated API. Payload is strict, bounded and untrusted.
export default withRequestLogging(createClientErrorHandler(config, event => appLogger.error('errors.client_exception', {
  ...event, trusted: false, collectorEnvironment: config.public.errors.environment, collectorRelease: config.public.errors.release,
})), '/api/client-errors');
