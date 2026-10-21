# HTTPS and cookie policy

Implemented and deployed on 21 October 2026 as security release `cb5e131`. The initial audit below describes the preceding `631e51f` release; the production-delivery section records verification of the new policy.

## Requests and response headers

- Vercel already redirects HTTP to HTTPS with status 308, retaining path/query. Verified on the live home page and arrivals endpoint. This happens at Vercel's edge; no redundant host/header-based redirect rule was added. The repository now explicitly sets all-path HSTS and CSP in `vercel.json`, covering pages, assets and API responses without changing immutable asset caching.
- HSTS is `max-age=63072000; includeSubDomains`. The policy lasts two years and covers the host's subdomains; no HSTS preload enrollment was requested. The currently deployed Vercel header also advertises `preload`; that token alone is not evidence of enrollment.
- The transport CSP allows HTTPS resources and secure WebSockets, upgrades eligible insecure requests, and prevents plaintext connections from being used as fallback. Scripts load from the site itself; Leaflet's inline styles, HTTPS stylesheet/tiles, data/blob images and configured HTTPS API/data origins remain usable. Objects are disabled and base/form/frame policies are explicit. This is a transport safeguard, not a complete XSS audit.
- For the standalone Express server, production middleware runs before JSON parsing, APIs and static files. HTTP gets a method-preserving 308 to the validated `APP_ORIGIN`, preserving encoded path/query and avoiding a redirect destination derived from untrusted Host headers. HSTS is emitted only for secure production requests. HTTPS requests continue without redirect loops. Development retains local HTTP and Vite HMR, with no sticky HSTS or upgrading CSP.
- Proxy protocol headers are honored only from the explicit `TRUST_PROXY_CIDRS` list. The default trusts loopback proxies; `none` disables proxy trust. Configure only actual proxy IPs/CIDRs, and require the proxy to overwrite incoming forwarded headers. Backend access must be restricted appropriately; do not trust arbitrary clients or all-address CIDRs.

For a standalone production server behind a local TLS proxy:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://your-domain.example
HOST=127.0.0.1
TRUST_PROXY_CIDRS=loopback
```

Terminate TLS at the proxy with a valid certificate and forward the actual protocol. The Express HTTP listener does not issue certificates or serve TLS itself. On Vercel, TLS and the initial redirect remain platform responsibilities; these standalone proxy settings do not configure the Vercel edge.

All configured provider and browser endpoints must use HTTPS in production or on Vercel, including loopback endpoints. Every Vite build also enforces this, even with a custom mode or development `NODE_ENV`. Development alone permits loopback HTTP fixtures. Secret validation errors report field names, not supplied values. TLS certificate verification remains enabled.

Server LTA/NEA requests, health probes and the Overpass builder use `redirect: 'error'`. Redirected provider endpoints fail through existing retry/fallback handling rather than moving credentials to another origin or downgrading to HTTP. This also rejects HTTPS-to-HTTPS provider redirects: update a configured base URL deliberately if a provider moves.

## Cookies

The app currently sets **no cookies**, and the live browser audit found no first-party cookies. Favorites and location use validated browser storage; they were not converted into cookies.

Future server cookies must use [`setSecureCookie`](../security/cookies.ts). It applies `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, a `__Host-` name and no Domain attribute. Callers can supply only a name, string value and optional nonnegative lifetime; cookie security flags cannot be overridden. Use the same helper with an empty value and lifetime zero to expire a cookie. No session/authentication feature was introduced.

The helper uses shared Node/Vercel/Express response-header methods, percent-encodes values, converts millisecond lifetimes to cookie Max-Age seconds, and preserves existing Set-Cookie fields separately. An isolated HTTPS browser verified Secure/HttpOnly/SameSite/host-prefix flags, JavaScript read protection and matching-scope deletion.

```ts
import { setSecureCookie } from './security/cookies';
setSecureCookie(res, 'session', opaqueSessionId, 60 * 60 * 1000);
// Expire with matching host/path scope:
setSecureCookie(res, 'session', '', 0);
```

Regression checks reject direct application cookie setters and raw Set-Cookie writes outside the helper. Platform-owned authentication cookies and third-party cookies are outside the app's cookie policy. The helper does not replace authentication or CSRF design if those features are added later.

## CSRF scope

The current app has no cookie-authenticated routes or server user-data writes. Its public APIs accept only body-free GET/HEAD requests. The cookie helper is not a session/authentication or CSRF middleware: HttpOnly does not prevent automatic cookie sending, and SameSite=Lax alone is not the protection plan for future authenticated mutations. Before adding such routes, integrate session-bound token checks and exact-origin verification before business logic, including login/logout protection. See the [CSRF route check and future integration requirements](csrf-protection.md).

## Mixed-content checks and findings

Run `npm run security:https` to flag literal `http://` and `ws://` references in browser source, shared source, index HTML and browser-readable public assets. The production build runs this check before generating routes. Output contains only file/line/scheme information; URLs, queries and credentials are not printed. The tests also run the source check and verify that insecure examples are detected.

Current source check: **121 files, zero findings**. SVG `xmlns="http://www.w3.org/2000/svg"` is an identifier, not a fetched resource. API handlers' HTTP base URLs only parse incoming request URLs; they are not outbound fetch targets. Local development/documentation/test URLs are outside the browser-source scan. Literal scanning cannot prove that every dynamically constructed URL is secure; production configuration, CSP and browser checks cover additional boundaries.

The existing live release was audited in Chrome at 375 px and 1280 px through arrival, trip, map/tile, saving and location/reload flows. Both widths had **zero mixed-content audit issues, zero HTTP/WS resource requests and zero app cookies**. HTTP redirects and existing HSTS were present; the new repository CSP was not deployed and therefore was absent from the live responses.

The new production behavior was tested through an isolated HTTPS proxy using a temporary fixture certificate. The backend trusted that fixture CA with normal Node certificate verification; only the isolated fixture browser accepted the temporary certificate. Both widths passed the app flows, HTTPS headers, map lifecycle and persistence without page exceptions or overflow. A deliberate loopback HTTP fetch was blocked by `connect-src` before network transmission. The original fixture expected an intercepted insecure request to upgrade; it was corrected to assert actual CSP blocking for loopback rather than assuming that behavior.

A separate real HTTPS provider fixture redirected a credentialed incident request to an HTTP trap: one HTTPS request was received, **zero plaintext requests** reached the trap, and the service safely returned unavailable. No real credential was used.

All **157 tests**, TypeScript with unused-local checks, the default production Vite build and generated `.env.example` checks pass. An actual client build with an HTTP loopback override was rejected even under a custom build mode/development `NODE_ENV`. Turn 81 initially completed the implementation locally; Turn 83 records its subsequent release.

## Production delivery — 21 October 2026

Security release `cb5e131` is pushed to GitHub `main`. Vercel production deployment `dpl_6JVMnDbUZiUgatjiCtpWaJtSwGVL` reached READY and the live domain serves that exact commit. Verified 308 HTTPS redirects retaining encoded queries, the configured HSTS/CSP on pages/assets/APIs and expected errors, and immutable asset caching. All five live APIs work, health is `ok`, arrival/artifact validators accept real data, and weather filled its initially missing datasets on follow-up.

Live browser flows at 375 px and 1280 px pass arrivals, trip/map/tiles, favorites, location persistence/reload and map cleanup. Chrome audits and policy listeners report zero mixed-content issues, insecure resource requests, CSP violations, app cookies or page exceptions. No production cookie was introduced; the secure helper is available for future server cookies. No credentials/environment settings or preload enrollment changed. `COMMENTS.md` Turn 83 records complete delivery evidence.

## References

- [Vercel response headers](https://vercel.com/docs/headers/response-headers) and [request/proxy headers](https://vercel.com/docs/headers/request-headers).
- MDN: [HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security), [upgrading insecure requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/upgrade-insecure-requests) and [secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies).
