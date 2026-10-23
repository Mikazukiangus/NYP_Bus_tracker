# Outbound request timeouts

Released to production on 22 October 2026 at application commit `e785c65`; `COMMENTS.md` Turns 98–99 record implementation, validation and delivery status. Login lockout remains on hold.

## What changed

All explicit HTTP call sites already supplied request signals. Two shared-fetch cases could still run without a deadline: a native Request has a signal even when no timeout was supplied, and an ordinary caller cancellation signal replaced the default timeout. The guarded server fetch now combines a deadline with either input form and keeps it attached through response-body consumption. A shorter caller timeout or cancellation still wins.

The default guarded-fetch total budget is `OUTBOUND_TIMEOUT_MS=30000`; the connection budget is `OUTBOUND_CONNECT_TIMEOUT_MS=10000`. Both settings are validated in the central config and generated `.env.example`, and stay server-only. A trusted caller can pass an explicit finite `timeoutMs` up to 1,500,000 ms for a deliberately long operation. Invalid values fail before network work. The Overpass builder explicitly passes the smaller of its configured 330-second request timeout and remaining 25-minute rebuild budget, preserving its existing 300-second query allowance. Shorter provider budgets remain unchanged.

Map tile images and the OneMap attribution logo previously relied on browser network behavior. They now use `VITE_MAP_IMAGE_TIMEOUT_MS=15000`, release listeners/timers on success/error and replace stalled sources with a local transparent image. Tile completion reports failure once; unloading a tile/removing the map cancels pending image work. Attribution text remains visible. An isolated Chrome fixture observed the server connections close on timeout and verified later tile/logo recovery. Image cancellation behavior outside the tested browser still follows its image-loading implementation.

Leaflet CSS is bundled from the installed package with the lazy map code. The external unpkg stylesheet request is gone; no package or dependency was added.

The monthly refresh workflow's deploy-hook POST now has a 10-second connection limit and 30-second total limit. No automatic POST retry was added, avoiding duplicate deploy triggers. Its existing 30-minute job limit remains.

The subsequent local [safe retry follow-up](outbound-retries.md) keeps deadlines across retries and backoff; LTA pages now share one total page budget instead of restarting it per attempt. See Turn 101 for local delivery status.

## Existing budgets retained

- Browser arrivals: 5 seconds (`src/features/arrivals/client.ts`).
- Browser weather API, incidents and static route/index/shape files: 10 seconds (`src/features/weather/client.ts`, `src/features/incidents/client.ts`, `src/features/tracking/routeRepository.ts`, `shapeRepository.ts`).
- Bus-network download: 20 seconds (`src/features/network/data/networkRepository.ts`).
- Cold route API fallback: 30 seconds (`src/features/tracking/routeRepository.ts`).
- OneMap search and direct NEA browser fallback: 8 seconds; search combines user cancellation with its timeout (`src/features/places/data/oneMapClient.ts`, `src/features/weather/client.ts`).
- Server LTA arrivals/incidents: 8 seconds; dataset pages: 15 seconds total per page including retries/backoff; NEA datasets: 6 seconds; health probes: 5 seconds (`server/lta/`, `server/weather/service.ts`, `api/health.ts`).
- Overpass: 330 seconds per request within the existing total deadline (`scripts/build-route-shapes.ts`).

These are defaults; existing validated environment overrides continue to apply. Retry/fallback pipelines may take longer than a single request. Browser navigation and loading the app's own scripts/styles use browser-managed loading, rather than an application fetch signal. GPS operations already have separate finite browser options; a location watch is intentionally ongoing until cleared. Wake-lock requests are browser capabilities rather than outbound HTTP calls.

## Verification

Regressions cover Request/plain-signal deadlines, explicit long budgets, invalid timeout values, cancellation, a real native response whose headers arrive but body stalls, image completion/error/timeout/unload cleanup, generated config defaults and the bounded CI hook. A source check scans direct fetch/request boundaries for signals and recognizes the shared guarded transport and adapter argument forwarding. It covers the current call syntax rather than arbitrary JavaScript aliases.

The browser fixture uses the actual map hook and tile layer at 375 px and 1280 px, with a controlled local image server. It checks stalled tile/logo cancellation, successful recovery, local CSS, repeated mount/removal and absence of page errors or overflow. No production/provider request or deployment is needed for these controlled timeout cases.

Production verification passed all APIs/health, 58 CORS checks and normal browser flows at 375 px and 1280 px, including OneMap tiles/logo, the locally served lazy stylesheet, saved/location state and repeated map cleanup. No unpkg request, page error, overflow, mixed content or CSP issue was observed. Weather initially returned a validated partial response and had no missing datasets on follow-up. The runtime log check returned existing Node DEP0169 deprecation warnings only; no external log drains are configured. These release checks complement the controlled local timeout fixtures rather than inducing provider stalls in production.

References: [MDN timeout signals](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static), [MDN combining cancellation signals](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static), [Leaflet tile creation and lifecycle](https://leafletjs.com/reference.html#tilelayer-createtile).
