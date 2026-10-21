import type { ServerResponse } from 'node:http';

// The app currently sets no cookies. Future server cookies must use this helper.
// __Host- forbids Domain and requires Secure + Path=/; never expose auth cookies to JS.
// SameSite is defense in depth, not a CSRF token check. Future cookie-authenticated
// mutations require CSRF protection before their handler runs (see docs/csrf-protection.md).
export function setSecureCookie(res: Pick<ServerResponse, 'getHeader' | 'setHeader'>, name: string, value: string, maxAgeMs?: number) {
  if (!/^[A-Za-z0-9_-]+$/.test(name) || name.startsWith('__')) throw new Error('Invalid cookie name');
  if (typeof value !== 'string') throw new Error('Invalid cookie value');
  if (maxAgeMs !== undefined && (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0)) throw new Error('Invalid cookie lifetime');
  const cookie = `__Host-${name}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Lax` +
    (maxAgeMs === undefined ? '' : `; Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  const previous = res.getHeader('Set-Cookie');
  // Node/Vercel and Express share these methods. Preserve separate Set-Cookie fields.
  return res.setHeader('Set-Cookie', [...(previous === undefined ? [] : Array.isArray(previous) ? previous : [String(previous)]), cookie]);
}
