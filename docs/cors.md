# API CORS policy

Released and verified on 21 October 2026 in application commit `5a83319`. `COMMENTS.md` Turns 90–91 record implementation, validation and production delivery.

## Current defaults

The API and frontend currently share `https://nypbus-tracker.vercel.app`. That exact `APP_ORIGIN` is allowed by default. `CORS_ALLOWED_ORIGINS` is an empty additional allowlist until explicitly configured. No wildcard, suffix rule, automatically trusted Vercel preview, arbitrary Host/forwarded-header origin or credentialed CORS grant is enabled.

All five API handlers and the arrivals alias apply the same `server/http/cors.ts` policy through their request gate, for both Express and Vercel. Static assets and external NEA/OneMap/CDN servers are outside this API policy; it does not change another provider's CORS settings or enable cross-origin navigation to frontend pages.

- Approved Origin: return that one exact value in `Access-Control-Allow-Origin`.
- Unlisted, opaque `null`, sibling, lookalike or noncanonical Origin: reject with generic 403 before service/provider work. Malformed/duplicate header representations return 400. Diagnostics do not echo supplied origins or headers.
- No Origin: preserve normal public GET/HEAD requests, CLI clients and health checks, with no CORS grant.
- Credentialed browser reads: no `Access-Control-Allow-Credentials` header is sent. The app has no cookie authentication; cross-origin consumers should use `credentials: 'omit'` rather than `include`.
- Business methods stay GET/HEAD. Allowed-origin unsupported methods return the existing 405, and allowed clients can read validation/method errors. Ordinary OPTIONS without preflight metadata stays 405.

CORS is a browser response-sharing policy, not authentication. A non-browser client can omit or forge Origin. Refusing an Origin-bearing request does not turn these public provider-data APIs into private APIs, and CORS is not a replacement for CSRF protection on future authenticated writes.

## Configure exact frontend origins

Keep the present same-origin deployment with the generated defaults:

```dotenv
APP_ORIGIN="https://nypbus-tracker.vercel.app"
CORS_ALLOWED_ORIGINS=""
VITE_API_BASE_URL=""
```

For a deliberately separate API and frontend, configure the **API server/deployment** with its canonical HTTPS origin and the exact frontend origin(s). These example hosts are placeholders, not additional enabled origins:

```dotenv
APP_ORIGIN="https://api.example.com"
CORS_ALLOWED_ORIGINS="https://frontend.example.com,https://admin.example.com"
```

Configure/rebuild the **frontend** with the API base:

```dotenv
VITE_API_BASE_URL="https://api.example.com"
```

`CORS_ALLOWED_ORIGINS` is server-only and is not baked into the browser's public configuration. It accepts at most 20 comma-separated additional origins. Surrounding list whitespace is trimmed. Host casing/default ports/trailing root slashes are normalized and duplicates removed. Origins include scheme, host and nondefault port; different ports and sibling hosts need separate entries. Wildcards, paths, credentials, query strings, fragments, internal control/whitespace characters and empty list entries fail validation without printing supplied values.

HTTP localhost/loopback origins may be explicitly listed for development. Production, Vercel and client builds require HTTPS even for loopback. Use environment-specific settings rather than carrying a development HTTP allowlist into a production build. Restart the local server after changes; changing deployment settings requires a redeploy. The production release uses the canonical live origin without adding extra frontends or changing environment settings.

For the existing development server, frontend and API use the same port, so no additional origin is usually needed. If using a separate frontend dev server, add its exact origin to the local API setting. Do not allow all localhost ports or all `*.vercel.app` hosts.

## Preflight contract

An OPTIONS request with an approved Origin and `Access-Control-Request-Method: GET` or `HEAD` returns **204 with no body**, before query/service/provider work. It permits only the fixed request-header set:

```text
Accept, Content-Type, Cache-Control, Pragma
```

Header comparisons are case-insensitive. Authorization, API-key/custom headers, wildcards, private-network grants, write methods and malformed header lists are denied. Preflight payloads and oversized request targets are rejected. No requested header/method is reflected as an arbitrary grant.

Responses include `Access-Control-Allow-Methods: GET, HEAD`, the fixed Allow-Headers set and `Access-Control-Max-Age: 300`. HTTP caching of preflights/denials is disabled with `Cache-Control: no-store`; browsers may retain approved preflight permission for up to five minutes, so allowlist changes can take that long to affect a previously approved browser preflight. Successful ordinary data reads keep their existing public cache lifetimes.

Every normal API response varies on Origin, including requests without Origin, so a cached grant cannot be reused across origin variants. Preflights also vary on requested method and headers; existing Vary values are preserved. No global wildcard CORS headers were added to `vercel.json`. Production verification alternated no-Origin, approved-origin and denied-origin requests on every API and the arrivals alias. Repeated approved and no-Origin data responses returned CDN HITs with their correct distinct grants, while denials stayed 403 without a grant. Health responses were MISS/no-store. An additional CDN/proxy must honor Vary or avoid caching origin-dependent responses; these checks cover the current Vercel deployment, not every possible proxy or location.

## Validation

Seven CORS regression tests cover configuration, exact-origin grants/denials, Vary preservation, credential absence, valid/invalid preflights, readable error responses and all five real handlers returning before provider calls. The existing CSRF checks now distinguish untrusted-origin 403 responses from allowed-origin method 405 responses; method overrides and visitor-cookie forwarding remain blocked.

An isolated HTTPS browser exercise uses separate API, allowed frontend and denied frontend origins with synthetic provider responses. It verifies an allowed read, OPTIONS then GET for an approved JSON header, readable 400 errors, denied-origin reads/preflights without provider calls, rejected Authorization and JSON-write preflights, a simple write returning 405, blocked credentialed reads and a successful return to the allowed origin. Temporary fixture certificates are accepted only by its isolated browser; no production credential, setting or live attack request was used.

Production verification also passed 58 HTTP policy checks, a real Chrome denial from an unapproved frontend origin, and normal app flows at 375 px and 1280 px. See `COMMENTS.md` Turns 90–91 for full-suite/build/browser results and delivery status. References: [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS), [MDN exact-origin response headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin), [Vercel CDN Vary behavior](https://vercel.com/docs/caching/cdn-cache#vary-header).
