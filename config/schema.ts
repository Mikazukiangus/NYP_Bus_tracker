// Single validated config object for server/build; public settings are an explicit allowlist.
import { isIP } from 'node:net';
import { field, integer, boolean, text, url, ms, seconds, parseUrl, resolve, isField, ConfigError, requireHttpsEndpoints, type Schema, type Values, type Environment } from './validation.ts';
import { publicSchema, assertHttpsPublicUrls } from './public.ts';
import { DEFAULT_READ_RETRY_POLICY } from '../shared/http/readRetry.ts';
import { circuitSchema } from './circuit.ts';
import { errorEnvironment } from './observability.ts';
export { createPublicConfig, type PublicConfig } from './public.ts';
export { ConfigError, type Environment } from './validation.ts';

export const configSchema = {
  server: {
    nodeEnv: field('NODE_ENV', 'development' as 'development' | 'production' | 'test', 'Runtime mode; normally set by Node/Vite. Leave unset in .env.', (raw) => {
      if (!['development', 'production', 'test'].includes(raw)) throw new Error('must be development, production or test');
      return raw as 'development' | 'production' | 'test';
    }),
    port: integer('PORT', 3000, 1, 65535, 'Local HTTP server port.'),
    host: field('HOST', '0.0.0.0', 'Local HTTP bind address or hostname.', (raw) => {
      if (!/^[a-zA-Z0-9.:_-]+$/.test(raw)) throw new Error('must be a hostname or IP address');
      return raw;
    }),
    disableHmr: boolean('DISABLE_HMR', false, 'Disable Vite hot reload and file watching.'),
    vercel: boolean('VERCEL', false, 'Platform metadata, automatically set to 1 by Vercel; leave unset locally.'),
  },
  security: {
    appOrigin: field('APP_ORIGIN', 'https://nypbus-tracker.vercel.app', 'Public HTTPS origin for standalone-server redirects; no path, query or credentials. Vercel redirects HTTP at its edge.', (raw) => {
      const parsed = new URL(parseUrl(raw));
      if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || /[*?#@]/.test(raw)) throw new Error('must be an HTTPS origin without a path');
      return parsed.origin;
    }),
    corsAllowedOrigins: field('CORS_ALLOWED_ORIGINS', [] as readonly string[], 'SERVER ONLY. Additional frontend origins allowed to read APIs, comma-separated; APP_ORIGIN is always allowed. Blank allows only APP_ORIGIN. No wildcards, paths, credentials, queries or fragments; HTTP loopback only in development.', (raw) => {
      const entries = raw.split(',').map(value => value.trim());
      if (entries.length > 20 || entries.some(value => !value || /[\s*]/.test(value))) throw new Error('must contain 1–20 exact HTTP(S) origins');
      return [...new Set(entries.map(value => {
        const parsed = new URL(parseUrl(value));
        if (parsed.pathname !== '/' || /[?#@]/.test(value)) throw new Error('must contain origins without paths, credentials, query or fragment');
        return parsed.origin;
      }))];
    }),
    trustedProxyCidrs: field('TRUST_PROXY_CIDRS', ['loopback'] as readonly string[], 'Standalone server: comma-separated trusted proxy IPs/CIDRs, loopback, or none. Only trust proxies that strip/overwrite forwarded headers.', (raw) => {
      if (raw === 'none') return [];
      const entries = raw.split(',').map(s => s.trim());
      for (const entry of entries) {
        if (entry === 'loopback') continue;
        const [ip, mask, extra] = entry.split('/');
        const version = isIP(ip);
        if (!version || extra !== undefined || (mask !== undefined && (!/^\d+$/.test(mask) || Number(mask) < 1 || Number(mask) > (version === 4 ? 32 : 128)))) {
          throw new Error('must contain explicit proxy IPs/CIDRs, loopback, or none');
        }
      }
      return [...new Set(entries)];
    }),
  },
  outbound: {
    timeoutMs: ms('OUTBOUND_TIMEOUT_MS', 30000, 'Server guarded fetch default total timeout, including response body; combines with caller cancellation.', 1000, 1500000),
    connectTimeoutMs: ms('OUTBOUND_CONNECT_TIMEOUT_MS', 10000, 'Server guarded fetch connection timeout.', 1000, 120000),
    retry: {
      attempts: integer('OUTBOUND_READ_ATTEMPTS', DEFAULT_READ_RETRY_POLICY.attempts, 1, 3, 'Server live LTA read attempts including the first; health and NEA budgeted refreshes stay single-attempt.'),
      baseDelayMs: ms('OUTBOUND_RETRY_BASE_MS', DEFAULT_READ_RETRY_POLICY.baseDelayMs, 'Initial exponential retry ceiling, with equal jitter.', 0, 10000),
      maxDelayMs: ms('OUTBOUND_RETRY_MAX_MS', DEFAULT_READ_RETRY_POLICY.maxDelayMs, 'Maximum backoff/Retry-After wait. Longer provider delays skip immediate retry.', 0, 30000),
    },
  },
  lta: {
    circuit: circuitSchema('LTA_CIRCUIT', 'SERVER ONLY. Separate breakers for live arrivals, incidents and each dataset collection.'),
    accountKey: text('LTA_ACCOUNT_KEY', '', 'SERVER SECRET. Required for live LTA data. Blank keeps the existing degraded/offline behaviour. Get a key at https://datamall.lta.gov.sg/.'),
    baseUrl: url('LTA_API_BASE_URL', 'https://datamall2.mytransport.sg/ltaodataservice', 'LTA API base; paths such as /v3/BusArrival are added by the app.'),
    timeoutMs: ms('LTA_REQUEST_TIMEOUT_MS', 8000, 'BusArrival and TrafficIncidents request timeout.'),
    pageTimeoutMs: ms('LTA_PAGE_TIMEOUT_MS', 15000, 'Total timeout for one LTA route/stop dataset page, including retries, backoff and body reading.'),
    pageConcurrency: integer('LTA_PAGE_CONCURRENCY', 8, 1, 8, 'Concurrent pages per dataset (three datasets load together).'),
    pageAttempts: integer('LTA_PAGE_ATTEMPTS', 3, 1, 5, 'Attempts for transient page errors.'),
    retryDelayMs: ms('LTA_PAGE_RETRY_DELAY_MS', 500, 'Initial page retry ceiling, doubled after each retry with equal jitter.', 0, 10000),
    retryMaxMs: ms('LTA_PAGE_RETRY_MAX_MS', 10000, 'Maximum page backoff/Retry-After wait within the total page timeout.', 0, 30000),
    datasetTtlMs: ms('LTA_DATASET_TTL_MS', 43200000, 'Warm-instance route dataset lifetime.', 60000, 604800000),
    cache: {
      arrivalsSeconds: seconds('LTA_ARRIVALS_CACHE_SECONDS', 15, 'CDN arrival freshness.', 0, 60),
      arrivalsStaleSeconds: seconds('LTA_ARRIVALS_STALE_SECONDS', 30, 'CDN arrival stale-while-revalidate.', 0, 120),
      routesSeconds: seconds('LTA_ROUTES_CACHE_SECONDS', 86400, 'CDN route freshness.'),
      routesStaleSeconds: seconds('LTA_ROUTES_STALE_SECONDS', 604800, 'CDN route stale-while-revalidate.'),
      notFoundSeconds: seconds('LTA_NOT_FOUND_CACHE_SECONDS', 3600, 'CDN lifetime of unknown service responses.'),
      incidentsSeconds: seconds('LTA_INCIDENTS_CACHE_SECONDS', 120, 'Warm-instance and total CDN incident freshness; edge max-age subtracts provider snapshot age.', 0, 3600),
      incidentsStaleSeconds: seconds('LTA_INCIDENTS_STALE_SECONDS', 300, 'CDN incident stale-while-revalidate.', 0, 3600),
    },
  },
  health: {
    stopCode: field('HEALTH_BUS_STOP_CODE', '55329', 'Five-digit LTA stop used by the health probe.', (raw) => {
      if (!/^\d{5}$/.test(raw)) throw new Error('must be a five-digit stop code');
      return raw;
    }),
    timeoutMs: ms('HEALTH_TIMEOUT_MS', 5000, 'Timeout for each upstream health probe.'),
  },
  weather: {
    circuit: circuitSchema('NEA_CIRCUIT', 'SERVER ONLY. Separate breaker per weather dataset; cached readings remain available.'),
    apiKey: text('DATA_GOV_SG_API_KEY', '', 'SERVER SECRET. Optional data.gov.sg API key. Blank uses keyless access.'),
    timeoutMs: ms('NEA_REQUEST_TIMEOUT_MS', 6000, 'Timeout for each NEA dataset request.'),
    rateWindowMs: ms('NEA_RATE_WINDOW_MS', 10500, 'Per-instance rate-limit window.', 10000, 60000),
    keylessBudget: integer('NEA_KEYLESS_BUDGET', 5, 1, 6, 'Maximum keyless calls per window. Default leaves headroom.'),
    keyedBudget: integer('NEA_KEYED_BUDGET', 10, 1, 12, 'Maximum API-key calls per window. Default leaves headroom.'),
    observationTtlMs: ms('NEA_OBSERVATION_TTL_MS', 120000, 'Temperature/rainfall/humidity/lightning/wind cache lifetime.', 60000, 3600000),
    summaryTtlMs: ms('NEA_SUMMARY_TTL_MS', 600000, 'PSI/PM2.5/UV/WBGT and 2-hour forecast cache lifetime.', 60000, 3600000),
    forecast24hTtlMs: ms('NEA_FORECAST_24H_TTL_MS', 1800000, '24-hour forecast cache lifetime.', 60000, 86400000),
    outlookTtlMs: ms('NEA_OUTLOOK_TTL_MS', 3600000, '4-day forecast cache lifetime.', 60000, 86400000),
    cacheSeconds: seconds('NEA_CACHE_SECONDS', 60, 'Complete weather snapshot CDN freshness.', 0, 3600),
    staleSeconds: seconds('NEA_STALE_SECONDS', 300, 'Complete weather snapshot stale-while-revalidate.', 0, 3600),
    incompleteCacheSeconds: seconds('NEA_INCOMPLETE_CACHE_SECONDS', 5, 'Incomplete weather snapshot CDN freshness.', 0, 60),
  },
  shapes: {
    instances: field('OVERPASS_URLS', [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ] as readonly string[], 'Comma-separated Overpass endpoints, tried in order by npm run shapes.', (raw) => {
      const urls = raw.split(',').map((part) => parseUrl(part.trim()));
      if (urls.length > 10) throw new Error('must contain 1–10 URLs');
      return [...new Set(urls)];
    }),
    rounds: integer('OVERPASS_ROUNDS', 3, 1, 5, 'Rounds through the Overpass endpoint list.'),
    retryPauseMs: ms('OVERPASS_RETRY_PAUSE_MS', 60000, 'Initial inter-round retry ceiling, doubled with equal jitter; capped at 300 seconds.', 0, 300000),
    deadlineMs: ms('OVERPASS_DEADLINE_MS', 1500000, 'Overall rebuild request/retry deadline; stays inside the 30-minute workflow.', 30000, 1500000),
    timeoutMs: ms('OVERPASS_REQUEST_TIMEOUT_MS', 330000, 'Timeout for one Overpass HTTP request.', 1000, 1500000),
    queryTimeoutSeconds: seconds('OVERPASS_QUERY_TIMEOUT_SECONDS', 300, 'Overpass query execution limit.', 1, 1200),
    userAgent: text('OVERPASS_USER_AGENT', 'BusTrackerSG/1.0 (https://nypbus-tracker.vercel.app)', 'User-Agent identifying the route rebuild script.'),
  },
  public: publicSchema,
} as const satisfies Schema;

export type AppConfig = Values<typeof configSchema>;

export function createConfig(env: Environment = {}, options: { requireHttps?: boolean } = {}): AppConfig {
  const result = resolve(configSchema, errorEnvironment(env));
  if (result.outbound.retry.baseDelayMs > result.outbound.retry.maxDelayMs || result.lta.retryDelayMs > result.lta.retryMaxMs) {
    throw new ConfigError(['OUTBOUND_RETRY_BASE_MS <= OUTBOUND_RETRY_MAX_MS and LTA_PAGE_RETRY_DELAY_MS <= LTA_PAGE_RETRY_MAX_MS are required']);
  }
  if (result.public.retry.baseDelayMs > result.public.retry.maxDelayMs) throw new ConfigError(['VITE_RETRY_BASE_MS must not exceed VITE_RETRY_MAX_MS']);
  if (options.requireHttps || result.server.nodeEnv === 'production' || result.server.vercel) {
    assertHttpsPublicUrls(result.public);
    requireHttpsEndpoints({ CORS_ALLOWED_ORIGINS: result.security.corsAllowedOrigins, LTA_API_BASE_URL: result.lta.baseUrl, OVERPASS_URLS: result.shapes.instances });
  }
  if (result.public.polling.weatherRetryMs <= result.weather.rateWindowMs) {
    throw new ConfigError(['VITE_WEATHER_RETRY_MS must exceed NEA_RATE_WINDOW_MS']);
  }
  if (result.shapes.queryTimeoutSeconds * 1000 >= result.shapes.timeoutMs || result.shapes.timeoutMs > result.shapes.deadlineMs) {
    throw new ConfigError(['OVERPASS_QUERY_TIMEOUT_SECONDS < OVERPASS_REQUEST_TIMEOUT_MS / 1000 <= OVERPASS_DEADLINE_MS / 1000 is required']);
  }
  return result;
}

// Generate .env.example from the same schema, so new settings cannot be omitted or acquire different defaults.
export function envExample(): string {
  const lines = [
    '# BusTrackerSG configuration — generated by npm run config:example.',
    '# Copy to .env or .env.local. No real credentials belong in this file.',
    '# Blank values use defaults. Only LTA_ACCOUNT_KEY is needed for live bus data.',
    '# VITE_* is public and baked into the browser build. Never prefix a secret with VITE_.',
    '# Restart dev after edits; rebuild/redeploy for public changes. Units and bounds are below.',
  ];
  function visit(schema: Schema, path = '') {
    for (const [key, entry] of Object.entries(schema)) {
      if (!isField(entry)) { lines.push('', `# ${path}${key}`); visit(entry, `${path}${key}.`); continue; }
      lines.push(`# ${entry.description}`);
      const value = Array.isArray(entry.defaultValue) ? entry.defaultValue.join(',') : String(entry.defaultValue);
      const line = `${entry.env}=${JSON.stringify(value)}`;
      lines.push(['NODE_ENV', 'VERCEL'].includes(entry.env) ? `# ${line}` : line);
    }
  }
  visit(configSchema);
  lines.push('', '# CI-only secret, used by .github/workflows/refresh-data.yml, not by the app:',
    '# VERCEL_DEPLOY_HOOK_URL=""  # Set in GitHub Actions secrets; do not expose in the browser.', '');
  return lines.join('\n');
}

export const cdnCache = (seconds: number, staleSeconds = 0) =>
  `public, s-maxage=${seconds}${staleSeconds ? `, stale-while-revalidate=${staleSeconds}` : ''}`;
