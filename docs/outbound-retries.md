# Safe outbound retries

Released to production on 23 October 2026 at application commit `b050a89`. `COMMENTS.md` Turns 101–102 record implementation, checks and verified delivery.

## Policy

`shared/http/readRetry.ts` retries only body-free GET/HEAD requests at explicit data-access boundaries. The generic helper makes a single attempt for POST, PUT, PATCH, DELETE, OPTIONS or requests with a body. Neither global fetch nor the shared SSRF transport has an automatic retry loop, so retrying a browser API call cannot silently multiply server attempts.

By default, eligible new reads have two total attempts: the first call plus one retry. Backoff is exponential with equal jitter: half to all of the current ceiling, doubling on successive retries and capped by the configured maximum. Default ceilings start at 250 ms with a 2,000 ms cap; the first wait is 125–250 ms. Setting attempts to one disables automatic retries.

Transient HTTP statuses are 408, 429, 500, 502, 503 and 504. Other statuses, including bad credentials, ordinary client errors, redirects, 501 and 505, do not retry. Server `safeFetch` marks only recognized transient socket errors with a fixed, credential-free error class. SSRF/DNS refusals, certificate/TLS failures, invalid configuration and unclassified errors remain terminal. Browser fetch exposes transport/CORS/TLS failures together as TypeError; an opaque failure may therefore receive one default read retry even when it will not recover. No browser security check is bypassed.

`Retry-After` supports nonnegative integer seconds and HTTP dates, including legacy date forms. A valid hint is a minimum wait; it is never shortened to fit the cap. A hint exceeding the immediate retry wait cap returns the failed response to the existing caller/fallback. Invalid hints use ordinary backoff. This does not establish a shared cross-request/provider cooldown; normal polling is a separate operation with its existing interval.

Every helper call receives one existing cancellation/deadline signal covering all attempts, waits and subsequent body consumption. The deadline is not restarted on retry. Cancellation before/during backoff stops further attempts; an exhausted total timeout cannot retry. Failed response bodies are cancelled before a retry. A successful response is returned for the existing schema/parser checks: malformed JSON, HTML pretending to be an artifact, invalid schemas and partial success bodies are not replayed automatically. Body read failures after successful headers also do not enter this helper's retry loop.

The subsequent local [circuit breaker implementation](circuit-breakers.md) wraps selected provider operations around retries and validation. Open calls make no network request; recovery probes disable retries (and serialize collection pagination). See COMMENTS.md Turn 103 for delivery status.

## Call-site decisions

| Boundary | Behavior |
|---|---|
| Server LTA BusArrival / TrafficIncidents | Two attempts by default within the existing total 8-second provider budget, preserving live/simulated/unavailable distinctions. |
| LTA dataset pages | Existing three-attempt default now uses the common status/network classification, jitter, Retry-After and a total 15-second budget per page. Previously each attempt restarted that timeout. Existing page concurrency and warm dataset cache ownership remain. |
| Browser OneMap place search | Two attempts within its existing total 8-second budget; a superseded/cancelled search stops before another attempt. |
| Browser static route/index/network/shape data | Two attempts inside the existing per-fetch 10/20-second budget. Shared pending requests and successful parsed caches remain; missing/invalid data follows existing fallbacks. |
| Browser arrivals/weather/incidents and cold route API fallback | No new retry loop; existing polling/fallback and server retry ownership avoid amplification across layers. |
| Server NEA and direct browser NEA fallback | No immediate retry. Existing per-window reservations, partial/stale responses and later weather refresh handle recovery without exceeding the tight keyless/keyed budget. |
| Health probes | Single attempt, retaining diagnostic accuracy and the existing five-second budget. |
| Map image requests | Existing image deadlines and lifecycle cleanup; no new image retry storm. |
| CI deploy-hook POST | Single attempt; no automatic retry of a side effect. Its 10-second connect / 30-second total bounds remain. |

The offline Overpass interpreter is the explicit POST exception: the builder submits a fixed read-only OSM query, not a mutation. Its existing mirror/round retry owner was extracted to `server/overpassClient.ts`, rather than adding a generic retryable-POST switch. It retains at most the configured three rounds through mirrors, 330-second request allowance and 25-minute rebuild deadline. Inter-round ceilings now double with equal jitter, capped at 300 seconds. Valid Retry-After delays apply per origin, including alternate paths on that origin; an excessive hint is not shortened and can prevent another round before the deadline. Permanent HTTP/JSON/content-type/security errors disable that endpoint for the run, while other configured mirrors can still be tried. A per-request timeout may retry only while the independent overall rebuild budget remains. The CLI still validates the returned Overpass envelope before writing files.

## Configuration

All new settings are validated centrally and generated into `.env.example`. Invalid attempt counts, negative/fractional delays or base delays above caps fail before startup/build. The following attempt counts include the initial request.

| Variables | Defaults | Scope |
|---|---|---|
| `OUTBOUND_READ_ATTEMPTS`, `OUTBOUND_RETRY_BASE_MS`, `OUTBOUND_RETRY_MAX_MS` | 2, 250, 2000 | Server live LTA reads; server-only. |
| `VITE_READ_ATTEMPTS`, `VITE_RETRY_BASE_MS`, `VITE_RETRY_MAX_MS` | 2, 250, 2000 | Browser static data and OneMap search; public/build-time. |
| `LTA_PAGE_ATTEMPTS`, `LTA_PAGE_RETRY_DELAY_MS`, `LTA_PAGE_RETRY_MAX_MS` | 3, 500, 10000 | Dataset pages. |
| `OVERPASS_ROUNDS`, `OVERPASS_RETRY_PAUSE_MS` | 3, 60000 | Read-only offline query rounds; existing settings with revised jitter/backoff semantics. |

Timeout overrides and other provider budgets remain documented in [outbound-timeouts.md](outbound-timeouts.md). Defaults need no production environment change; public overrides require a rebuild.

## Verification and limits

Regressions exercise jitter/caps, selected status codes, socket classification and safe errors, seconds/date Retry-After, excessive hints, mutation/body refusal, attempt exhaustion, cancellation, total deadlines during attempts/waits, response-body cleanup, invalid response handling, LTA recovery and Overpass POST semantics/cooldowns/deadlines/permanent failures. Existing NEA budget and cache/coalescing regressions remain in the full suite.

A controlled Chrome fixture bundles the actual browser adapters at 375 px and 1280 px against local HTTP endpoints. A single 503 recovers for OneMap/network/routes/shapes with exactly two wire requests; overlapping network consumers share that retry sequence. Cancelled searches and a 120-second Retry-After make one request, and arrival API failures do not gain a browser retry. This verifies adapter behavior, not a new live deployment or a complete end-to-end production UI run.

Production release checks passed all APIs/health, 58 CORS checks and normal browser flows at 375 px and 1280 px, with the exact application assets and generated route/network data. Weather initially returned partial data and had no missing datasets on follow-up. The runtime error/fatal log query returned thirteen existing Node DEP0169 deprecation warnings only. No deliberate upstream failure or side-effect replay was induced in production.

References: [HTTP idempotency and automatic retries](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2), [Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3), [Fetch cancellation and body reading](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch), [Overpass interpreter read behavior](https://dev.overpass-api.de/overpass-doc/en/more_info/components.html).
