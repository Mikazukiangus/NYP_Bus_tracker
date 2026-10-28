import { config } from '../config/server.ts';
import { createLogger } from './redact.ts';
import { currentLogContext } from './log-context.ts';

// Shared runtime/build sink. No request objects, incoming identities or personal fields are copied.
export const appLogger = createLogger([config.lta.accountKey, config.weather.apiKey], undefined, {
  metadata: () => ({ service: 'bustrackersg', environment: config.public.errors.environment, release: config.public.errors.release,
    request: currentLogContext()?.request ?? null, user: currentLogContext()?.user ?? null }),
});
