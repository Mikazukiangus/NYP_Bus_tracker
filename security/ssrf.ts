import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent } from 'undici';

export class SsrfBlockedError extends Error {
  readonly code = 'SSRF_BLOCKED';
  constructor() { super('Outbound destination is not permitted.'); this.name = 'SsrfBlockedError'; }
}

// Allow ordinary global unicast only; reject special-use, transition and mapped ranges.
// Azure's platform virtual IP is globally numbered but is not a public web destination.
export function isPublicAddress(value: string): boolean {
  if (typeof value !== 'string' || !isIP(value) || value.includes('%') || value === '168.63.129.16') return false;
  const address = ipaddr.parse(value);
  if (address.range() !== 'unicast') return false;
  return !(address instanceof ipaddr.IPv6) || address.match(ipaddr.parse('2000::') as ipaddr.IPv6, 3);
}

function assertHostname(host: string) {
  const hostname = host.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new SsrfBlockedError();
    return;
  }
  const labels = hostname.split('.');
  const localNames = ['localhost', 'local', 'localdomain', 'internal', 'home.arpa'];
  if (hostname.length > 253 || labels.length < 2 ||
    labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    localNames.some(name => hostname === name || hostname.endsWith(`.${name}`))) throw new SsrfBlockedError();
}

export function assertPublicUrl(input: string | URL): URL {
  const raw = input instanceof URL ? input.href : input;
  if (typeof raw !== 'string' || raw.length > 4096 || /[\s\u0000-\u001f\u007f\\#]/.test(raw) || !/^https?:\/\//i.test(raw)) throw new SsrfBlockedError();
  let url: URL;
  try { url = new URL(raw); } catch { throw new SsrfBlockedError(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /^https?:\/\/[^/?#]*@/i.test(raw)) throw new SsrfBlockedError();
  assertHostname(url.hostname);
  return url;
}

export type AddressResolver = (hostname: string) => Promise<LookupAddress[]>;
const systemResolver: AddressResolver = hostname => lookup(hostname, { all: true, verbatim: true });

// This IS the socket lookup, rather than a preflight followed by a second uncontrolled
// resolution. Every new connection gets only the exact addresses validated here.
export function createGuardedLookup(resolve: AddressResolver = systemResolver): LookupFunction {
  return (hostname, options, callback) => {
    Promise.resolve().then(() => { assertHostname(hostname); return resolve(hostname); }).then(records => {
      if (!Array.isArray(records) || !records.length || records.length > 64 || records.some(record =>
        !record || !isPublicAddress(record.address) || isIP(record.address) !== record.family)) throw new SsrfBlockedError();
      const family = options.family === 4 || options.family === 6 ? options.family : undefined;
      const selected = family ? records.filter(record => record.family === family) : records;
      if (!selected.length) throw new SsrfBlockedError();
      if (options.all) callback(null, selected);
      else callback(null, selected[0].address, selected[0].family);
    }, () => { throw new SsrfBlockedError(); }).catch(() => callback(new SsrfBlockedError(), []));
  };
}

// Resolver injection is for trusted in-process tests, never request/environment data.
// No proxy/global dispatcher is used: an external proxy would resolve elsewhere.
export function createSafeFetcher(resolve: AddressResolver = systemResolver) {
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(resolve), timeout: 10_000 }, allowH2: false });
  const request: typeof fetch = async (input, init) => {
    let target: string | Request, headers: Headers;
    try {
      target = input instanceof Request ? new Request(input) : assertPublicUrl(input).href;
      if (target instanceof Request) assertPublicUrl(target.url);
      headers = new Headers(init?.headers ?? (target instanceof Request ? target.headers : undefined));
      if (['host', 'proxy-authorization', 'connection', 'upgrade'].some(name => headers.has(name))) throw new SsrfBlockedError();
    } catch { throw new SsrfBlockedError(); }
    const signal = init?.signal ?? (target instanceof Request ? target.signal : undefined);
    try {
      // Last-write-wins prevents even untyped callers replacing the dispatcher or redirect policy.
      const options = { ...init, headers, signal: signal ?? AbortSignal.timeout(30_000), redirect: 'error' as const, dispatcher };
      const response = await fetch(target, options);
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new SsrfBlockedError();
      }
      return response;
    } catch (error) {
      if (error instanceof SsrfBlockedError || error instanceof Error && error.cause instanceof SsrfBlockedError) throw new SsrfBlockedError();
      if (signal?.aborted || error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
        throw new DOMException('Outbound request timed out or was cancelled.', error instanceof Error && error.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError');
      }
      // Do not propagate native errors containing supplied URLs, DNS names, IPs or credentials.
      throw new Error('Outbound request failed.');
    }
  };
  return { fetch: request, close: () => dispatcher.close() };
}

export const safeFetch = createSafeFetcher().fetch;
