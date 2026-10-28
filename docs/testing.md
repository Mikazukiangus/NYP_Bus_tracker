# Critical-path tests and coverage

Run from the repository root with the existing Node 24 environment:

```sh
source .venv/bin/activate
npm ci
npm test
npm run test:integration
npm run test:coverage
```

`npm test` includes every root `tests/*.test.ts`, including the dedicated `*.integration.test.ts` files. The integration-only command is a convenient subset; older files also contain integration checks. No additional test package, real provider key or reporting service is required. Dedicated integration fixtures use controlled responses and a temporary loopback HTTP server, with no provider or production writes. A restricted execution environment must permit binding that local server.

The coverage command uses [Node's built-in test coverage](https://nodejs.org/docs/latest-v24.x/api/test.html#collecting-code-coverage), returns a failing exit code when tests fail, and produces:

| Local file | Purpose |
| --- | --- |
| `coverage/lcov.info` | Loaded-file coverage for editors and LCOV-compatible tools |
| `coverage/summary.json` | Per-file/aggregate counts and percentages, plus a separate unmeasured-file inventory |
| `coverage/test-output.txt` | Full test results, failures and Node's coverage table |

Reports are ignored by Git and regenerated on every run. The command clears its previous reports before starting. The coverage scope is `api/`, `server/`, `shared/`, `security/` and `src/`. Config, scripts and `server.ts` are outside the measurement denominator, even when exercised by existing tests. Native V8 coverage under `tsx` includes generated helpers and imperfect source positions; use percentages to locate gaps, then inspect the TypeScript and assertions before drawing conclusions about exact statements.

## What protects the critical paths

| Responsibility | Repeatable tests and meaningful failures covered |
| --- | --- |
| Live arrivals | `bus-arrivals`, `arrival-validation`, `lta-live-services`, `arrivals.integration`: stop identity, timestamp/schema validation, monitored versus scheduled buses, empty live versus unavailable feeds, simulated data excluded from live UI, actual HTTP-to-service-to-client decoding |
| HTTP boundaries | `input-boundaries`, `cors`, `csrf-surface`, `transport-security`, `api-health`, `error-ingestion`, `structured-logging`: validation before provider work, methods/origins/body/query, safe errors, correlated request logs and privacy |
| Dependency resilience | `read-retry`, `outbound-timeouts`, `ssrf`, `circuit-breaker`, `weather-service`, `lta-pages`: cancellation, safe retries, guarded destinations, open/probe transitions, partial weather and provider budgets |
| Journey planning and route data | `trip-planner`, `leave-within`, `route-shape`, `data-model`, `lookup-cache`, `route-assets`, `journey-presentation`: transfers, catchability and aligned times, loop visits, versioned data, reused indexes and bounded caches |
| Network-to-UI state | `network-gps.integration`: actual transport/parser/index builder feeding the mounted hook; loading, malformed/unavailable and recovered data; location changes reuse the network and update nearby stops |
| Weather advice | `weather-summary`, `rain-nowcast`, `error-handling`: warning thresholds, nearest readings/unit conversion, nearby versus distant rainfall, lightning age/radius, severity ordering, PSI precedence, regional outlook and stale/missing-data disclosure |
| Browser/device state | `network-gps.integration`, `error-hooks`, `concurrency-hooks`, `get-off-alarm`, `user-location`, `concurrency`: overlapping/cancelled GPS fixes, disabled/unmounted owners, error expiry, preferences, audio/wake-lock failures and stale request ownership |
| Safe error screens | `error-ui.integration`, `error-tracking`, `security`, `xss-rendering`: real React render failure to browser report and safe reference screen, working reload/dismiss actions, no raw exception markup/message, strict ingestion and log redaction |

The dedicated arrival integration uses the same exported HTTP adapter as production, with only its service/settings injected. It tests rejected queries/methods/origins without provider calls, live cache headers and decoded ETAs, malformed-provider fallback without live cache headers, circuit suppression and cooldown recovery, and valid empty-feed recovery. Provider transport/SSRF tests remain separate; injecting the provider fixture does not claim to exercise a real external connection or Vercel's edge cache.

## Measured result: 28 October 2026

All **338 tests pass**, including **14 new tests**. The pre-change baseline passed 324 tests. Loaded-file coverage changed from **92.15% to 93.66% lines**, **86.36% to 88.55% branches**, and **89.16% to 91.44% functions**. Two additional runtime files entered the measured set, so the aggregate denominator changed; the per-file changes below are more useful evidence of improvement.

| File | Branches before | Branches after |
| --- | ---: | ---: |
| `src/features/weather/summary.ts` | 22.45% | 96.74% |
| `src/features/weather/bands.ts` | 40.00% | 100.00% |
| `src/features/location/useGpsRequest.ts` | 57.14% | 100.00% |
| `api/bus-arrival.ts` | 50.00% | 92.86% |
| `src/features/network/application/useBusNetwork.ts` | Unmeasured | 94.44% |
| `src/features/errors/ErrorBoundary.tsx` | Unmeasured | 100.00% |

The suite measures **129 of 183 source files** in scope (declaration files excluded). The other **54 include type-only modules**, so this is an inventory rather than a runtime coverage percentage. Unloaded runtime files do not appear in V8's percentage denominator. A high loaded-file number must not be described as full-app coverage. These figures are a local snapshot; regenerate reports after changes.

## Where coverage is weakest, in priority order

1. **Full app, maps and journey orchestration are unmeasured.** `src/App.tsx`, `src/main.tsx`, `src/components/LiveBusMap.tsx`, `src/features/map/*`, `src/features/journey/useJourneyGeometry.ts` and `src/app/useAppNavigation.ts` have no loaded-file result. Add repeatable real-browser tests for choosing a journey/boarding stop, switching trips during delayed route/shape loads, opening/closing the map repeatedly, tile failures and mobile layout. Earlier delivery notes contain live-browser evidence; those temporary fixtures are not a committed regression suite or part of these metrics.
2. **Interactive weather/alarm views have low branch coverage.** `NEAWeatherWidget.tsx` is **18.52%**, `NearestStopBanner.tsx` **36.36%**, and `GetOffAlarm.tsx` **50.00%**. Add interaction tests for expanded views, missing/stale sections and enabling/disabling alarms. Existing pure alarm logic is strongly tested; `useGetOffAlarm.ts` remains **67.14%** on branches. Real GPS accuracy, background-tab throttling, audio permission and device wake-lock behavior still need browser/device verification.
3. **Some HTTP response branches and advice formatting remain lightly tested.** `api/weather.ts` is **37.50%**, journey presentation **40.00%**, and `rainAdvice.ts` **52.73%** on branches. The route adapter has only **55.10% line coverage** despite 75.00% branch coverage. Next add native-response adapter checks for weather/route success and degradation, plus user-visible trip/advice variants. Branch percentages can be misleading for tiny files with few branches; use risk and actual assertions to prioritize.
4. **Place-search and remaining arrival orchestration are unmeasured.** `usePlaceSearch.ts`, `useStopArrivals.ts`, `favoriteArrivals.ts` and several consumer components are absent from the loaded set. Existing shared repository tests protect coalescing, invalidation and stale ownership, but do not prove those views wire them correctly. Add deferred-response tests for rapid search edits, unmount/abort, saved-stop fan-out and switching the tracked stop during a slow response.

No arbitrary global threshold is imposed yet: it would exclude unloaded app code and reward misleading coverage. Maintain meaningful assertions for these risks, expand the inventory into browser tests, and then establish per-area regression budgets. Tests here are local changes; they do not themselves commit, push or deploy an application release.
