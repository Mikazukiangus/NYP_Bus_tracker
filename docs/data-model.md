# Data model

The app uses provider APIs, generated JSON, in-memory indexes and browser storage. It does not require a SQL database. Provider wire records, canonical models and prepared display records remain separate.

## Stops and route visits

`PhysicalStop` owns the five-digit string code, name, road and coordinates. Codes retain leading zeros. `BusStop` is the flattened public route-stop view: its timetable and cumulative route distance belong to that visit, while user-relative distance is a presentation value.

Canonical `RouteStopCall` records have a `call` reference containing:

- `patternId`: canonical service number and direction, such as `11:1`.
- `stopCode`: the physical stop being visited.
- `sequence`: the provider sequence when supplied, otherwise the legacy file's one-based position.
- `occurrence`: which visit to this physical stop within this pattern, starting at one.
- `datasetVersion`: the generation identifier when available.

The route parser normalizes older public JSON into `NormalizedBusRoute`, whose stops always have these references. Selecting stops, boarding trip legs, slicing road geometry and creating alarms preserve the occurrence. Repeated stops are valid and must not be deduplicated. When resolving a saved favorite against an updated route, use pattern/stop/occurrence, rather than a stale array position. The provider does not supply a durable stop-call ID; occurrence is a best available reference, not a guarantee that a changed route has identical semantics.

Network array indexes remain local to one loaded network. Planned legs retain their source dataset generation. Loading an incompatible route for those legs fails safely rather than combining stop sequences from different generations. Older static route files use their `generatedAt` as the version fallback. Independently sourced OpenStreetMap shapes are validated and retain the existing geometric fit checks; they do not pretend to share an LTA dataset version.

## Boundary validation and versions

`shared/transit/parsers.ts` validates network references, unique stop codes/pattern keys, coordinates, directions, array lengths and nonnegative hop distances. Route readers check the requested service, geometry, timetables and version compatibility. Shape readers check the envelope service and each nested geometry record. Invalid data never becomes a successful cached network or route.

New generated network, route and index files include `schemaVersion: 1`, `datasetVersion` and `generatedAt`. The generation timestamp identifies a bundle; it is not a content hash. Readers accept legacy files without an explicit schema version, validate their contents, and normalize service-number case. The build writes one generation identifier throughout the bundle. Adding these fields does not require rebuilding all existing files before the new reader can run.

## Arrival estimates and snapshots

Each decoded estimate retains `estimatedArrivalAtMs`, per-bus origin/destination codes, provider visit number and monitoring state. Coordinates are validated and retained as a pair; blank/zero provider placeholders become `position: null`. Compatibility `lat`/`lng` fields are populated together only for a real pair. Monitoring is `live`, `scheduled` or `unknown`; the compatibility boolean is omitted for unknown tracking.

`estimatedMinutes` is a prepared value derived from the arrival instant and an explicit current time. Polling owners age their snapshots between requests and preserve object references when displayed minutes have not changed. A primary snapshot carries the requested stop, receipt time, source and an explicit available/unavailable result; loading is tracked by its application owner. Empty live services and empty next-bus slots remain valid. Network/invalid/simulated failures remain distinct in the client result, while the UI retains its clearly labelled sample-time fallback.

The three provider arrival slots remain a wire contract. A service-wide destination is not inferred from the first slot; each bus carries its own destination. Provider `VisitNumber` is not assumed to equal route sequence or occurrence. A response does not supply a stable vehicle ID: map IDs identify slots and must not be used for vehicle-history joins. Per-bus metadata is retained for future route matching, without claiming that every arrival can already be matched unambiguously to a route visit.

Shared load/type/operator unions define the vocabulary. Route models preserve `rawCategory`; unfamiliar provider categories display as `Other` instead of being silently reclassified as Trunk.

## Favorites and label snapshots

A favorite means a service at a physical stop, in one direction and occurrence. Equality uses canonical uppercase service number, stop code, direction and occurrence. An absent occurrence on a legacy favorite means the first visit. Existing IDs are retained where unique; duplicates are repaired and duplicate logical favorites are collapsed deterministically.

The existing storage key remains `sbs_transit_favorites_v1`. Its new value is an envelope with `schemaVersion: 2` and an `items` array. Each stored item has identity fields, `savedAt` (Unix milliseconds) and one `labelSnapshot` containing stop name, road and destination. Flat display labels are reconstructed by the reader, not stored a second time. The UI resolves current stop/terminus labels from the loaded network, with that snapshot as its offline fallback.

Readers accept legacy flat arrays without writing during React initialization. The next explicit save emits the new envelope. A valid empty array/envelope stays empty. Invalid individual rows are filtered; an unsupported envelope version is rejected without a read-time overwrite. Denied reads/writes preserve the existing recovery behavior and in-memory use. These records remain local to the browser: versioning does not add account synchronization.

## Locations and recent places

Locations use `source: gps | selected-place | default`, independently of place kind. GPS fixes retain `capturedAtMs` and usable accuracy. Explicit selections retain `selectedAtMs`. Structured `placeRef` records preserve a provider ID and explicit stop/postal codes when supplied. Display subtitles are never parsed to recover these references.

The existing location and recent-place storage keys remain unchanged. New writes use `{ schemaVersion: 2, location }` and `{ schemaVersion: 2, places }`. Readers accept legacy records and recent-place arrays. Legacy `isSimulated: false` maps to GPS; true maps to a selected place. An old GPS fix has unknown capture time, rather than an invented migration timestamp. Current code no longer uses that overloaded flag.

The application still restores the last selected place or saved GPS fix and accepts a fresh GPS fix under the existing cancellation/revision guard. Legacy recent places that never stored a provider reference retain their original identity/name/coordinates; missing source data is not fabricated. Recent IDs are deduplicated on read.

## Verification

Turns 74 and 77 in `COMMENTS.md` record actual checks for the model and lookup/request-cache implementations. Runtime regression tests live in `tests/data-model.test.ts`. The dated findings and their original evidence remain in `MODULARITY_REVIEW.md` for context; this document describes the implemented model.

## Lookup profile — 21 October 2026

There is still no SQL database, SQL workload or database slow-query log in this repository. No SQL indexes or DDL are applicable. This investigation measured the actual local functions and tested candidate **in-memory** indexes without modifying application code. The [recorded measurements](lookup-profile-2026-10-21.json) include the dataset, scenarios and sample counts. Run `npm run profile:lookups` with generated `public/bus-routes/network.json` present to repeat the investigation. The script performs no network requests and deletes its isolated prototype module afterward.

### Measured local work

On Node 24.19.0, with 5,208 stops and 798 patterns from the local 10 October snapshot:

- `planTrips`: median **3.581 ms**, p95 **4.872 ms**, over 120 individual calls across eight origin/destination scenarios. A second baseline measured 3.578 ms median, guarding against a simple warmup/order explanation.
- `nearestStops`: median **0.172 ms** across the 20 preset locations.
- `searchStops`: median **0.189 ms** across eight code/name/absent queries; exact five-digit lookup through the current scan costs about **0.0106 ms**.
- `favoriteLabels`: median **0.0604 ms** for 20 favorites spread across the network. This is not a user-visible bottleneck at the current scale.

The planner uses individual timed calls. Shorter operations use batches of 10 or 100; their reported p95 values describe per-batch averages, not individual-call tail latency. These are warmed local CPU timings, not phone/browser timings, network latency or production traffic measurements.

### Exact index recommendations

1. **First optional addition: transfer-neighbor results scoped to one network instance.** In `findTransfers` (`src/services/tripPlanner.ts`), `neighbourCache` is rebuilt for every planning call, even though the stop coordinates and the 200 m transfer radius have not changed. Keep a lazy index owned by the loaded network, with the conceptual shape `Map<radiusM, Map<stopIndex, readonly { index: number; distanceM: number }[]>>`. A `WeakMap<BusNetwork, ...>` also gives correct lifetime/invalidation when the dataset changes. Populate each missing entry using the existing geographic grid. Do not share stop indexes between network versions or discard multiple visits to a stop.

   A temporary equivalent prototype retained the fixed 200 m neighbor lists between plans. Warm median fell to **0.859 ms**, p95 **1.320 ms**: about 4.2 times faster in these scenarios. Eight warm scenario outputs and 24 fresh-network outputs matched the current planner exactly. The warmed prototype cached 1,929 stop keys and 5,362 neighbor entries. A fresh-network first call was **4.229 ms** median, so the benefit is reuse, not faster cold initialization. Current local plans already take only a few milliseconds; add this if optimizing repeated replanning, rather than treating it as an urgent latency fix.

2. **Small optional addition: `byServiceDirection`.** Build `Map<string, NetPattern>` once in `buildBusNetwork`, keyed by `${serviceNo.toUpperCase()}:${direction}`. Use it in `favoriteLabels` in place of a full `network.patterns.find` for each favorite. The existing parser guarantees unique service/direction pattern keys. The equivalent prototype reduced the 20-favorite label pass from **0.0604 ms** to **0.00108 ms**, with identical results; the absolute saving is small. This map has 798 entries for the measured snapshot. It does not replace stop-occurrence references.

3. **Reuse an existing index for exact codes.** For an exact five-digit stop query, use `net.byCode.get(query)` and wrap a found stop in the expected result array. Retain prefix/name/road search behavior for other input. No new stop-code index is needed. The existing `byCode`, `patternsAtStop` and geographic `grid` already cover exact stop identity, stop-to-pattern joins and nearby lookup. The measured search cost does not justify a new full-text/trigram/spatial database index.

### Most frequent scheduled data requests

Source inspection identifies `/api/bus-arrival?BusStopCode=...` as the shortest recurring polling schedule. With the defaults in `config/public.ts`, the tracked-stop owner schedules another request 15 seconds after completion, favorites poll every 30 seconds while enabled, and trip boarding stops schedule another request 30 seconds after completion. Each multi-stop owner deduplicates its own list, but the three owners do not share an in-flight request or freshness cache.

For one browser, this is approximately four tracked-stop requests per minute plus two per distinct favorite stop while its view is enabled and up to two per distinct trip boarding stop while a destination is active. Initial requests and manual refreshes are additional, and response time reduces the completion-based rates. These are configured schedules, **not observed production counts**. CDN caching can reduce provider/origin calls further; client requests and LTA calls must not be equated.

The appropriate first investigation for request frequency is a shared arrival repository keyed by the five-digit stop code, coalescing in-flight requests and reusing a still-fresh live snapshot across tracking/favorites/trips. Preserve explicit manual refresh, source/error distinctions and configured freshness. SQL indexes cannot reduce provider HTTP requests. Production request counts and latency rankings would require production telemetry; none was queried or fabricated for this local investigation.

### Status

Only the profiler, its package command, this guide and recorded results were added for this investigation. Candidate indexes ran in an isolated temporary module and have **not** been added to the app. TypeScript and the six architecture checks pass; the profiler asserts candidate output equivalence. No application build, browser checks, provider calls, deployment or database changes were required for this profiling-only turn. Turn 76 of `COMMENTS.md` records delivery status.


## Implemented lookup and request optimizations — 21 October 2026

The preceding Turn 76 profile is the pre-change investigation. Its proposed optimizations are now implemented locally; the original measurements remain available as a baseline. The [post-change profile](lookup-profile-2026-10-21-after.json) compares the implemented planner with the preceding per-plan neighbor-cache algorithm in an isolated temporary module. `npm run profile:lookups` now performs that comparison and verifies equivalent trip/label results.

### Network-owned indexes

- Every loaded network owns `byServiceDirection`, keyed by canonical service number/direction. Saved-label resolution uses this map instead of scanning all patterns. It preserves separate direction records and current labels/offline fallbacks.
- `transferNeighboursByRadius` is a lazy `Map<radiusM, Map<stopIndex, readonly TransferNeighbour[]>>`. Trip planning uses the existing spatial grid to fill each missing neighbor list once, then reuses it across subsequent plans and access-radius passes. A new network object has a new cache, even if its generation label matches another object's. Existing loop occurrences and route sequences remain unchanged.
- Exact five-digit stop searches now use `byCode`. Prefix, name and road searches retain their previous matching/order/limit behavior.

For the same local 5,208-stop / 798-pattern snapshot, the implemented warm planner measured **0.882 ms median / 1.338 ms p95**, versus **3.539 ms / 5.092 ms** for the uncached comparison. A second baseline was 3.580 ms median. First use on fresh networks was 4.112 ms median; this optimization benefits reuse, not cold initialization. The measured scenarios populated 1,929 stop keys / 5,362 neighbor entries, plus 798 service/direction entries. Eight warm and 24 fresh-network plan outputs matched the comparison exactly. Label resolution for 20 spread favorites measured 0.00118 ms median versus 0.0594 ms with scanning. Exact-code timings are microbenchmarks with tiny absolute costs and should not be interpreted as user-visible speedups.

### Shared arrival requests

`src/features/arrivals/data/arrivalRepository.ts` owns the shared browser request/freshness cache. Tracking, favorite and trip-stop polling all use it; a dependency test guards those imports. The HTTP client remains an uncached validation/transport boundary, rather than owning application cache state.

Keys are trimmed five-digit stop-code strings, preserving leading zeros. Requests for the same stop coalesce onto one pending promise. A validated live snapshot, including a legitimate empty service list, is reusable for the configured tracked-arrival interval (`config.polling.arrivalsSeconds`, 15 seconds by default). Freshness is measured from the original receipt time and is never extended by cache reads. Each consumer derives current countdowns from the original absolute arrival instants. There is no new browser storage key or environment variable.

Manual refresh bypasses a settled fresh snapshot and requests `cache: no-store` from the transport. It joins an already-running request for that stop rather than creating an overlapping request. Forced refresh applies only to the user action, not subsequent polls or stop changes. Starting a new request removes the previous settled cache entry. Simulated, malformed and network-error responses are never retained as a successful settled cache entry, so another owner can retry immediately. Wrong-stop loader results also fail safely. One owner's cleanup cannot abort a request another owner is sharing; the transport still enforces its existing timeout.

The live cache retains at most 128 recently used stops (an internal memory policy, injectable for tests); pending requests are held separately and are not evicted by that limit. Repository instances are isolated. Favorited-stop polling now schedules after completion, like tracking/trip polling, preventing overlapping refresh rounds during slow responses. Existing enable/disable rules, cancellation guards, last-received timestamps, live/sample labels and configured intervals remain in place. The repository coalesces reads but is not a subscription store: a consumer already showing a snapshot receives newer data on its own next poll/read, rather than receiving push notifications.

Controlled browser checks at 375 px and 1280 px verify a tracked stop, favorite and trip boarding stop using one request; a trip owner joining a pending manual refresh; explicit refresh bypassing fresh data; malformed-data sample fallback without cache poisoning; immediate retry; and returning to a fresh stop after a manual refresh without forcing another request. These are local fixture results, not production traffic or LTA-origin request counts. Original trip/map/storage/GPS/race regressions also pass at both widths.

Turn 77 in `COMMENTS.md` records final tests, build/scan results and delivery status. No SQL database or SQL indexes were introduced.
