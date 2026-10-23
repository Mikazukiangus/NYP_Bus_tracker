# Outbound circuit breakers

Released to production on 23 October 2026 at application commit `63c82b3`. `COMMENTS.md` Turns 103–104 record implementation, validation and verified delivery.

## Boundaries selected

| Dependency | Why it benefits | Breaker owner and fallback |
|---|---|---|
| LTA BusArrival | Tracked stops poll every 15 seconds, with additional shared favorites/trip reads; repeated outages otherwise consume retries and provider timeouts. | One breaker per arrival service instance, shared across stop/service identifiers. Open calls use the existing explicitly simulated response; browser consumers continue to distinguish it from live data. |
| LTA TrafficIncidents | Repeated API reads during an outage otherwise keep retrying the same dependency. | A separate incident-service breaker; open calls retain the existing unavailable result/API handling. |
| LTA BusStops / BusRoutes / BusServices collections | A failed cold dataset load is not cached, so later route API calls can start another batch of provider requests. | One breaker per collection per LTA client, outside the complete paginated load and row validation. The dataset store retains its pending-request sharing and success cache. |
| NEA weather datasets | Repeated partial/stale snapshot refreshes can spend quota on an endpoint that remains down. | Twelve independent dataset breakers per weather service. Open datasets are filtered before quota reservation; valid cached readings/timestamps remain available with the existing stale/missing markers. Other datasets can still fill. |
| OneMap place search | New search text can repeatedly hit the same failed remote search service. | One breaker per browser search client, shared across query text. Local stop results remain usable through the existing search fallback. |

No second breaker was added around browser API polling: it would duplicate server ownership and could hide recovery. Static CDN artifacts already use coalescing, success caches, finite retries and fallback; they have no new breaker. Tile/logo loads retain image deadlines/cleanup; treating individual missing tiles as a whole-provider outage would need a separate image recovery design. Direct NEA browser fallback remains available rather than inheriting a server-instance outage decision.

Health probes deliberately bypass breakers and still inspect providers directly. The monthly deploy-hook POST stays single-attempt. Offline Overpass already has bounded mirror/round retries, per-origin Retry-After cooldowns and a rebuild deadline; a persistent interactive breaker adds little to that one-off job, so no new one was added there.

## Policy

The default is **three counted operation failures within 60 seconds**, followed by **30 seconds open**. A validated success resets failures. An open call fails immediately without network work. After cooldown, the next eligible call becomes the single half-open recovery operation; concurrent calls fail fast. There is no background probing timer. A successful validated probe closes the circuit; a failed probe opens it for another cooldown. These numbers are application defaults, not provider limits or measurements of production outages.

The breaker wraps the existing retry sequence and validation, so exhausted retries count as one failed operation. Half-open LTA live reads and OneMap searches make one attempt. A collection probe is one complete logical collection load, potentially multiple pages: it fetches serially without page retries, then validates all rows before closing. Ordinary closed-state page concurrency/retries resume after recovery. Failures on speculative pages beyond a known dataset end do not trip a successful collection load.

Counted failures include transient HTTP statuses 408/429/500/502/503/504, recognized transient server socket failures, dependency timeouts and invalid provider JSON/content types/schemas. The server transport still rejects SSRF/DNS/TLS violations; those refusals, ordinary 4xx errors such as 400/401/403/404, unclassified configuration errors and user cancellation do not advance the outage counter. A cancelled/neutral probe releases its slot without claiming recovery. Browser TypeError cannot distinguish transport/CORS/TLS failures and therefore uses the existing conservative opaque-failure classification. Requests with bad credentials remain visible failures; fixing credentials still requires configuration rather than waiting for a breaker.

Deadlines and caller cancellation remain attached through body reading. Invalid successful responses cannot close a probe. Generation tokens prevent responses admitted before an opening from closing the circuit or overwriting later recovery; already admitted work is not forcibly cancelled. Failure history is bounded, settings are copied/frozen and backward wall-clock movement cannot hold an open circuit indefinitely. Breaker-open and invalid-response log errors reduce to safe fixed kinds, without provider messages, causes, payloads, URLs or credentials. Repeated open live-service fallbacks do not emit an error log for every skipped call.

Existing `Retry-After` handling remains in the retry layer, with a separate cooldown policy for Overpass. This circuit policy is not a new global provider cooldown or rate limiter and does not promise to enforce a provider hint across independent logical calls. NEA's existing request-window reservations still apply independently; open/half-open-busy datasets consume no reservation. Cached/fallback responses are outside breaker success accounting.

## Configuration

`config/circuit.ts` generates settings in the single validated config and `.env.example`:

| Settings | Defaults | Bounds / scope |
|---|---|---|
| `LTA_CIRCUIT_FAILURES`, `LTA_CIRCUIT_WINDOW_MS`, `LTA_CIRCUIT_OPEN_MS` | 3 / 60000 / 30000 | Server-only; applied independently to LTA service/collection owners. |
| `NEA_CIRCUIT_FAILURES`, `NEA_CIRCUIT_WINDOW_MS`, `NEA_CIRCUIT_OPEN_MS` | 3 / 60000 / 30000 | Server-only; applied independently per NEA dataset. |
| `VITE_ONEMAP_CIRCUIT_FAILURES`, `VITE_ONEMAP_CIRCUIT_WINDOW_MS`, `VITE_ONEMAP_CIRCUIT_OPEN_MS` | 3 / 60000 / 30000 | Explicit public/build-time OneMap search settings. |

Failure thresholds accept integers 1–20; windows accept 1,000–600,000 ms and cooldowns 1,000–300,000 ms. Invalid values fail configuration validation. Defaults need no environment update; public overrides need a rebuild.

## Vercel and operational limits

State is in memory per warm service/client instance. Vercel functions, processes, regions and cold starts do not share counters; redeployment or restart clears state. Browser tabs/client instances are also independent. This reduces repeated work within an owner, not across the entire fleet. No Redis/database service, new credentials, public reset/debug endpoint, new HTTP response fields, monitoring configuration or continuous outage monitor was added. Shared fleet-wide admission would require an atomic shared-state design and separate failure/rate-limit decisions.

Admission in the closed state is not a bulkhead/concurrency limit: requests already running can finish while the circuit is open. A half-open collection probe may still take multiple page budgets within existing runtime limits. Low traffic with failures farther apart than the configured window may never open a breaker; that is intentional protection against treating isolated failures as a sustained outage. A user refresh does not bypass an open provider breaker.

## Verification

The regression suite covers failure windows/resets, fail-fast admission, one concurrent probe, failed/cancelled recovery, late completion races, clock rollback, timeout/HTTP/security classification, validation through body reading, retry counting, instance/endpoint isolation, serial collection probes, ignored speculative pages, invalid rows before indexing, NEA stale values/quota reservation and OneMap cross-query cancellation/recovery. Redaction and central settings are checked too.

A controlled Chrome fixture bundles the actual OneMap adapter, search application and local network at 375 px/1280 px. It verifies retry exhaustion, zero wire calls while open, one held recovery probe, recovery/local-stop preservation, malformed JSON reopening and actual browser fetch timeouts tripping a separate breaker. It uses an injected clock/short fixture timeout; production defaults are unchanged. This is focused adapter/application verification, not a new production deployment or full live UI run.

The state-machine approach follows [Microsoft's circuit breaker guidance](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker). Existing [retry](outbound-retries.md), [timeout](outbound-timeouts.md), [SSRF](ssrf-protection.md) and [redaction](../SECURITY.md) policies continue to apply.

Production release checks passed all APIs/health, 58 CORS checks and normal phone/desktop flows at 375 px/1280 px with the exact application assets. The guarded production build generated 601 services / 5,209 stops / 797 directions. Weather initially returned partial data and had no missing datasets on follow-up. The runtime warning/error/fatal query returned eleven existing Node DEP0169 warnings only. These normal-flow checks complement local breaker fault fixtures; no provider outage was induced in production.
