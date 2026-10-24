import { z } from '../input/zod.ts';
import { CircuitOpenError, DependencyHttpError, InvalidDependencyResponseError } from '../http/circuitBreaker.ts';
import { weatherKeys } from '../weather/types.ts';

export const SAFE_ERROR_MESSAGE = 'Something went wrong. Please try again.';
export const reportPolicy = Object.freeze({ windowMs: 60_000, browserEvents: 10, serverEvents: 100, maxBytes: 8192, bodyTimeoutMs: 3000 });
export const errorOperations = [
  'browser.render', 'browser.error', 'browser.unhandled', 'browser.recoverable',
  'arrivals.fetch', 'incidents.fetch', 'weather.fetch', 'route.fetch', 'search.fetch',
  'server.request_failed', 'server.listen_failed', 'server.close_failed', 'server.start_failed',
  'lta.routes_request_failed', 'lta.arrivals_request_failed', 'lta.incidents_request_failed', 'nea.dataset_refresh_failed',
] as const;
export const errorRoutes = ['/api/bus-arrival', '/api/bus-route', '/api/weather', '/api/traffic-incidents', '/api/health', '/api/client-errors', 'other'] as const;
export const errorFiles = [
  'api/bus-arrival.ts', 'api/bus-route.ts', 'api/weather.ts', 'api/traffic-incidents.ts', 'api/health.ts', 'api/client-errors.ts',
  'server/lta/client.ts', 'server/lta/arrivals.ts', 'server/lta/incidents.ts', 'server/lta/datasets.ts', 'server/weather/service.ts',
  'security/http-errors.ts', 'server/errors/reporting.ts', 'src/main.tsx', 'src/App.tsx',
  'src/features/incidents/client.ts', 'src/features/arrivals/client.ts', 'src/features/weather/client.ts',
  'src/features/places/data/oneMapClient.ts', 'src/features/tracking/routeRepository.ts',
  'assets/app.js', 'assets/map.js', 'assets/react.js', 'assets/runtime.js',
] as const;
const contextSchema = z.strictObject({
  operation: z.enum(errorOperations), route: z.enum(errorRoutes).optional(),
  method: z.enum(['GET', 'HEAD', 'POST', 'OPTIONS', 'OTHER']).optional(),
  requestId: z.uuid().optional(),
  dataset: z.enum(weatherKeys).optional(),
});
export type ErrorContext = z.infer<typeof contextSchema>;
export const exceptionKinds = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TimeoutError', 'AbortError', 'CircuitOpenError', 'DependencyHttpError', 'InvalidDependencyResponseError', 'UnknownError'] as const;
export const errorEventSchema = z.strictObject({
  version: z.literal(1), eventId: z.uuid(), source: z.enum(['browser', 'server']),
  timestamp: z.iso.datetime(), environment: z.enum(['development', 'preview', 'production', 'test']),
  release: z.string().regex(/^(?:[a-f0-9]{7,40}|local)$/), context: contextSchema,
  exception: z.strictObject({ type: z.enum(exceptionKinds), httpStatus: z.number().int().min(100).max(599).optional(),
    frames: z.array(z.strictObject({ file: z.enum(errorFiles), line: z.number().int().min(1).max(10_000_000), column: z.number().int().min(1).max(10_000_000) })).max(8) }),
});
export type ErrorEvent = z.infer<typeof errorEventSchema>;
export type ErrorSettings = Pick<ErrorEvent, 'source' | 'environment' | 'release'> & { enabled: boolean };

// Only fixed file labels and numeric positions survive. No raw message, function name, URL or path.
function exception(error: unknown): ErrorEvent['exception'] {
  let type: ErrorEvent['exception']['type'] = 'UnknownError', stack = '';
  let httpStatus: number | undefined;
  try {
    if (error instanceof Error) {
      const name = error.name;
      if ((exceptionKinds as readonly string[]).includes(name)) type = name as typeof type;
      if (typeof error.stack === 'string') stack = error.stack.slice(0, 16_384);
      if (error instanceof DependencyHttpError && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599) httpStatus = error.status;
      if (error instanceof CircuitOpenError) type = 'CircuitOpenError';
      if (error instanceof InvalidDependencyResponseError) type = 'InvalidDependencyResponseError';
    }
  } catch { /* Hostile thrown objects/getters never break the reporting path. */ }
  const frames: ErrorEvent['exception']['frames'] = [];
  for (const row of stack.split('\n').slice(1, 32)) {
    const match = row.match(/(?:\(|@|\s)((?:file:\/\/\/|https?:\/\/|\/)[^\s)]+):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const path = match[1].split(/[?#]/)[0];
    let file = errorFiles.find(file => path.endsWith('/' + file) || path.endsWith('/' + file.replace(/\.tsx?$/, '.js')));
    if (!file && /\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(path)) file = 'assets/app.js';
    if (!file && /\/assets\/LiveBusMap-[A-Za-z0-9_-]+\.js$/.test(path)) file = 'assets/map.js';
    if (!file && /\/assets\/react-[A-Za-z0-9_-]+\.js$/.test(path)) file = 'assets/react.js';
    if (!file && /\/assets\/rolldown-runtime-[A-Za-z0-9_-]+\.js$/.test(path)) file = 'assets/runtime.js';
    const line = Number(match[2]), column = Number(match[3]);
    if (file && line > 0 && line <= 10_000_000 && column > 0 && column <= 10_000_000) frames.push({ file, line, column });
    if (frames.length === 8) break;
  }
  return { type, ...(httpStatus ? { httpStatus } : {}), frames };
}

export function createErrorReporter(settings: ErrorSettings, sink: (event: ErrorEvent) => void, dependencies: { now?: () => number; id?: () => string } = {}) {
  const now = dependencies.now ?? Date.now, id = dependencies.id ?? (() => crypto.randomUUID());
  const seen = new WeakMap<object, { id: string; time: number }>();
  const groups = new Map<string, string>();
  let started = -Infinity, count = 0;
  return { capture(error: unknown, input: ErrorContext): string | null {
    try {
      if (error instanceof Error && error.name === 'AbortError') return null;
      const context = contextSchema.parse(input), detail = exception(error), time = now();
      if (!settings.enabled) return null;
      const previous = typeof error === 'object' && error !== null ? seen.get(error) : undefined;
      if (previous && time >= previous.time && time - previous.time < reportPolicy.windowMs) return previous.id;
      if (time < started || time - started >= reportPolicy.windowMs) { started = time; count = 0; groups.clear(); }
      const key = JSON.stringify([context.operation, context.route, context.dataset, detail]);
      if (groups.has(key)) return groups.get(key)!;
      const eventId = id();
      if (count >= (settings.source === 'browser' ? reportPolicy.browserEvents : reportPolicy.serverEvents)) return null;
      const event = errorEventSchema.parse({ version: 1, eventId, source: settings.source, environment: settings.environment, release: settings.release, timestamp: new Date(time).toISOString(), context, exception: detail });
      count++; groups.set(key, eventId);
      if (typeof error === 'object' && error !== null) seen.set(error, { id: eventId, time });
      try { sink(event); } catch { /* Reporting cannot replace the application failure or recurse. */ }
      return eventId;
    } catch { return null; }
  } };
}
