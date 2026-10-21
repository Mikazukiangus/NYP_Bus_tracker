import type { AppConfig } from '../../config/schema.ts';

export type CorsPolicy = Pick<AppConfig['security'], 'appOrigin' | 'corsAllowedOrigins'>;
export type CorsResponse = {
  getHeader?: (name: string) => unknown;
  setHeader?: (name: string, value: string) => unknown;
  status?: (status: number) => any;
  writeHead?: (status: number, headers: Record<string, string>) => unknown;
  end?: (body: string) => unknown;
};
const methods = ['GET', 'HEAD'];
const allowedHeaders = new Set(['accept', 'content-type', 'cache-control', 'pragma']);

function vary(res: CorsResponse, names: string[]) {
  const previous = res.getHeader?.('Vary');
  const tokens = (Array.isArray(previous) ? previous.join(',') : String(previous ?? '')).split(',').map(value => value.trim()).filter(Boolean);
  if (tokens.includes('*')) return;
  for (const name of names) if (!tokens.some(token => token.toLowerCase() === name.toLowerCase())) tokens.push(name);
  res.setHeader?.('Vary', tokens.join(', '));
}

// Runs in each handler, so Express and Vercel use one policy. Never infer trust from Host.
export function prepareCors(method: unknown, headers: Record<string, unknown>, res: CorsResponse, policy: CorsPolicy,
  reject: (status: 400 | 403, path: string) => void): false | { preflight: boolean } {
  vary(res, ['Origin', ...(method === 'OPTIONS' ? ['Access-Control-Request-Method', 'Access-Control-Request-Headers'] : [])]);
  const origin = headers.origin;
  const requestedMethod = headers['access-control-request-method'];
  const requestedHeaders = headers['access-control-request-headers'];
  const privateNetwork = headers['access-control-request-private-network'];
  if (origin === undefined) {
    if (requestedMethod !== undefined || requestedHeaders !== undefined || privateNetwork !== undefined) { reject(400, 'cors'); return false; }
    return { preflight: false };
  }
  if (typeof origin !== 'string' || origin.length > 2048) { reject(400, 'origin'); return false; }
  // Browser Origin is a single serialized origin, never a URL path, list, null or wildcard.
  let canonical: string;
  try { canonical = new URL(origin).origin; }
  catch { reject(403, 'origin'); return false; }
  if (origin !== canonical || ![policy.appOrigin, ...policy.corsAllowedOrigins].includes(origin)) { reject(403, 'origin'); return false; }
  const preflight = method === 'OPTIONS' && requestedMethod !== undefined;
  if (preflight) {
    if (typeof requestedMethod !== 'string' || !methods.includes(requestedMethod)) { reject(403, 'cors'); return false; }
    if (requestedHeaders !== undefined) {
      if (typeof requestedHeaders !== 'string' || requestedHeaders.length > 1024) { reject(400, 'cors'); return false; }
      const entries = requestedHeaders.split(',').map(value => value.trim().toLowerCase());
      if (!entries.length || entries.length > 16 || entries.some(value => !allowedHeaders.has(value))) { reject(403, 'cors'); return false; }
    }
    if (privateNetwork !== undefined) { reject(403, 'cors'); return false; }
  } else if (requestedMethod !== undefined || requestedHeaders !== undefined || privateNetwork !== undefined) {
    reject(400, 'cors'); return false;
  }
  // Exact allowlist match only. Cookie-authenticated cross-origin reads are not enabled.
  res.setHeader?.('Access-Control-Allow-Origin', origin);
  return { preflight };
}

export function finishPreflight(res: CorsResponse) {
  res.setHeader?.('Cache-Control', 'no-store');
  res.setHeader?.('Access-Control-Allow-Methods', 'GET, HEAD');
  res.setHeader?.('Access-Control-Allow-Headers', 'Accept, Content-Type, Cache-Control, Pragma');
  res.setHeader?.('Access-Control-Max-Age', '300');
  if (res.status) res.status(204);
  else res.writeHead?.(204, { 'Cache-Control': 'no-store' });
  res.end?.('');
}
