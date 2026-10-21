# CSRF protection and current route scope

Checked on 21 October 2026 at application release `65d48f2`. The repository has **zero cookie-authenticated routes** and no login/logout/session implementation. No exploitable cookie-authenticated CSRF gap was found in the current route set. This check did not add authentication, session state, token endpoints or unused middleware.

## What the app currently does

The five APIs are public data reads: `/api/bus-arrival`, `/api/bus-route`, `/api/weather`, `/api/traffic-incidents` and `/api/health`. The `/api/BusArrival` alias reaches the same arrivals handler. Each handler calls `validateReadRequest` before service/cache/provider work. Only body-free GET and HEAD are accepted; unsupported methods return 405 with `Allow: GET, HEAD` and `Cache-Control: no-store`. Action/method-override query fields are not part of their schemas and are rejected.

No endpoint reads an incoming cookie as a user identity or authorization decision. No session/cookie parser, login middleware or method-override middleware is installed. Provider API keys come from server configuration and are sent in explicitly constructed upstream headers; visitor cookies/authorization are not forwarded. Cache fills, health probes and provider request budgets are server operational activity, not changes to an authenticated user's account. Request-volume abuse is a different concern from cookie-authenticated CSRF.

Saved buses, recent places, location and the last bus search use validated browser localStorage. They have no server write endpoint. The app sets no cookies today. `setSecureCookie` is an unused future-cookie utility that fixes Secure, HttpOnly, SameSite=Lax, __Host- naming and host/path scope; it does not establish a session or check a CSRF token.

The current public reads do not need per-session CSRF tokens. A later [CORS allowlist](cors.md) now rejects untrusted Origin-bearing requests with 403 and handles approved read preflights with 204, while preserving method/schema rejection for business requests. This is a browser sharing policy, not authentication or a CSRF token implementation.

## Gap fixed in the guidance

The cookie helper comment and HTTPS/cookie documentation now explicitly distinguish cookie flags from CSRF protection. `HttpOnly` prevents ordinary script access to a cookie; it does not stop a browser attaching that cookie to a request. `SameSite=Lax` is defense in depth, not a substitute for designing protection for authenticated state changes. Same-site requests can be cross-origin, and the current read methods must stay free of user/account mutations.

## Before adding cookie-authenticated writes

Use the chosen authentication/framework's maintained CSRF protection and test its actual login/session lifecycle. Required behavior should be defined before introducing the first write route:

1. Keep GET/HEAD side-effect-free with respect to user/account state. Use unsafe methods for writes, including login/logout; handle login CSRF as part of the authentication design.
2. For browser session-cookie writes, require a cryptographically strong, session-bound CSRF token, typically in `X-CSRF-Token` or a hidden form field. Reject missing/invalid tokens before business logic. Do not put tokens in URLs, logs or shared cached responses. Avoid an unsigned/naive double-submit cookie design.
3. Verify the exact permitted source origins from server-controlled configuration, including scheme/host/port. Do not derive trust from arbitrary Host/forwarded headers or suffix matching. Reject untrusted and `null` origins; if Origin is absent, use an exact-origin Referer check and a deliberately defined fail-closed policy when neither is available. Legitimate additional frontend origins need explicit configuration and tests.
4. Use Fetch Metadata to reject cross-site unsafe browser requests as another layer. Treat same-site sibling origins as potentially untrusted; missing metadata must not bypass token/origin checks. Do not accept simple form or text/plain content types as an authorization signal, or allow a method override to turn a safe request into a mutation.
5. Keep secure cookie flags, authentication/authorization and request validation. CORS controls response access and preflights, not whether every form request reaches the server. The app's own `form-action` CSP does not stop a form on an attacker's page targeting this app.

This is a future integration requirement, not a claim that a generic CSRF guard has been installed. Revisit route cache policy as well: authenticated/user-specific responses must not inherit today's public provider-response caching unchanged.

## Verification

`tests/csrf-surface.test.ts` adds a route-inventory guard and tests the actual HTTP handlers through an isolated Express listener. Cross-site, same-site sibling and opaque-origin form-shaped POST requests carrying a synthetic session-like Cookie header are rejected on every API. With the CORS policy, untrusted origins return 403; allowed-origin writes return 405. URL-encoded, text/plain and multipart forms, plus unsupported method requests without an approved read preflight, never reach the mocked providers. Method-override headers/form fields and action query fields do not bypass the gate. Ordinary public GET/HEAD gates remain usable without Origin or from approved origins; cookies do not grant access. An injected health probe verifies that upstream requests use configured synthetic provider keys and omit visitor Cookie/Authorization/Origin headers.

These are server-side HTTP probes with explicit synthetic headers; they do not claim to authenticate a real session or test browser SameSite cookie-delivery behavior. No session exists to run an authenticated end-to-end token flow. No live attack/provider request, cookie creation or production configuration change was performed. Adding an API source file fails the inventory test until the new route and its protection requirements are reviewed.

The original CSRF check is recorded in `COMMENTS.md` Turn 89; Turn 90 records the later CORS policy, updated regression expectations and delivery status.

Reference: [OWASP CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
