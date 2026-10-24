# Concurrent updates and atomic ownership

The app has no SQL database or authenticated account writes. Shared state is held in warm server caches, browser hooks and local browser preferences. This change addresses the following concrete interleavings.

## Route dataset cache

`server/lta/datasets.ts` previously used the time a load started as the cache expiry time. If request A was still loading when that expiry elapsed, request B replaced the shared promise. A later rejection could then clear B's promise, allowing still more overlapping refreshes.

The store now keeps a completed snapshot separately from pending work. A request synchronously claims the pending promise before any provider invocation, and every overlapping caller joins it even beyond the old TTL. Successful loading publishes the three validated collections and completion timestamp together. Only the owner can clear its pending slot. Cache age starts at successful completion; failures never publish partial indexes. Independent store instances remain independent.

## NEA weather datasets

`server/weather/service.ts` already reserved its quota before awaiting a provider, but had no in-flight owner per dataset. With spare quota or a later quota window, B could fetch the same due dataset while A was pending. A slower old response could overwrite B's newer value, and duplicate work consumed the provider budget.

Each dataset now has a synchronously reserved pending slot. Other snapshots join existing work instead of starting a second writer or spending a second quota reservation. Different datasets still run in parallel. Each validated value and its fetch timestamp publish as one cache entry; each HTTP snapshot is assembled synchronously from committed entries. Failed work keeps the last good entry and frees its own pending slot. Concurrent cold requests now wait for admitted work rather than returning a needlessly empty snapshot while that work is running.

## Saved buses and recent places

`useSavedBuses` and `useRecentPlaces` previously built a replacement array from each tab's old memory. A saving Bus 50 and B saving Bus 72 could both read an empty list and overwrite each other. Locking just `setItem` would not fix that stale-read race.

`src/services/atomicPreferences.ts` now acquires an exclusive, same-origin Web Lock around the complete read–modify–write operation, using the collection's storage key as its resource name. The latest persisted record is read inside the lock; mutation and replacement have no intervening await. These short critical sections do not contain network calls. Favorites and recent places use separate locks.

`useStoredCollection` queues user commands, keeps optimistic UI usable and rebases commands on the latest record. A save means “ensure present”, and a removal means “ensure absent”; two simultaneous save intentions do not toggle one another off. Failed mutations remain in a local intent journal, so a later successful save can merge them with changes from other tabs. Storage events and same-document notifications synchronize observers, preserving pending local intent. A continuation rereads persisted state before publishing, covering commits by another tab after lock release.

`VITE_PREFERENCE_LOCK_TIMEOUT_MS` defaults to 5,000 ms, validated from 250–30,000 ms. If locking/storage is unavailable, denied or times out, the operation makes no unlocked read–modify–write replacement: changes remain session-only with the existing visible notice. Unknown/corrupt collection envelopes are preserved rather than overwritten through the atomic updater. Full-record replacement helpers remain for explicit fixtures/migrations; application collection actions must use `update()`.

These locks coordinate updated, cooperating tabs/workers on one origin/storage partition. Old deployed tabs or unrelated scripts that bypass the lock do not participate; refresh open app tabs after deployment. No cross-device synchronization or distributed lock service is implied. Single-value location/last-search records remain complete, last-write-wins replacements, rather than collection merges.

The locking mechanism and secure-context requirement follow the [W3C Web Locks specification](https://www.w3.org/TR/web-locks/) and [MDN Web Locks documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).

## Route and GPS selection

`useTrackedRoute` already rejected an older bus lookup after a newer lookup, but a pending lookup could still restore its captured direction/stop over a newer manual selection. The route hook now publishes route, direction, stop, loading state and notice through one state object, with synchronous intent revisions. Newer manual choices survive completion; a location change recalculates direction for the new route. Changing/clearing/swapping a destination invalidates pending trip route/shape publication without cancelling an unrelated service lookup. An unmounted owner cannot publish a completion. Automatic selection from late arrival rankings yields to explicit bus/trip choices. Each new destination intent has a revision, so selecting the same place again is not mistaken for the previous completed plan.

GPS requests from the bar and location modal previously had separate completion callbacks. A late fix could overwrite a manually chosen location, a newer fix, or a closed picker. `useUserLocation` now owns one request revision shared by startup GPS and explicit GPS actions. It checks both revision and cancellation immediately before the synchronous selection callback. Controls abort their selection signal synchronously on close/navigation and on replacement; the native GPS operation itself may finish, but cannot commit a cancelled result. Location/default/persistence status initialize from one read and publish together.

## Existing protections retained

- Arrival and route/shape repositories already reserve pending promises before I/O and share replacements; pending requests are not evicted by the bounded success caches.
- Polling owners cancel stale subscribers and schedule their next poll after completion, or explicitly suppress overlap. Address search checks cancellation before publishing.
- Circuit-breaker admission, epochs, failure bookkeeping and probe ownership are synchronous and already have delayed-completion regressions.
- Network indexes are built/published synchronously; route builders sort/filter copies rather than mutate shared provider rows.
- Separate Vercel instances/builds do not share these in-memory maps. The existing data-refresh workflow serializes its runs, and build output belongs to each checkout/deployment. This change does not add a fleet-wide provider quota or shared filesystem transaction system.

## Verification

`tests/concurrency.test.ts` and `tests/concurrency-hooks.test.ts` exercise deliberately deferred responses, TTL/window changes, simultaneous mutations, denied locks, failed-save recovery, reverse route/GPS completion and immediate cancellation. Existing weather/breaker tests now expect overlapping snapshots to join admitted work. `tests/fixtures/hooks.ts` contains the shared isolated DOM fixture; `tests/fixtures/locks.ts` supplies a deterministic test lock manager. Native browser tests against two same-origin Chrome tabs are separate from that simulated manager. Consult COMMENTS.md for the actual test count, browser evidence and delivery status; this guide does not itself assert deployment.
