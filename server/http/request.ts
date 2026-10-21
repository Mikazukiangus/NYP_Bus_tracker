import { z } from '../../shared/input/zod.ts';
import { serviceNoSchema, stopCodeSchema } from '../../shared/input/primitives.ts';

const optionalService = z.union([serviceNoSchema, z.literal('')]).optional().transform(value => value || undefined);
export const arrivalQuerySchema = z.strictObject({ BusStopCode: stopCodeSchema, ServiceNo: optionalService });
export const routeQuerySchema = z.strictObject({ ServiceNo: serviceNoSchema });
export const emptyQuerySchema = z.strictObject({});
const aliases: Record<string, string> = { BusStopCode: 'BusStopCode', busStopCode: 'BusStopCode', ServiceNo: 'ServiceNo', serviceNo: 'ServiceNo' };

type RequestInput = { method?: unknown; url?: unknown; query?: unknown; body?: unknown; headers?: Record<string, unknown> };
type ResponseOutput = { setHeader?: (key: string, value: string) => unknown; status?: (code: number) => any; json?: (body: unknown) => unknown; writeHead?: (status: number, headers: Record<string, string>) => unknown; end?: (body: string) => unknown };
function reject(res: ResponseOutput, status: number, paths: string | string[]) {
  const body = { error: status === 405 ? 'Method not allowed.' : 'Invalid request.', issues: [...new Set(typeof paths === 'string' ? [paths] : paths)].slice(0, 8).map(path => ({ path, message: 'Invalid or unsupported input.' })) };
  res.setHeader?.('Cache-Control', 'no-store');
  if (status === 405) res.setHeader?.('Allow', 'GET, HEAD');
  if (res.status && res.json) res.status(status).json(body);
  else if (res.writeHead && res.end) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(status === 405 ? { Allow: 'GET, HEAD' } : {}) });
    res.end(JSON.stringify(body));
  }
}
function canonicalQuery(entries: [string, unknown][]): Record<string, unknown> | null {
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of entries) {
    const canonical = Object.hasOwn(aliases, key) ? aliases[key] : key;
    if (Object.hasOwn(result, canonical)) return null; // Includes repeated raw keys and conflicting aliases.
    result[canonical] = value;
  }
  return result;
}

// Every public handler calls this before cache/provider/domain work. No Host-derived URL parsing.
export function validateReadRequest<T>(req: RequestInput, res: ResponseOutput, schema: z.ZodType<T>): T | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') { reject(res, 405, 'method'); return null; }
  if (req.headers !== undefined && (!req.headers || typeof req.headers !== 'object' || Array.isArray(req.headers))) { reject(res, 400, 'headers'); return null; }
  const headers: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    const normalized = key.toLowerCase();
    if ((normalized === 'content-length' || normalized === 'transfer-encoding') && Object.hasOwn(headers, normalized)) { reject(res, 400, 'body'); return null; }
    headers[normalized] = value;
  }
  const length = headers['content-length'];
  const bodyPresent = req.body !== undefined && req.body !== null && req.body !== '' &&
    !(typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length === 0);
  if (bodyPresent || headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0')) {
    reject(res, 400, 'body'); return null;
  }
  if (req.url !== undefined && (typeof req.url !== 'string' || req.url.length > 2048)) { reject(res, 400, 'query'); return null; }
  let raw: Record<string, unknown> | null;
  try { raw = canonicalQuery([...new URL((req.url as string | undefined) ?? '/', 'https://request.invalid').searchParams.entries()]); }
  catch { reject(res, 400, 'query'); return null; }
  if (!raw) { reject(res, 400, 'query'); return null; }
  const parsedQuery = req.query;
  if (parsedQuery !== undefined && (!parsedQuery || typeof parsedQuery !== 'object' || Array.isArray(parsedQuery))) { reject(res, 400, 'query'); return null; }
  const adapted = parsedQuery === undefined ? {} : canonicalQuery(Object.entries(parsedQuery));
  if (!adapted) { reject(res, 400, 'query'); return null; }
  const hasRaw = Object.keys(raw).length > 0, hasAdapted = Object.keys(adapted).length > 0;
  const parsed = schema.safeParse(hasRaw ? raw : adapted);
  // Adapters must not hide array/nested values or disagree with the raw request target.
  const secondary = hasRaw && hasAdapted ? schema.safeParse(adapted) : null;
  if (!parsed.success || secondary && (!secondary.success || JSON.stringify(secondary.data) !== JSON.stringify(parsed.data))) {
    const issues = !parsed.success ? parsed.error.issues : secondary && !secondary.success ? secondary.error.issues : [];
    const paths = issues.map(issue => ['BusStopCode', 'ServiceNo'].includes(String(issue.path[0])) ? `query.${String(issue.path[0])}` : 'query');
    reject(res, 400, paths.length ? paths : 'query'); return null;
  }
  return parsed.data;
}
