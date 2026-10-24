import { Buffer } from 'node:buffer';
import type { AppConfig } from '../../config/schema.ts';
import { errorEventSchema, reportPolicy, type ErrorEvent } from '../../shared/errors/events.ts';

type Request = { method?: unknown; url?: string; headers?: Record<string, unknown>; body?: unknown;
  on?: (name: string, callback: (...args: any[]) => void) => unknown;
  off?: (name: string, callback: (...args: any[]) => void) => unknown; pause?: () => unknown };
class BodyError extends Error { constructor(readonly status: number) { super('Invalid error report.'); } }
async function readBody(req: Request): Promise<unknown> {
  if (req.body !== undefined) {
    try {
      const text = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
      if (Buffer.byteLength(text) > reportPolicy.maxBytes) throw new BodyError(413);
      return JSON.parse(text);
    } catch (error) { throw error instanceof BodyError ? error : new BodyError(400); }
  }
  if (!req.on || !req.off) throw new BodyError(400);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const finish = (error?: BodyError) => {
      clearTimeout(timer); req.off!('data', data); req.off!('end', end); req.off!('error', failed); req.off!('aborted', failed);
      if (error) { req.pause?.(); reject(error); }
      else { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new BodyError(400)); } }
    };
    const data = (chunk: unknown) => {
      if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string') { finish(new BodyError(400)); return; }
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > reportPolicy.maxBytes) finish(new BodyError(413)); else chunks.push(bytes);
    };
    const end = () => finish(), failed = () => finish(new BodyError(400));
    const timer = setTimeout(() => finish(new BodyError(408)), reportPolicy.bodyTimeoutMs);
    req.on!('data', data); req.on!('end', end); req.on!('error', failed); req.on!('aborted', failed);
  });
}

export function createClientErrorHandler(settings: Pick<AppConfig, 'security' | 'server' | 'public'>, sink: (event: ErrorEvent) => void, clock = Date.now) {
  let windowStart = -Infinity, count = 0;
  const seen = new Set<string>();
  return async (req: Request, res: any) => {
    const send = (status: number) => {
      res.setHeader?.('Cache-Control', 'no-store');
      if (status === 408 || status === 413) res.setHeader?.('Connection', 'close');
      if (status === 204) { if (res.status) res.status(204); else res.writeHead?.(204); return res.end?.(); }
      const body = { error: status === 429 ? 'Too many reports. Please try again later.' : 'Invalid error report.' };
      if (res.status && res.json) return res.status(status).json(body);
      res.writeHead?.(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Connection: 'close' }); res.end?.(JSON.stringify(body));
    };
    res.setHeader?.('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    const headers: Record<string, unknown> = Object.create(null);
    for (const [name, value] of Object.entries(req.headers ?? {})) {
      const key = name.toLowerCase(); if (Object.hasOwn(headers, key)) return send(400); headers[key] = value;
    }
    const origin = headers.origin;
    if (typeof origin !== 'string') return send(403);
    let allowed = [settings.security.appOrigin, ...settings.security.corsAllowedOrigins].includes(origin);
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== origin) return send(403);
      if (settings.server.nodeEnv !== 'production' && !settings.server.vercel && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) allowed = true;
    } catch { return send(403); }
    if (!allowed) return send(403);
    res.setHeader?.('Access-Control-Allow-Origin', origin);
    try {
      if (req.url !== undefined && (typeof req.url !== 'string' || req.url.length > 2048 || new URL(req.url, 'https://request.invalid').search !== '')) return send(400);
    } catch { return send(400); }
    if (req.method === 'OPTIONS') {
      if (headers['access-control-request-method'] !== 'POST' || headers['access-control-request-private-network'] !== undefined ||
        typeof headers['access-control-request-headers'] !== 'string' || headers['access-control-request-headers'].toLowerCase().trim() !== 'content-type') return send(403);
      res.setHeader?.('Access-Control-Allow-Methods', 'POST'); res.setHeader?.('Access-Control-Allow-Headers', 'Content-Type'); return send(204);
    }
    if (req.method !== 'POST') { res.setHeader?.('Allow', 'POST, OPTIONS'); return send(405); }
    if (headers.cookie !== undefined || headers.authorization !== undefined) return send(400);
    if (typeof headers['content-type'] !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(headers['content-type']) || headers['content-encoding'] !== undefined) return send(415);
    const length = headers['content-length'];
    if (length !== undefined && (typeof length !== 'string' || !/^\d{1,8}$/.test(length))) return send(400);
    if (typeof length === 'string' && Number(length) > reportPolicy.maxBytes) return send(413);
    const now = clock();
    if (now < windowStart || now - windowStart >= reportPolicy.windowMs) { windowStart = now; count = 0; seen.clear(); }
    if (count >= reportPolicy.serverEvents) { res.setHeader?.('Retry-After', '60'); return send(429); }
    count++; // Includes invalid submissions, reserving admission before reading asynchronously.
    try {
      const parsed = errorEventSchema.safeParse(await readBody(req));
      if (!parsed.success || parsed.data.source !== 'browser' || parsed.data.context.requestId !== undefined) return send(400);
      if (!settings.public.errors.enabled) return send(204);
      const event = parsed.data;
      if (!seen.has(event.eventId)) { seen.add(event.eventId); try { sink(event); } catch { /* Never recursively report sink failures. */ } }
      return send(204);
    } catch (error) { return send(error instanceof BodyError ? error.status : 400); }
  };
}
