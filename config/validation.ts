// Pure validation helpers. Never reads environment variables, files or credentials.
export type Environment = Readonly<Record<string, string | undefined>>;

export interface Field<T> {
  readonly kind: 'field';
  readonly env: string;
  readonly description: string;
  readonly defaultValue: T;
  readonly parse: (raw: string) => T;
}
export type Schema = { readonly [key: string]: Field<unknown> | Schema };
export type Values<S> = { readonly [K in keyof S]: S[K] extends Field<infer T> ? T : Values<S[K]> };

export function field<T>(env: string, defaultValue: T, description: string, parse: (raw: string) => T): Field<T> {
  return { kind: 'field', env, defaultValue, description, parse };
}
export const integer = (env: string, value: number, min: number, max: number, description: string) =>
  field(env, value, `${description} Integer ${min}–${max}.`, (raw) => {
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min || Number(raw) > max) {
      throw new Error(`must be an integer between ${min} and ${max}`);
    }
    return Number(raw);
  });
export const boolean = (env: string, value: boolean, description: string) => field(env, value, description, (raw) => {
  if (!['true', 'false', '1', '0'].includes(raw)) throw new Error('must be true, false, 1 or 0');
  return raw === 'true' || raw === '1';
});
export const text = (env: string, value: string, description: string) => field(env, value, description, (raw) => {
  if (/[\r\n\x00]/.test(raw)) throw new Error('must be a single line');
  return raw;
});

export function parseUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('must be an absolute HTTP(S) URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('must be an HTTP(S) URL without credentials, query or fragment');
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('must use HTTPS (HTTP is allowed only for localhost)');
  }
  return url.toString().replace(/\/$/, '');
}
export const url = (env: string, value: string, description: string) => field(env, value, description, parseUrl);
export const optionalBase = (env: string, description: string) => field(env, '', description, parseUrl);
export const ms = (env: string, value: number, description: string, min = 1000, max = 120000) =>
  integer(env, value, min, max, `${description} Milliseconds.`);
export const seconds = (env: string, value: number, description: string, min = 0, max = 604800) =>
  integer(env, value, min, max, `${description} Seconds.`);

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    // Report field names and constraints only; never echo a supplied URL, credential or value.
    super(`Invalid environment configuration:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function requireHttpsEndpoints(endpoints: Record<string, string | readonly string[]>): void {
  const issues = Object.entries(endpoints).filter(([, value]) =>
    (typeof value === 'string' ? [value] : value).some(url => url && new URL(url).protocol !== 'https:')
  ).map(([key]) => `${key} must use HTTPS in production`);
  if (issues.length) throw new ConfigError(issues);
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const isField = (entry: Field<unknown> | Schema): entry is Field<unknown> => entry.kind === 'field';
export function resolve<S extends Schema>(schema: S, env: Environment): Values<S> {
  const issues: string[] = [];
  function visit(node: Schema): Record<string, unknown> {
    return Object.fromEntries(Object.entries(node).map(([key, entry]) => {
      if (!isField(entry)) return [key, visit(entry)];
      const raw = env[entry.env]?.trim();
      try { return [key, raw ? entry.parse(raw) : entry.defaultValue]; }
      catch (error) { issues.push(`${entry.env}: ${(error as Error).message}`); return [key, entry.defaultValue]; }
    }));
  }
  const result = visit(schema) as Values<S>;
  if (issues.length) throw new ConfigError(issues);
  return deepFreeze(result);
}

