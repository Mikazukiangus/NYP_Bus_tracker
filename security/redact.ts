import { Buffer } from 'node:buffer';
import { CircuitOpenError, DependencyHttpError, InvalidDependencyResponseError } from '../shared/http/circuitBreaker.ts';

export const REDACTED = '[REDACTED]';
const sensitiveKey = (key: string) =>
  /(?:secret|token|password|passwd|authorization|cookie|accountkey|apikey|credential|deployhook|privatekey|email|phone|telephone)|^(?:key|signature|sig|contacts?)$/i.test(key.replace(/[^a-z0-9]/gi, ''));

// Errors deliberately expose no arbitrary message, stack, cause, request headers or response body.
export function safeError(error: unknown): { kind: string; httpStatus?: number } {
  if (error instanceof Error) {
    if (error instanceof DependencyHttpError && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599) {
      return { kind: 'upstream_http_error', httpStatus: error.status };
    }
    if (error instanceof CircuitOpenError) return { kind: 'circuit_open' };
    if (error instanceof InvalidDependencyResponseError) return { kind: 'invalid_response' };
    if (['TimeoutError', 'AbortError'].includes(error.name)) return { kind: 'timeout' };
    if (error instanceof SyntaxError) return { kind: 'invalid_response' };
    if (error instanceof TypeError) return { kind: 'network_or_type_error' };
  }
  return { kind: 'request_failed' };
}

export function redact(value: unknown, secrets: readonly string[] = []): unknown {
  const variants = [...new Set(secrets.filter((secret) => typeof secret === 'string' && secret.length > 0).flatMap((secret) => {
    try {
      return [secret, encodeURIComponent(secret), encodeURI(secret), Buffer.from(secret).toString('base64'), JSON.stringify(secret).slice(1, -1)];
    } catch { return [secret]; }
  }))].sort((a, b) => b.length - a.length);
  const seen = new WeakSet<object>();
  function string(input: string): string {
    let result = input;
    for (const secret of variants) result = result.split(secret).join(REDACTED);
    result = result
      .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, REDACTED)
      .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, REDACTED)
      .replace(/\bBearer\s+[^\s,;"']+/gi, `Bearer ${REDACTED}`)
      .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, `Basic ${REDACTED}`)
      .replace(/(["']?(?:accountkey|authorization|x-api-key|api[_-]?key|token|secret|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|LTA_ACCOUNT_KEY|DATA_GOV_SG_API_KEY|VERCEL_DEPLOY_HOOK_URL)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi, `$1${REDACTED}`)
      .replace(/https?:\/\/[^\s"'<>]+/g, (raw) => {
        try {
          const url = new URL(raw);
          if (url.username || url.password) { url.username = 'REDACTED'; url.password = 'REDACTED'; }
          for (const name of new Set(url.searchParams.keys())) url.searchParams.set(name, REDACTED);
          if (url.hash) url.hash = REDACTED;
          if (url.hostname === 'api.vercel.com' && url.pathname.startsWith('/v1/integrations/deploy/')) {
            url.pathname = '/v1/integrations/deploy/REDACTED';
          }
          return url.toString();
        } catch { return '[REDACTED URL]'; }
      });
    // URL serialization can percent-encode characters in a configured secret.
    for (const secret of variants) result = result.split(secret).join(REDACTED);
    return result;
  }
  function visit(input: unknown, depth: number): unknown {
    if (depth > 12) return '[TRUNCATED]';
    if (typeof input === 'string') return string(input);
    if (input instanceof Error) return safeError(input);
    if (input instanceof URL) return string(input.toString());
    if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer) return '[BINARY OMITTED]';
    if (typeof input === 'bigint') return String(input);
    if (input === null || typeof input !== 'object') return typeof input === 'function' ? '[FUNCTION]' : input;
    if (seen.has(input)) return '[CIRCULAR]';
    seen.add(input);
    if (input instanceof Headers) return visit(Object.fromEntries(input.entries()), depth + 1);
    if (Array.isArray(input)) return input.map((item) => visit(item, depth + 1));
    return Object.fromEntries(Object.entries(input).map(([key, child]) => [
      string(key), sensitiveKey(key) ? REDACTED : visit(child, depth + 1),
    ]));
  }
  try { return visit(value, 0); }
  catch { return '[REDACTION FAILED: CONTENT OMITTED]'; }
}

type LogLevel = 'info' | 'warn' | 'error';
type LogSink = (level: LogLevel, line: string) => void;

export function createLogger(secrets: readonly string[] = [], sink: LogSink = (level, line) => console[level](line), options: {
  metadata?: () => Record<string, unknown>; now?: () => number;
} = {}) {
  const write = (level: LogLevel, event: string, details: Record<string, unknown> = {}) => {
    // One JSON object per line; metadata is resolved at the call, never when a singleton is created.
    try {
      const timestamp = new Date((options.now ?? Date.now)()).toISOString();
      let metadata: Record<string, unknown> = {};
      try { metadata = options.metadata?.() ?? {}; } catch { /* Keep the fixed envelope if context fails. */ }
      const clean = redact({ ...metadata, version: 1, timestamp, level, event, details }, secrets);
      sink(level, JSON.stringify(clean !== null && typeof clean === 'object' && !Array.isArray(clean) ? clean : {
        version: 1, timestamp, level, event: 'logging.redaction_failed', details: { omitted: true },
      }));
    } catch { /* Logging cannot fail a request or recursively report a broken sink. */ }
  };
  return {
    info: (event: string, details?: Record<string, unknown>) => write('info', event, details),
    warn: (event: string, details?: Record<string, unknown>) => write('warn', event, details),
    error: (event: string, details?: Record<string, unknown>) => write('error', event, details),
  };
}
