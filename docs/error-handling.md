# Error handling and safe diagnostics

The Turn 105 review found six gaps. The fixes retain useful cached/in-memory data while making degradation visible.

- **Weather**: refresh calls coalesce. A failed API and direct-forecast fallback retains the last snapshot, marks its available datasets stale and displays a refresh warning in both weather views. While the next refresh is pending, browser freshness uses time since the last successful browser response and the configured polling interval. The API continues to own each dataset's different cache lifetime; a legitimate cached forecast is not aged using the observation interval. A successful response clears the browser failure and uses the server's missing/stale flags. Stale or incomplete weather cannot create the summary's all-clear message; stale rainfall/forecast/lightning also suppress commute advice based on those inputs.
- **Traffic incidents**: the client preserves `fetchedAt`. The hook returns `{status, incidents, fetchedAt}`, distinguishing loading, ready, stale and unavailable. Failed refreshes retain previous incidents, including a previous empty feed, with an out-of-date notice and last-update time. An initial outage explicitly says current conditions are unknown. Route filtering does not discard feed status. Incident age is rechecked when polling starts and when its response arrives.
- **Persistence**: favorites, location and recent-place writes return `saved`, `session-only` or `invalid`. Hooks retain usable state after blocked/quota-limited storage writes and expose the outcome. The app shows a temporary-change notice; the saved-bus modal also shows it while open. A later successful write persists the current state and clears that feature's warning. A denied favorites read is distinct from corrupt/missing data. No new storage format/key or external synchronization is introduced.
- **Get-off alarm**: GPS/visual alerts, audio, vibration and screen lock have separate outcomes. Constructor/resume/playback failures and denied/released locks are visible; the app only says the screen is kept on after acquiring a live lock. Audio generation guards ignore stale completion after deactivation/ride change. Locks granted after cancellation or while hidden are released, pending/held locks are not duplicated, and visibility return can reacquire a released lock. Failed sound/vibration cannot prevent the visual get-off alert. The page must remain open; browser/device support still determines these capabilities.
- **Logs**: only typed `DependencyHttpError` values with an integer HTTP status from 100–599 preserve `{kind: "upstream_http_error", httpStatus}`. Existing event names/dataset labels identify the operation. Arbitrary error messages, stacks, causes, request headers and response bodies remain omitted; assigning a `status` field to an arbitrary error does not make it loggable. No raw error is added to user messages.
- **Public APIs**: `/api/health` keeps HTTP 200/503 behavior and no-store caching, but its JSON now contains only `status`, `service`, and `timestamp`. Removed diagnostics are an intentional response-contract change. Missing route/incident credentials produce generic unavailability messages without configuration variable names. No public detailed-health switch or diagnostic endpoint is provided.

A healthy public response has this shape:

```json
{
  "status": "ok",
  "service": "BusTrackerSG - A member of NYP Bus API",
  "timestamp": "2026-10-23T00:00:00.000Z"
}
```

A degraded probe records a restricted server log such as:

```json
{"level":"warn","event":"health.probe_failed","details":{"provider":"lta","status":"unavailable","httpStatus":401,"reason":"upstream_http_error","latencyMs":23,"checkedAt":"2026-10-23T00:00:00.000Z"}}
```

Use existing authorized Vercel runtime-log access or local server output to diagnose the provider/status. Never add a query flag to reveal environment settings, print raw provider errors or paste credentials into logs. This work does not provision log drains, authentication or monitoring.

Regression coverage lives in `tests/error-handling.test.ts`, `tests/error-hooks.test.ts` and `tests/api-health.test.ts`, alongside existing security/transport tests. The hook tests use an isolated DOM and controlled providers/storage/device capabilities; they do not depend on a live provider or prove physical vibration/audio output. Production deployment and device verification are separate delivery steps.
