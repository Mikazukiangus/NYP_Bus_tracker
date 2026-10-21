# Repeated-request review — 21 October 2026

This Turn 78 review covers browser fetch clients and callers, server provider clients, dataset joins and generation scripts. There is no SQL driver/ORM or SQL relationship to eager-load. The original examples below describe the proposal; the [implementation follow-up](#implementation-follow-up--21-october-2026) records the installed behavior and current validation.

## 1. Share route and shape requests across consumers

[`useJourneyGeometry`](../src/features/journey/useJourneyGeometry.ts) fetches a route and shape for every selected leg. [`useTrackedRoute`](../src/features/tracking/useTrackedRoute.ts) independently fetches both for the tracked bus. [`selectTrip`](../src/features/journey/useJourneyPlan.ts) starts tracking the first leg while selected-trip geometry loads. The [route](../src/features/tracking/routeRepository.ts) and [shape](../src/features/tracking/shapeRepository.ts) repositories do not share per-service requests.

For successful static-file loads with `L` legs, these consumers can issue `2L + 2` fetch calls. Trips currently have one or two legs, so this is bounded duplication rather than an unbounded database N+1. A direct trip can request the same two files twice; a two-leg trip using different services can make six fetch calls for four distinct resources. Fallback attempts can add requests. HTTP caching may reduce bytes/origin work; these are JavaScript fetch counts, not provider-origin counts.

Put shared loaders in the data layer and make both consumers use them. Canonicalize service numbers. Key routes by service **and expected dataset generation**, preserving current validation. Shapes can share by canonical service within the current artifact lifetime; retain `applyRouteShapes` matching checks.

This minimal proposal shares pending work and removes settled entries. It reduces overlapping calls; sequential revisits need a separate bounded success cache with explicit expiry/invalidation.

```ts
// Proposed data-layer module, alongside the existing repositories.
import { fetchBusRoute as loadRoute } from './routeRepository';
import { fetchRouteShapes as loadShapes } from './shapeRepository';

function sharePending<T>(
  pending: Map<string, Promise<T>>, key: string, load: () => Promise<T>,
): Promise<T> {
  let work = pending.get(key);
  if (!work) {
    work = Promise.resolve().then(load).finally(() => { pending.delete(key); });
    pending.set(key, work);
  }
  return work;
}

const routes = new Map<string, ReturnType<typeof loadRoute>>();
const shapes = new Map<string, ReturnType<typeof loadShapes>>();
const canonical = (service: string) => service.trim().toUpperCase();

export function getRoute(service: string, expectedVersion?: string) {
  const code = canonical(service);
  return sharePending(routes, JSON.stringify([code, expectedVersion ?? null]),
    () => loadRoute(code, expectedVersion));
}

export function getShapes(service: string) {
  const code = canonical(service);
  return sharePending(shapes, code, () => loadShapes(code));
}
```

Keep cancellation local so one view cannot abort another's shared work. If adding settled caching, retain only validated successes, bound entries and preserve dataset-generation checks. The current shape loader returns `[]` for both valid empty shapes and failed requests: introduce a tagged result before caching empty arrays as success. Avoid retaining failures that prevent recovery. A bounded success cache also covers cases where React schedules the second consumer after the first request settles.

## 2. Eager-load independent resources for selected legs

Legs in `useJourneyGeometry` already run concurrently, but each waits for its route before starting its independent shape request. Start both together to remove this waterfall. `Promise.all` alone does **not** reduce request count; combine it with shared loaders.

Replace the per-leg loader with this outline, retaining the effect's existing active/key guards and ordered assignment:

```ts
const legs = await Promise.all(selectedTrip.legs.map(async (leg) => {
  const [result, shapes] = await Promise.all([
    getRoute(leg.serviceNo, leg.board.call?.datasetVersion),
    getShapes(leg.serviceNo),
  ]);
  if (result.status !== 'ok') return null;
  const route = applyRouteShapes(result.route, shapes);
  const direction = leg.direction === 2 && route.direction2
    ? route.direction2 : route.direction1;
  return legPath(direction, leg.board.code, leg.alight.code,
    leg.board.call, leg.alight.call);
}));
```

Identical service/version requests share pending promises. Each leg retains its direction, boarding/alighting occurrence and output position. Preload only selected-trip services, rather than every candidate/all services. Parallel loading can fetch unused shapes when a route fails; keep shapes conditional if that bandwidth tradeoff is undesirable.

For tracking, start `getRoute` and `getShapes` together but publish the route as soon as it resolves, then apply shapes using the existing request-ID guard. Preserve progressive stop/arrival rendering instead of waiting for optional geometry.

## 3. Arrivals already share requests; true batching has limits

[`useStopsArrivals`](../src/services/useStopsArrivals.ts) and [`useFavoriteArrivals`](../src/services/favoriteArrivals.ts) deduplicate stop codes. All polling owners use the [shared arrival repository](../src/features/arrivals/data/arrivalRepository.ts), which coalesces pending work and reuses fresh validated snapshots across tracking, favorites and trip boarding. This was implemented in Turn 77 and is not an outstanding fix.

Each current request returns all services at one physical stop. A refresh of `K` distinct uncached stops still needs `K` single-stop requests through the current provider adapter, with no extra call per favorite bus/returned service.

If measurements justify a browser batch endpoint, a proposed contract is `POST /api/bus-arrivals/batch` with `{ "stopCodes": ["55329", "01001"] }`, returning a result per stop. Validate/deduplicate inputs, cap batch size, bound upstream concurrency, preserve partial failures, source/receipt time and explicit-refresh semantics. This reduces `K` browser round trips to one, but still needs up to `K` upstream single-stop calls with the current adapter. No provider bulk endpoint is assumed. Add this only if measured browser overhead warrants the extra API surface.

The favorites projection's `services.find` is an in-memory scan, not a query. For large lists, build a service-number Map once per returned stop, then use `Map.get`. At current small list sizes this is lower priority.

## Already eager-loaded or intentionally paginated

- [`server/lta/datasets.ts`](../server/lta/datasets.ts) loads stops, routes and services concurrently, builds Maps and shares the dataset promise within the warm store until expiry. [`buildRoute`](../server/lta/buildRoute.ts) joins local Maps without fetching each stop. Separate cold serverless instances can each load snapshots; this is a cache-scope issue rather than per-row N+1.
- [`server/lta/client.ts`](../server/lta/client.ts) fetches required pages in bounded parallel batches. Keep pagination/retries; unbounded parallelism would not reduce page count.
- The [browser network repository](../src/features/network/data/networkRepository.ts) shares the validated network, avoiding requests per displayed stop/pattern.
- Route generation loads datasets before its service-output loop; shape generation obtains one bulk Overpass dataset before grouping/output. Per-service file writes are not repeated remote relationship lookups. Independent due weather datasets and place-search fallback attempts do not fetch one child resource per rendered item.

## Validation and limits

A controlled fixture check called the actual route/shape repositories using the pattern for tracking Bus 72 plus geometry for legs 72 and 45. Current loaders made six fetch calls; a temporary pending-sharing/parallel-loading prototype made four and returned deeply equal parsed route/shape results. This used local JSON and mocked fetch, not React scheduling, production traffic, browser HTTP caching or live providers. The prototype was not installed in the application.

All 20 selected architecture and lookup/cache tests passed. No full suite, build, browser session, production measurement, secret scan, commit, push or deployment was performed. Recommended order: shared route/shape loaders, then parallel selected-leg loading; consider an arrivals batch endpoint only after measuring material browser overhead.

## Implementation follow-up — 21 October 2026

The route/shape recommendations are implemented locally in Turn 79:

- The existing route and shape repository exports now use shared pending work and bounded LRU success caches. Both tracking and geometry already call these exports, so no parallel adapter bypass is introduced. Each repository retains at most 64 successes, with pending work stored separately. Factories accept injected fetch/clocks for isolated verification.
- Route keys contain canonical service and expected dataset generation, including a distinct unversioned key. Parsed routes still enforce identity, generation, coordinates and schedules. The shared static index now caches only valid nonempty indexes with the same expiry; unavailable/invalid indexes retry instead of remaining permanently null. Unknown/unavailable routes never become settled cache successes.
- Shapes use an internal tagged result: validated empty arrays cache successfully, while HTML, malformed JSON/schema, wrong-service, HTTP and network failures return the existing empty-array fallback without being cached. Keys use trimmed uppercase service numbers; matching geometry remains the responsibility of `applyRouteShapes`.
- `VITE_ROUTE_ASSETS_CACHE_SECONDS` is part of the validated public config and generated `.env.example`: default 300 seconds, valid range 0–3600. Zero disables settled retention while still sharing pending work. Expiry starts when a successful request completes and reads do not extend it. Expired values and clock rollback trigger a reload; failed reloads allow immediate retry. Cache state is browser memory only, cleared on reload and refreshed after expiry, not persistent storage or cross-instance server caching. No manual route-cache invalidation UI was added.
- Journey geometry starts independent route/shape loads together for selected legs only, preserving leg order, direction and occurrence references. Its effect key includes requested dataset generation. Tracking starts both loads immediately, publishes stops before optional geometry and retains request-ID guards. Consumer cancellation does not abort shared requests. Parallel loading can fetch unused optional shapes when a route fails.

All 147 tests pass, including ten new route-asset regressions for sharing, canonical keys/generation isolation, validated-success-only retention, index recovery/expiry, empty shapes, failures/retries, fixed expiry/clock rollback, LRU/pending isolation and pending-only mode. Config tests cover the default, override, zero mode, bounds and generated example. TypeScript with unused-local checks and the production Vite build pass; CSS/React chunks are unchanged and Leaflet stays lazy.

Production-build fixture browser flows pass at 375 px and 1280 px: selected-trip geometry and tracking fetch each resource once; route and shape start before either response completes; route arrivals render while shapes are still gated; revisits reuse settled data; delayed older routes cannot replace current selection; trip maps, swaps/clear and repeated map cleanup work without page exceptions/overflow. The actual shared repositories make four fetch calls for the controlled tracking + distinct two-leg call pattern that required six in the review. Counts are local fixture evidence, not production/provider-origin measurements. The broader controlled endpoint/config checks also pass using synthetic credentials and local providers.

An arrivals batch endpoint and the lower-priority in-memory favorite-service index remain conditional suggestions: no browser-overhead evidence justified adding an endpoint, and arrival requests already share/deduplicate. No SQL database, new provider bulk API, production setting, commit, push or deployment was introduced. `COMMENTS.md` Turn 79 records delivery status.
