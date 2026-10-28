# Centralized error tracking with Vercel logs

The user selected the existing Vercel runtime logs, with no additional account. Application commit `5ae30032efe2d4c27dcd4d6c0c15994f0eea227f` is deployed and verified live; see the production verification below. No Sentry project, SDK, secret, log drain or scheduled GitHub job is required.

Released follow-up, 28 October (9c69da4): [structured logging](structured-logging.md) supplies automatic top-level request/user/release context and response-completion records across ordinary logs and exceptions. It preserves this collector's strict wire schema and untrusted browser marker. Request IDs now come from the shared logging scope; the exception's nested request ID and error-reference format remain compatible. This follow-up is deployed and verified; see its guide and COMMENTS.md Turn 130 for the delivery evidence.

## Capture and recovery

- `shared/errors/events.ts` owns the strict versioned envelope, exception classification, safe stack-location extraction, deduplication and bounded reporting policy.
- `server/errors/reporting.ts` wraps all five business API defaults. Unexpected throws/rejections become a no-store HTTP 500 with a fixed message and, when captured, an `errorId`. Headers already sent are closed without appending error details. Generated request context uses AsyncLocalStorage so overlapping requests cannot exchange route/method/request IDs. Caller-supplied IDs and URLs are not copied into reports.
- The existing server logger forwards known caught provider/startup exceptions into the same reporter. Weather reports keep an allowlisted dataset name. Fixed HTTP/validation/probe warning records retain their existing safe format. Express's final error middleware covers failures outside a wrapped API. Public health output remains minimal.
- `src/features/errors/reporting.ts` catches global browser errors and unhandled promise rejections. React root callbacks and `ErrorBoundary.tsx` capture render/recoverable failures. Arrival, incident, weather, route and place-search adapters also report caught exceptions while keeping their existing fallback behavior. Intentional aborts are ignored; expected GPS/storage denial and ordinary non-2xx responses continue through their existing feature notices/server diagnostics.
- A failed render shows a safe reload screen. Unhandled asynchronous failures show a dismissible notice; usable app state remains visible. Both show only the fixed message and generated reference. No `error.message`, stack, component stack or provider body is rendered. Existing explicit stale/partial/simulated-data notices remain.

Example user-facing unexpected response:

```json
{
  "error": "Something went wrong. Please try again.",
  "errorId": "00000000-0000-4000-8000-000000000001"
}
```

Handled provider failures retain their existing public contracts; they do not all become HTTP 500. The reference is an opaque correlation value, not authorization or proof of delivery.

## Log envelope and privacy

Server reports are one structured JSON console record with `event: "errors.exception"`; validated browser submissions use `event: "errors.client_exception"`. Both pass through the existing credential redactor. An abbreviated record:

```json
{
  "level": "error",
  "event": "errors.exception",
  "details": {
    "version": 1,
    "eventId": "00000000-0000-4000-8000-000000000001",
    "source": "server",
    "timestamp": "2026-10-24T00:00:00.000Z",
    "environment": "production",
    "release": "a21d7e2",
    "context": {
      "operation": "server.request_failed",
      "route": "/api/bus-arrival",
      "method": "GET",
      "requestId": "00000000-0000-4000-8000-000000000002"
    },
    "exception": {
      "type": "TypeError",
      "frames": [{ "file": "api/bus-arrival.ts", "line": 30, "column": 9 }]
    }
  }
}
```

Context operation/route/method/dataset, exception type and file labels come from fixed allowlists. Up to eight known file labels and numeric positions survive stack extraction; all raw stack/function names, absolute paths, hostnames and queries are removed. Hashed browser bundles map to fixed labels such as `assets/app.js`; release plus line/column identifies the build. Unknown frames are discarded. Only a typed `DependencyHttpError` can add `exception.httpStatus`.

No raw messages/causes, request/response bodies, headers, IPs, cookies, user agents, current page URL, GPS, saved locations or search text are included by this application reporter. Configured credentials are redacted again at the final server sink. These controls concern application-generated records: Vercel's own request metadata, infrastructure errors and pre-existing logs have independent retention/privacy policies.

Browser records additionally have `trusted: false`, `collectorEnvironment` and `collectorRelease` set by the server. Every client-supplied field, including release, timestamp and reference, is untrusted. Origin checks limit browser use; they do not authenticate a sender or stop an HTTP client from forging an allowed Origin. Never use browser telemetry as an authorization, billing or audit source.

## Collector boundary and resource limits

`POST /api/client-errors` is a separate anonymous telemetry endpoint. Business endpoints remain body-free GET/HEAD APIs.

The collector requires an exact configured Origin, application/json (optional UTF-8 charset), no query parameters, no cookies/Authorization, no compressed body and the strict browser-only envelope. No wildcard origin or credentialed sharing is enabled. POST preflight permits only Content-Type. Standalone development additionally allows HTTP loopback origins; production and Vercel do not acquire that exception. Split frontend/API hosting needs the frontend in the existing exact CORS configuration and compatible CSP.

The application accepts at most 8 KiB, reads streams with a three-second deadline, and rejects unknown fields/oversize/malformed payloads before logging. Pre-parsed serverless bodies are size-checked again; the hosting platform may parse/reject bodies before application invocation. Rejections have fixed bodies and no-store caching. Empty 204 acknowledges accepted, duplicate or disabled reporting; no detail is echoed.

Each browser allows ten distinct exception groups per minute and one queued sender, with at most ten queued records. Each warm server reporter emits at most 100 distinct groups per minute. Same-object errors and equivalent operation/route/dataset/type/frames share a reference for one minute; they are not occurrence counters. Clock rollback resets the window. The collector reserves 100 admissions per warm owner per minute before asynchronous reads, including invalid submissions, and deduplicates event IDs within that window. Its 429 includes Retry-After: 60. All these memory limits are protective local budgets, not distributed per-IP enforcement or durable storage.

The browser uses a two-second delivery deadline by default, credentials omit, no-referrer, no-store and redirect rejection. It makes one attempt, releases response bodies and never reports telemetry transport failures. Pending requests can be lost on page exit, offline use, CSP/ad blockers, a function restart or budget exhaustion. There is no local persistent queue, replay or recursive retry. Sink failure cannot replace the original application error.

`config/firewall.ts` generates the shared 600/60 per-IP rule with a second OR group matching exactly POST `/api/client-errors`. Other writes and OPTIONS remain outside it. **The user authorized publication separately: active firewall version 6 now matches this policy, with no pending draft.** The MCP read/update operations returned 404; the documented authenticated CLI fallback staged and published exactly one rule update. Full readback confirmed the generated rule and unchanged remaining settings; six low-volume production page/request/CORS checks passed. No threshold burst was performed. The application collector was subsequently deployed and verified in release 5ae3003; firewall publication and application deployment remain separate operations. Future changes still require inspecting/reviewing the current draft before publication. See [rate limiting](rate-limiting.md).

## Configuration and operation

The generated `.env.example` includes:

- `VITE_ERROR_TRACKING_ENABLED=true`: public opt-out for exception capture/collection. Rebuild the client and update server environment together when changing it.
- `VITE_APP_RELEASE`: optional public Git SHA, defaulting to `VERCEL_GIT_COMMIT_SHA` on Vercel or `local` elsewhere. Leave the override unset to use platform metadata; copying the example's explicit `local` value pins that label until removed.
- `VITE_APP_ENVIRONMENT`: defaults to `VERCEL_ENV`, then `NODE_ENV`, then development. Leave the override unset for platform labeling.
- `VITE_ERROR_REPORT_TIMEOUT_MS=2000`: bounded single-attempt browser delivery deadline.

No production setting is required when Vercel metadata is available. Browser values are intentionally public; never put secrets in these fields. Reporting is enabled for development too, where records appear in the local Express console rather than Vercel.

After deployment, open the [project runtime logs](https://vercel.com/carbon-bc04/nypbus-tracker/logs), select the relevant deployment/environment/time window and search for the displayed reference (`eventId`) or `errors.exception` / `errors.client_exception`. Use operation, release and safe frame positions to reproduce the problem in that revision. Treat browser-only evidence as untrusted and correlate with server failures before acting. Do not induce an outage on real users to test reporting.

Vercel [runtime logs](https://vercel.com/docs/logs/runtime) collect function console output. Availability/retention follow the hosting plan; this implementation does not configure durable issue grouping, alert notifications or continuous monitoring. Local grouping only suppresses bursts. If longer history or alerts become necessary, choose that separately instead of assuming this provides them.

Tests: `tests/error-tracking.test.ts`, `tests/error-ingestion.test.ts`, existing HTTP/security/CSRF/config tests and firewall-policy tests. Controlled Chrome phone/desktop fixtures exercise actual React fallback/notice components and the real collector, including failed delivery; no production crash is needed. React integration follows [root error callbacks](https://react.dev/reference/react-dom/client/createRoot) and [error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary).


## Verified production release — 25 October 2026

Application commit `5ae30032efe2d4c27dcd4d6c0c15994f0eea227f` is pushed to main. Git-triggered deployment `dpl_CrJzseLPft2heHy2pnJz6EZUBam6` reached READY at that exact SHA with the live domain assigned. All 317 tests and release checks pass; production assets match a local build using the same public release/environment metadata. The existing guarded build generated 601 services, 5,209 stops and 797 directions.

Sixteen live collector checks pass, including a valid empty 204, exact POST preflight, rejected unknown fields/server source/request ID, unapproved or absent Origin, cookies/Authorization, forms, query input, 8 KiB overflow and malformed JSON. At 375 px and 1280 px, isolated synthetic unhandled rejections trigger the actual deployed reporter and safe dismissible UI. Each sends one accepted report with no Cookie/Referer content, raw test message, page exception, console leak or app cookie. The displayed references plus an API-generated report correlate to Vercel runtime records with the expected release/environment and `trusted: false`; server-owned collector labels also match. The first live fixture incorrectly distinguished an empty browser header value from an absent value; corrected that fixture and reran successfully. No application correction was required.

Existing production phone/desktop trips, journey maps, tiles/local CSS, saved buses, persisted location/reload and map cleanup pass, along with 58 business-API CORS checks and real 20-record/two-page incident traversal with content-fingerprint verification. A bounded deployment log query found existing DEP0169 warnings, expected synthetic reports and two natural NEA rainfall HTTP 404 reports with safe operation/dataset/request/frame context. Weather initially had seven missing datasets; follow-up is complete. No production crash/provider outage or IP-limit threshold burst was induced. The earlier controlled local render/failure-delivery tests remain complementary evidence; this release does not create continuous monitoring or alerts. See COMMENTS.md Turn 128 for actual delivery status and remaining dependency maintenance.
