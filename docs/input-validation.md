# Input boundaries and validation

Implemented and verified live on 21 October 2026 in application release `fe8a857`. See `COMMENTS.md` Turn 85 for commit, deployment and verification details.

## Public HTTP APIs

Every handler calls the shared schema gate in `server/http/request.ts` before service, cache or provider work:

- `/api/bus-arrival` (also the existing `/api/BusArrival` alias): required `BusStopCode`, optional `ServiceNo`.
- `/api/bus-route`: required `ServiceNo`.
- `/api/weather`, `/api/health`: no query parameters.
- `/api/traffic-incidents`: optional bounded `limit`, `offset` and content `snapshot`; continuations require the first page's snapshot. No parameters retain the complete legacy feed. See [pagination](pagination.md).

Business requests accept **GET and HEAD only**, with no request payload. Approved CORS OPTIONS preflights return an empty 204 before service work; see [the CORS policy](cors.md). Unsupported methods return **405** and `Allow: GET, HEAD`; malformed query/body input returns **400**. These rejections use `Cache-Control: no-store`. Untrusted Origin-bearing requests now receive 403 through the shared CORS gate; ordinary OPTIONS without valid preflight metadata remains unsupported. The standalone server no longer parses unused JSON bodies before these gates. A malformed JSON POST is rejected as an unsupported method, and a GET with a declared/nonempty body is rejected without interpreting it. Serverless handlers apply the same checks independently of Express.

Stop codes remain five-digit strings, preserving leading zeros. Services accept up to six letters/digits, normalize whitespace/case and support the existing `busStopCode` / `serviceNo` aliases. Blank optional ServiceNo remains equivalent to no filter. Repeated parameters and multiple aliases for the same field are rejected, including identical duplicates. Arrays, nested values, unexpected query keys and disagreement between the raw URL and adapter-parsed query are rejected. Request targets are limited to 2,048 characters. Untrusted Host is not used for URL parsing.

Errors expose at most eight known schema paths, never supplied values, unknown field names, Zod error objects or parser snippets:

```json
{
  "error": "Invalid request.",
  "issues": [{ "path": "query.BusStopCode", "message": "Invalid or unsupported input." }]
}
```

Strict unknown-query rejection and the common error body are intentional contract changes. Existing valid GET requests, lower-camel aliases, optional blank filters and successful response formats remain compatible. Business APIs remain read-only. The separate anonymous `POST /api/client-errors` telemetry collector requires a strict browser-only envelope, exact Origin, JSON, no cookies/Authorization/query, an 8 KiB bound and a three-second stream deadline. Its preflight allows only POST and Content-Type; no credentialed CORS or business mutation is introduced. See [error tracking](error-tracking.md) for admission limits and trust boundaries.

## External data and UI boundaries

- **LTA arrivals:** retained the existing shared runtime wire validator on both server and browser, including empty slots, per-bus metadata, source and requested-stop identity. Health probes now use that validator too.
- **LTA datasets:** JSON page envelopes must contain a real value array, rather than treating missing/malformed value as an empty final page. Stop/route/service row schemas run before Maps or joins, checking identities, operators, directions, sequences, coordinates, distances and schedule formats. Unknown additive provider fields are stripped. Service metadata Direction remains optional because route rows own routing direction. Invalid loads are not cached. Existing builders still handle unavailable referenced stops according to their prior rules; this is not a new cross-dataset transactional guarantee.
- **Incidents:** both the provider envelope and public browser snapshot validate every row, coordinates, type/message, timestamp and source before incident mapping/UI work. A malformed batch becomes unavailable instead of mixing trusted and malformed rows; valid empty incident lists remain usable.
- **Weather:** each of the twelve NEA dataset families validates its envelope and nested input before normalization; normalized dataset schemas run before cache insertion. The browser validates the complete public snapshot, including timestamps, known dataset keys, rainfall-history lengths and consistency of present/missing/stale/fetchedAt fields. Direct-forecast fallback is validated too. Numeric provider strings are accepted only when wholly numeric and finite, avoiding parseFloat's acceptance of prefixes like `28bad`. Null station readings remain legitimate missing measurements. Invalid refreshes retain previously validated stale data; an initial failure remains missing. Ten actual public NEA payload families were inspected and accepted by their schemas.
- **OneMap:** validates the search query and response rows before title-casing/ranking. Malformed responses return unavailable and retain local stop-search results. Empty results remain valid. Coordinates are checked for Singapore; raw string fields cannot reach text functions as arrays/objects.
- **Generated artifacts/build inputs:** retained network, route and shape validators, added route-index validation and Overpass response/saved-file schemas before shape construction or output. Corrupt existing shape files are not reused as valid cache entries. No generated route/shape output was rewritten for this implementation.
- **Browser input/state:** invalid bus searches are rejected before changing tracking state or making requests; invalid/oversized place queries do not reach OneMap. Location candidates are validated before state changes, GPS coordinates/accuracy are validated before location or alarm calculations, and invalid positions do not ring alarms. Existing favorite/location/recent-place readers retain their legacy/versioned validators and recovery rules; writes now also normalize locations and filter invalid recent places. Intentionally empty saved lists remain empty.
- **Environment/cookies:** existing centralized environment/HTTPS validation and the fixed secure-cookie helper remain in place. These were already validated input boundaries and were not replaced by a second configuration system.

New declarative schemas use pinned **Zod 4.6.7** through `shared/input/zod.ts`, configured with `jitless: true` before schema construction. This avoids CSP eval capability probes and generated functions; no `unsafe-eval` or other CSP relaxation was added. An architecture guard prevents direct Zod imports from bypassing that entry point. Existing pure handwritten parsers remain where they already provide the contract. Pure domain rules still do not own HTTP/storage access.

## Verification and limits

All 178 tests pass after release corrections, including guards for explicit production ESM import extensions and the legacy arrival URL rewrite. The new regressions exercise every API with unsupported methods, malformed bodies and unknown/repeated/array/nested/conflicting queries, asserting rejection before provider calls and safe diagnostics. Other checks cover broken LTA pages/rows with retry recovery, incident batches, raw/normalized weather and stale caches, OneMap/search bounds, route assets, GPS/storage and malformed Overpass CLI input before output. Existing tests were updated to use valid HTTP methods and complete weather fixtures; an invalid incident row is now rejected by the new boundary rather than silently filtered by mapping logic.

Production-build HTTPS fixtures at 375 px and 1280 px verify valid requests and the app's trip/map, saved-location, route-race and map-cleanup flows. Wire checks exercise malformed JSON POST/GET bodies on all five endpoints and verify no extra provider requests, plus working HEAD/legacy aliases. Malformed weather/incident browser responses recover through validation/fallback without page errors; invalid bus input makes no request. Explicit policy listeners and Chrome audits check that validation runs without CSP violations. No provider or request values are logged in validation errors.

Runtime schemas add browser code: the measured application bundle grew from 250.71 kB / 72.09 kB gzip to approximately 346 kB / 99 kB gzip in the initial build. React/CSS remain separate and Leaflet remains lazy. These are artifact sizes, not measured phone latency. Validation does not replace authorization, rate limits, TLS, framework request framing or upstream service availability. Developer-only diagnostic tools' internal reports are outside the application's request/data contracts.

See `COMMENTS.md` Turn 84 for final actual test/build/browser/secret-scan results and delivery status. Schema API reference: [Zod documentation](https://zod.dev/api).
