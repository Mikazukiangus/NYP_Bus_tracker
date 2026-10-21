import type { RequestHandler } from 'express';

// Keep vercel.json's all-path headers in sync (checked by transport-security.test.ts).
export const TRANSPORT_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self' https:; script-src 'self'; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
} as const;

export function createTransportSecurity(settings: { production: boolean; appOrigin: string }): RequestHandler {
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
    next();
  };
}
