# Repeated-operation caching

This change targets repeated external reads and repeated static trip computation. Findings come from source inspection, controlled request counts and local CPU profiling; they are not production request-volume or billing measurements. Existing Vercel hosting, build-time route generation and the original OSM workflow remain in place. No background queue, external cache, new secret or database is required.

## Added caches

| Operation | TTL / bound | Key and invalidation |
|---|---|---|
| OneMap address/postal/landmark searches | 300 seconds; 64 LRU queries per browser client | Exact trimmed query; preserves case and meaningful text. Expiry, LRU eviction, `oneMapClient.invalidate(query)` / `invalidate()`, or a new page/client clears reuse. |
| Static trip planning | 300 seconds; 16 LRU plans per network object | Network identity/version plus exact origin/destination coordinates. New location/destination points select a different entry; rebuilt network objects cannot reuse the old network's plans, even with the same version string. TTL, LRU and `tripPlanCache.invalidate(network)` / `invalidate()` provide additional invalidation. |
| LTA incident-feed fetch and normalization | Existing `LTA_INCIDENTS_CACHE_SECONDS`, default 120 seconds; one feed per warm service owner | Immutable service configuration owns the feed. TTL, `service.invalidate()` or a new service/function instance invalidates it. Overlapping requests share admitted work. |

`VITE_PLACE_SEARCH_CACHE_SECONDS` and `VITE_TRIP_PLANS_CACHE_SECONDS` are validated public settings, defaulting to 300 and bounded to 0–1800 seconds. Zero disables settled reuse; search requests still share in-flight work. Zero for the existing incident TTL does the same. `.env.example` is generated from these defaults. Entry-count limits are internal bounded-memory policy, not deployment settings.

`shared/cache/ttlCache.ts` implements fixed completion-based expiry, LRU and explicit invalidation. Reads do not extend a deadline. Clock rollback invalidates a future-dated entry. `shared/cache/asyncCache.ts` adds synchronously reserved pending ownership, success predicates and caller-specific cancellation. Invalidating a running owner detaches/aborts it; even if an underlying loader ignores abort, its late completion cannot populate the cache or clear a replacement owner. Earlier subscribers may still receive that earlier completion if their own signal was not cancelled.

One cancelled search subscriber cannot abort another subscriber's request. If all leave, the shared request is cancelled and the last caller waits for the bounded loader's circuit/probe cleanup. Listeners are released on completion; an already-aborted subscriber cannot read a cached value. Search misses explicitly use HTTP `no-store`, so this application TTL/invalidation does not merely reveal another browser HTTP-cache hit. Circuit-breaker cooldowns remain in force: cache invalidation does not bypass them.

Only validated successes are stored. Empty successful search/incident lists are useful cacheable results. Malformed, HTTP/network failures and unavailable incidents remain immediately retryable under the existing circuit/retry policy. Cached result objects are treated as read-only by application consumers; live ranking and service selection continue to derive new objects rather than mutate static cached plans.

## Freshness across layers

Incident cache hits keep the original `fetchedAt`. The API subtracts that snapshot's age from the configured CDN freshness, rounding conservatively; it does not give an older memory hit another full 120 seconds at the edge. Invalid or future timestamps produce `no-store`. Existing stale-while-revalidate allowance remains explicit. The UI continues to use original provider timestamps and existing stale/error handling.

Static trip plans exclude live arrival waits and departure estimates. `useJourneyPlan` reuses route options while live ranking still runs against current arrivals. GPS points are not rounded to manufacture cache hits, preserving walking distances and boarding-stop choices. Existing destination-intent revisions still distinguish repeated user choices even when the static plan is reused.

Caches are in process/browser memory only. Search history is not added to localStorage, and cached plans disappear with their loaded network/page. Separate visitors, tabs, deployments, warm instances and clients do not share these new caches. No fleet-wide provider quota or global invalidation is asserted.

## Existing caches retained / work not cached further

- Full LTA stop/route/service datasets already have a 12-hour warm-owner TTL and shared pending load; deployment builds also produce static CDN route/network files.
- Browser route/shape success caches already have a five-minute TTL and bounded storage; route keys include requested generation. Immutable network transfer/service indexes already avoid repeated scans.
- Browser arrivals already share one pending request per stop and a 15-second live-success cache, with manual bypass and absolute-time aging. Their refresh timing is unchanged.
- Weather already has per-dataset TTLs, pending sharing, quota control and visible partial/stale results; no second blanket TTL was added.
- Loaded network indexes are already shared for a page lifetime. This change does not add a live network-refresh mechanism.
- Geometry projection measured below the trip planner in the sampled routes (roughly 0.05–0.08 ms to choose shapes, 0.22–0.44 ms for a leg slice). Nearest-stop/name lookups were also smaller. No extra cache was added to these solely to increase cache coverage.
- Health probes continue to check dependencies directly.

## Evidence and verification

On local data with 5,209 stops / 797 service directions, `npm run profile:lookups` now compares the indexed planner with cached repeated plans and asserts equivalent outputs. One same-run sample measured median 0.868 ms / p95 1.341 ms for indexed planning versus median 0.0005 ms / p95 0.000708 ms for a cached result (120 samples over eight origin/destination pairs). These are local Node CPU timings, not full app speed or browser/network latency; absolute savings are under a few milliseconds on this machine.

Controlled regressions show 20 simultaneous equal searches plus five repeated searches require one provider invocation, and 20 simultaneous incident reads require one. Expiry/invalidation starts a new invocation. Tests cover cache bounds, zero TTL, rollback, completion timestamps, malformed/failure recovery, cancellation isolation, invalidation during an old request, fresh edge headers, network/coordinate/version isolation and live trip ranking over static cached plans. The pre-existing OneMap transport test now verifies that completed subscribers release cancellation ownership; pending cancellation and cancelled-probe recovery remain covered separately.

Consult COMMENTS.md for actual final test/build/browser/security results and delivery status. The guide does not assert a production deployment or successful provider call.
