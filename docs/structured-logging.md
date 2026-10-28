# Structured JSON logging and automatic context

Local implementation, 28 October 2026. The user clarified that “user contacts” means **user context**. This follow-up is not committed or deployed yet; the prior centralized error-tracking release remains the live baseline.

The existing logger already emitted JSON, but ordinary info/warning records lacked request context. All shared server/build logging now uses one configured sink, and business APIs, the browser-report collector and the standalone Express server establish request context automatically. No new dependency, account, login, cookie, secret or environment setting is needed.

## Record shape

Each shared logger call emits one JSON object on one console line:

```json
{
  "service": "bustrackersg",
  "environment": "production",
  "release": "a5d169c",
  "request": {
    "id": "00000000-0000-4000-8000-000000000001",
    "method": "GET",
    "route": "/api/weather"
  },
  "user": { "kind": "anonymous" },
  "version": 1,
  "timestamp": "2026-10-28T00:00:00.000Z",
  "level": "info",
  "event": "http.request_completed",
  "details": {
    "statusCode": 200,
    "durationMs": 12.5,
    "outcome": "completed"
  }
}
```

`timestamp` is UTC ISO 8601. Service is fixed; environment/release come from the existing validated config and Vercel metadata. Existing `level`, `event` and `details` fields remain, preserving log searches. An exception's existing `details.context` and browser wire envelope remain compatible. Outside a request (startup/build work), `request` and `user` are explicitly null.

## Automatic propagation

- `security/log-context.ts` owns an immutable Node AsyncLocalStorage scope. The context follows awaited/nested work; concurrent requests have separate generated UUIDs. It never derives identity from `req.user`, cookies, query/body values or incoming user/request-ID headers.
- `security/logging.ts` resolves metadata at each log call and sends it through the existing credential redactor. `security/logger.ts` retains the caught-exception routing to the centralized reporter. Call sites only need `logger.info/warn/error('fixed.event_name', safeDetails)`.
- `server/http/logging.ts` wraps all five business API defaults via the existing error wrapper, and wraps the collector separately. Express middleware also covers transport/middleware errors and static/page responses; nested API wrappers reuse that scope instead of generating a second ID/listener pair.
- The generated ID is returned in `X-Request-ID`. It matches `request.id` on logs for the generating function invocation, and `details.context.requestId` on a newly emitted server exception. A CDN-cached API response can retain its original header without invoking the function again; use Vercel's platform request metadata to investigate that individual cache hit. This header is correlation only, not authentication or a browser/session identifier. Existing CORS grants are unchanged; same-origin clients can read it, while cross-origin exposure is not added.
- Request methods and routes have closed labels. Routes are fixed API names, the canonical label for the legacy arrival alias, or `other`. Queries, arbitrary paths/path parameters, full URLs, headers, request/response bodies, IPs, GPS and saved/search data are not copied into context.
- Each actual Node response produces one info-level `http.request_completed` record on finish/close with status, monotonic duration in milliseconds and completed/aborted outcome. It removes both listeners and retains the original request context even if another async scope emits the response event. Mocks/adapters without response events use a clearly labeled `handler_returned` fallback; unknown status is null rather than an invented success code.

Shared provider/cache work belongs to the request that starts that work; its coalesced waiters do not each produce a duplicate provider log. Every incoming HTTP response still has its own completion record. Scope propagation is local to that invocation/process; no distributed trace or persistent browser identity is introduced.

## User identity and privacy

The app has no accounts, authenticated sessions or contact database. Request logs therefore say `user: {kind: "anonymous"}`. No fingerprint, anonymous cookie or inferred account ID is created. An unauthenticated `X-User-ID`, request `user` object or browser-report field cannot become trusted identity. When login is introduced, populate an opaque server-verified account ID at the authenticated boundary; do not infer identity from client claims. This implementation adds no speculative authentication hook.

Browser reports keep `trusted: false` and their server-owned collector labels. Their payload cannot replace the collector's top-level request/user context; unknown identity fields are rejected by the existing strict ingress schema. Error text remains safe and references keep their existing meaning.

Configured secrets, authorization/cookies and raw error contents remain redacted. Contact/email/phone-named detail fields are also redacted as defense against accidental call-site metadata. This is not a general-purpose detector for arbitrary personal information inside free text: keep event names fixed and details allowlisted. Do not log entire request/config/provider objects. The logger emits a fixed JSON fallback if redaction fails, and swallows context/sink failures without recursively logging or changing the response.

## Scope and operation

Runtime/startup and route/shape build summaries use the shared envelope. Config-check output is structured as one safe status event. Existing pure tooling outputs (firewall JSON, HTTPS/profiler/secret-scan results and environment-example confirmation) remain standalone JSON results in their own CLI schemas; the example writer does not begin reading local credentials merely to print a confirmation. Node/Vite/npm/Vercel's own console output is outside this application logger.

A completion record is emitted for each function invocation/standalone response, including rejected requests. CDN-served API cache hits and static assets do not run this logger; platform access records remain independent. This adds routine info logs to the existing exception records. Use appropriate deployment/environment/time filters in Vercel runtime logs; retention/usage remain plan-dependent. The existing exception deduplication and `VITE_ERROR_TRACKING_ENABLED` switch concern exception reporting, not these request-completion records. No log drain, new alert, IP-rate-limit change or monitoring automation is created.

For diagnostics, copy `X-Request-ID` from a response and search `request.id`, then inspect its completion and provider/exception records. Existing error-reference searches still use `details.eventId`. Normal stdout carries info; stderr carries warnings/errors, with one JSON object per call. Build successes are now `build.routes_completed` / `build.shapes_completed` with numeric counts/bytes and fixed output-directory labels.

Regression coverage in `tests/structured-logging.test.ts` exercises concurrent info/warn/error propagation, immutable scopes, generated versus spoofed identity, collector trust boundaries, nested Express/API correlation, final middleware errors, finish/close deduplication and cleanup, aborted responses, safe JSON/redaction/sink failure and all six actual API defaults. Existing security tests still assert upstream bodies/raw errors never appear. No production request, provider outage or deployed-log verification is required for this local implementation.

The propagation mechanism follows Node's [AsyncLocalStorage documentation](https://nodejs.org/docs/latest-v24.x/api/async_context.html#class-asynclocalstorage).
