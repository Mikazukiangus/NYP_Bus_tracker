import type { RequestHandler } from 'express';
import { createPublicConfig, type PublicConfig } from '../config/public.ts';

export function reportOnlyCsp(urls: PublicConfig['urls'] = createPublicConfig().urls): string {
  // Origins come from validated config; URL parsing also prevents directive/string injection.
  const origins = [...new Set(Object.values(urls).filter(Boolean).map(value => new URL(value).origin))];
  if (origins.some(origin => !origin.startsWith('https://'))) throw new Error('CSP destinations must use HTTPS.');
  return `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${origins.join(' ')}; font-src 'self'; connect-src 'self' ${origins.join(' ')}; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
}

// Keep vercel.json's all-path headers in sync (checked by transport-security.test.ts).
export const TRANSPORT_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self' https:; script-src 'self'; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  'Content-Security-Policy-Report-Only': reportOnlyCsp(),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // CORS-approved fetches remain usable; CORP restricts no-cors embedding.
  'Cross-Origin-Resource-Policy': 'same-site',
} as const;

export function createTransportSecurity(settings: { production: boolean; appOrigin: string; publicUrls?: PublicConfig['urls'] }): RequestHandler {
  const origin = new URL(settings.appOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== settings.appOrigin) throw new Error('APP_ORIGIN must be an HTTPS origin');
  return (req, res, next) => {
    if (!settings.production) { next(); return; }
    // req.secure honors Express's explicit trusted-proxy list, never arbitrary forwarded headers.
    if (!req.secure) {
      const path = req.originalUrl.startsWith('/') ? req.originalUrl : `/${req.originalUrl}`;
      res.setHeader('Cache-Control', 'no-store');
      // Concatenation retains the configured host even for //host-like paths. Never use Host for this.
      res.redirect(308, `${origin.origin}${path}`);
      return;
    }
    for (const [key, value] of Object.entries(TRANSPORT_HEADERS)) res.setHeader(key, value);
    if (settings.publicUrls) res.setHeader('Content-Security-Policy-Report-Only', reportOnlyCsp(settings.publicUrls));
    next();
  };
}
