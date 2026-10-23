import { integer, ms } from './validation.ts';
import { DEFAULT_CIRCUIT_SETTINGS as defaults } from '../shared/http/circuitBreaker.ts';

export const circuitSchema = (prefix: string, description: string) => ({
  failureThreshold: integer(`${prefix}_FAILURES`, defaults.failureThreshold, 1, 20, `${description} Failed operations to open the breaker; retries count once. A valid success resets failures.`),
  failureWindowMs: ms(`${prefix}_WINDOW_MS`, defaults.failureWindowMs, `${description} Window for consecutive operation failures.`, 1000, 600000),
  openMs: ms(`${prefix}_OPEN_MS`, defaults.openMs, `${description} Open-circuit cooldown before one recovery probe.`, 1000, 300000),
});
