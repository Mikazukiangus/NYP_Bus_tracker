// The explicit browser allowlist; included as config.public in the full server config.
import { url, optionalBase, ms, seconds, integer, resolve, requireHttpsEndpoints, ConfigError, type Schema, type Values, type Environment } from './validation.ts';
import { DEFAULT_READ_RETRY_POLICY } from '../shared/http/readRetry.ts';

export const publicSchema = {
  retry: {
    attempts: integer('VITE_READ_ATTEMPTS', DEFAULT_READ_RETRY_POLICY.attempts, 1, 3, 'PUBLIC. Static data and OneMap search attempts including the first; API polling/direct NEA/images do not add nested retries.'),
    baseDelayMs: ms('VITE_RETRY_BASE_MS', DEFAULT_READ_RETRY_POLICY.baseDelayMs, 'PUBLIC. Initial exponential retry ceiling with equal jitter.', 0, 10000),
    maxDelayMs: ms('VITE_RETRY_MAX_MS', DEFAULT_READ_RETRY_POLICY.maxDelayMs, 'PUBLIC. Maximum backoff/Retry-After wait within the existing request deadline.', 0, 30000),
  },
  urls: {
    apiBase: optionalBase('VITE_API_BASE_URL', 'PUBLIC. Optional API origin/path prefix, e.g. https://api.example.com. Blank uses same-origin /api/*.'),
    dataBase: optionalBase('VITE_DATA_BASE_URL', 'PUBLIC. Optional CDN prefix for /bus-routes/* and /route-shapes/*. Blank uses the site origin.'),
    neaBase: url('VITE_NEA_API_BASE_URL', 'https://api-open.data.gov.sg/v2/real-time/api', 'PUBLIC. NEA API base, shared by the server aggregator and keyless browser fallback.'),
    oneMapBase: url('VITE_ONEMAP_BASE_URL', 'https://www.onemap.gov.sg', 'PUBLIC. OneMap origin/prefix for search, map tiles and logo. Attribution remains canonical.'),
  },
  polling: {
    arrivalsSeconds: seconds('VITE_ARRIVALS_REFRESH_SECONDS', 15, 'PUBLIC. Tracked-stop refresh interval.', 5, 300),
    multiStopSeconds: seconds('VITE_MULTI_STOP_REFRESH_SECONDS', 30, 'PUBLIC. Trip and saved-stop refresh interval.', 5, 300),
    incidentsSeconds: seconds('VITE_INCIDENTS_REFRESH_SECONDS', 180, 'PUBLIC. Traffic incident refresh interval.', 30, 3600),
    weatherSeconds: seconds('VITE_WEATHER_REFRESH_SECONDS', 300, 'PUBLIC. Weather refresh interval.', 30, 3600),
    weatherRetryMs: ms('VITE_WEATHER_RETRY_MS', 12000, 'PUBLIC. Delay to fill incomplete weather snapshots.', 10000, 120000),
    weatherRetryAttempts: integer('VITE_WEATHER_RETRY_ATTEMPTS', 3, 0, 10, 'PUBLIC. Retries to fill an incomplete weather snapshot.'),
  },
  cache: {
    routeAssetsSeconds: seconds('VITE_ROUTE_ASSETS_CACHE_SECONDS', 300, 'PUBLIC. Browser route/shape success-cache lifetime; 0 shares pending requests only.', 0, 3600),
  },
  timeouts: {
    arrivalsMs: ms('VITE_ARRIVALS_TIMEOUT_MS', 5000, 'PUBLIC. Arrival request timeout.'),
    requestMs: ms('VITE_REQUEST_TIMEOUT_MS', 10000, 'PUBLIC. Static route/shape, weather and incident timeout.'),
    routeMs: ms('VITE_ROUTE_TIMEOUT_MS', 30000, 'PUBLIC. Cold /api/bus-route timeout.'),
    networkMs: ms('VITE_NETWORK_TIMEOUT_MS', 20000, 'PUBLIC. Bus network download timeout.'),
    externalMs: ms('VITE_EXTERNAL_TIMEOUT_MS', 8000, 'PUBLIC. OneMap and direct NEA fallback timeout.'),
    mapImageMs: ms('VITE_MAP_IMAGE_TIMEOUT_MS', 15000, 'PUBLIC. OneMap tile and attribution logo image timeout.'),
    gpsMs: ms('VITE_GPS_TIMEOUT_MS', 8000, 'PUBLIC. Explicit GPS fix timeout.'),
    startupGpsMs: ms('VITE_STARTUP_GPS_TIMEOUT_MS', 5000, 'PUBLIC. Startup GPS fix timeout.'),
    alarmGpsMs: ms('VITE_ALARM_GPS_TIMEOUT_MS', 20000, 'PUBLIC. Get-off alarm GPS watch timeout.'),
  },
} as const satisfies Schema;

export type PublicConfig = Values<typeof publicSchema>;

export function createPublicConfig(env: Environment = {}): PublicConfig {
  const config = resolve(publicSchema, env);
  if (config.retry.baseDelayMs > config.retry.maxDelayMs) throw new ConfigError(['VITE_RETRY_BASE_MS must not exceed VITE_RETRY_MAX_MS']);
  if (env.NODE_ENV === 'production' || ['1', 'true'].includes(env.VERCEL ?? '')) assertHttpsPublicUrls(config);
  return config;
}

export function assertHttpsPublicUrls(config: PublicConfig) {
  requireHttpsEndpoints(Object.fromEntries(Object.entries(publicSchema.urls).map(([key, field]) => [field.env, config.urls[key as keyof PublicConfig['urls']]])));
}
