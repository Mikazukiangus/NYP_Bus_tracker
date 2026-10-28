# Cloud development handoff — BusTrackerSG

Prepared 22 October 2026; updated for the 28 October critical-path testing release. Paste this note into the new cloud chat.

Centralized error tracking is delivered using **Vercel logs, no additional account**. See `docs/error-tracking.md` and the latest COMMENTS entry for implementation/checks and delivery status. Browser reports use a separate strict anonymous POST collector; business APIs remain GET/HEAD. The firewall extension adding exactly POST /api/client-errors to the shared IP budget is already published and verified as active version 6, with no pending draft. Application release 9c69da4 is deployed and verified, including automatic request context and actual browser-report/log correlation. No Sentry secret, background queue or GitHub reporting job is needed.

Continue my project at https://github.com/Mikazukiangus/NYP_Bus_tracker. Set up cloud development from the repository; keep the existing Vercel production hosting unless I explicitly request a hosting migration.

## Start here

CI/CD build gate (28 October 2026): `npm run build` requires `npm run verify` before generating routes or compiling assets. Verification runs TypeScript, the HTTPS scan and the complete test suite inside Vercel's existing Git build. Fixtures run in a separate test-mode process; the parent production build retains its settings and provider keys. See `docs/ci-cd.md` and Turn 133. Keep this shared gate in place; no new GitHub deployment workflow or deployment token is needed.

Latest released follow-up (28 October 2026): application `38ceedf` adds critical-path unit/integration tests, an injectable arrival HTTP adapter and repeatable `npm run test:coverage` / `npm run test:integration` commands. All 338 tests pass; loaded-file coverage is 93.66% lines / 88.55% branches with unloaded runtime/UI files listed separately. Read `docs/testing.md` and Turns 131–132 for coverage gaps and actual delivery checks. No dependencies, accounts or required settings were added.

Released follow-up (28 October 2026): automatic structured logging is deployed and verified on top of the Vercel-log error tracker. Read `docs/structured-logging.md` and Turns 129–130 for implementation/validation/delivery. It adds a shared request scope, generated `X-Request-ID`, top-level anonymous user context and response status/duration, preserving strict browser-report ingestion and exception references. It does not add login, persistent identity or required environment settings; application release 9c69da4 is committed, pushed and verified live.

- Read `AGENTS.md` and `COMMENTS.md` before project work. Latest history is the source of truth when older review documents describe work as pending.
- Append a dated entry with the next `Turn N` to `COMMENTS.md` on every project-related turn. Preserve history, record actual validation and distinguish local edits, commits, pushes and verified deployments. Never record credentials.
- Use normal concise completion summaries. The old fixed “This is completed” rule was removed. Ask explicitly when a decision or confirmation is actually required.
- Inspect the current branch, working tree and latest remote commits before changing anything. Preserve existing edits. Use a development branch for new cloud changes: pushing `main` automatically deploys production.
- In a managed cloud runtime, read its applicable runtime/setup instructions first and inspect network/secret availability without printing secret values. This handoff does not provision or migrate infrastructure.

## Repository and release baseline

- Repository: https://github.com/Mikazukiangus/NYP_Bus_tracker
- Production: https://nypbus-tracker.vercel.app/
- Branch at handoff: `main`.
- Latest verified application release: `38ceedf94178ce875e97a0bb6c4f11c08dc5cefb` — critical-path tests, honest coverage inventory and an injectable arrival adapter; retains structured request/anonymous-user context, Vercel error tracking, pagination and earlier concurrency/cache/error-handling fixes. Subsequent commits record release notes.
- Application commit: `38ceedf94178ce875e97a0bb6c4f11c08dc5cefb`; it includes the previously released circuit breakers, retries and outbound request/map image deadlines.
- Verified application deployment: `dpl_wumJ2qZPNZoEMhWBsQTJxHkt3fyn`, READY with the exact application SHA and live domain assigned.
- Existing Vercel project: `nypbus-tracker`, team slug `carbon-bc04`; project ID `prj_hRkofLg97cZMW7uyG1cvDrDx4R7L`, team ID `team_ZEUyUqyAE43B7bGMi6Rdux14`. These IDs are identifiers, not credentials. New chat access must be established separately.
- GitHub integration deploys pushes to `main`. Do not trigger a second manual deployment for the same push.
- This handoff accompanies the committed application release; Turn 132 records its current delivery checks. A fresh clone of current main contains it. Read the latest COMMENTS.md delivery entries and recheck remote state rather than resetting to an earlier SHA.

## Cloud setup

This is a Node.js 24 / TypeScript / React / Vite / Tailwind app with Leaflet, Vercel API functions and an Express development server. No Python application backend is required. Use `package-lock.json` with `npm ci`.

After cloning and entering the repository, with Node.js 24 available:

```bash
node --version
npm ci
# Only if .env does not already exist:
cp .env.example .env
npm run config:check
npm run dev
```

The development server defaults to `0.0.0.0:3000`; use the cloud platform's port preview. The prior Mac used an optional Python/nodeenv `.venv` containing Node 24.19.0/npm 11.17.0; this ignored directory does not transfer. A cloud-provided Node 24 installation is sufficient. README includes optional nodeenv recreation instructions.

Set `LTA_ACCOUNT_KEY` through the cloud environment's secret manager or ignored local environment file. `DATA_GOV_SG_API_KEY` is optional. Existing Vercel/GitHub credentials and secrets do not automatically transfer to a new chat/runtime. Do not copy secrets into chat, commits, browser variables or logs. Without an LTA key, expect degraded live transit functionality. `.env.example` is the complete generated settings reference.

```bash
npm test
npm run lint
npm run security:https
npx vite build
```

`npx vite build` builds the client without downloading routes. **Do not run `npm run build` casually:** it empties ignored `public/bus-routes/` before downloading LTA data. A new clone will not contain those generated files; `npm run routes` generates them with a valid key, while the app otherwise uses its route API fallback. Tracked `public/route-shapes/` is a separate dataset. Overpass shape regeneration is an explicit long-running task, not a setup requirement. Do not invoke real deploy hooks as a setup test.

Use `HOST`/`PORT` if the preview platform requires them. Keep development mode for the development server. If an additional frontend origin really needs cross-origin API access, use the validated exact-origin CORS settings; do not enable wildcards to make a preview work. Same-origin preview API calls normally need no extra grant.

## Architecture and decisions to preserve

- UI composition: `src/App.tsx`, components and feature hooks. Feature application/domain/data seams live under `src/features/`.
- Pure shared schemas/parsers/geometry: `shared/`. Server provider services/caches: `server/`. HTTP adapters: `api/`. Downloads/build tools: `scripts/`.
- Central immutable validated configuration: `config/schema.ts` and `config/server.ts`. Explicit browser allowlist: `config/public.ts` / `src/config.ts`. Do not expose server credentials through Vite.
- No SQL database, user accounts, login, password storage or authenticated sessions exist. Storage is generated JSON, runtime caches and browser preferences/location/saved buses. **Login brute-force lockout is explicitly on hold; do not introduce authentication or unused lockout code.**
- Preserve the Sanzo Wada plate 259 palette: lemon yellow, green blue, Helvetia blue and warm gray. Preserve saved/manual/GPS location behavior and late-GPS race protection.
- Existing work includes modular layers, validated API/provider/artifact/storage/GPS boundaries, lookup indexes and request coalescing, DOM-based map popups, HTTPS/HSTS/CSP, exact-origin CORS, safe diagnostics/redaction and DNS-aware SSRF protection.
- Use `security/ssrf.ts` `safeFetch` for server outbound calls. Private/reserved IPs, mixed unsafe DNS answers and redirects are rejected at connection time. Keep TLS verification. Do not disable these protections to accommodate a cloud proxy; investigate the runtime network policy and an appropriate compatible transport instead.
- Shared fetch defaults: 30-second total deadline, 10-second connection budget, combined caller cancellation through body reads. Existing shorter provider budgets remain; Overpass has an explicit longer finite budget. Map tiles/logos default to 15 seconds, cancel on removal, and Leaflet CSS is bundled locally/lazily.
- Keep pinned Undici 7.30.1 compatible with Node 24's native fetch, and ipaddr.js 2.5.0 unless intentionally upgrading and verifying compatibility.

## Validation and known limitations

Latest application release passed 338 tests, TypeScript including unused-local checks, HTTPS scan across 151 files, client build, working-tree/history Gitleaks scans, 58 live business-API CORS checks and production browser flows at 375 px/1280 px. Two fresh uncached arrival-request IDs correlate exactly once to completion logs with the correct release, method/route/status and anonymous user context. Real arrivals, trips, tiles/local CSS, saved buses, persisted location/reload and map cleanup pass with no page exceptions, horizontal overflow, app cookies or CSP/mixed-content issues. Sixteen-case collector-boundary and eleven-request/full browser-report correlation evidence remain historical results in Turns 128/130; no production crash or synthetic client report was induced for this test release. Consult COMMENTS.md for subsequent documentation commits and smoke checks; rerun validation in a new runtime rather than claiming these historical results as fresh verification.

The latest production build generated 604 services, 5,211 stops and 801 directions. Dataset counts can change. NEA weather can return validated partial data: it had seven missing datasets initially and no missing/stale datasets on follow-up; later cold instances can still return partial data. A deployment-filtered 30-minute warning/error/fatal query (limit 100) returned 14 existing DEP0169 warnings and no other failure at the checked time; this is a bounded observation, not continuous monitoring. Cached API responses can reuse the generating invocation header; individual edge hits require platform request metadata. Build reports the existing moderate/high transitive dependency advisories; no dependency versions were changed. The prior audit identified body-parser and qs advisories with no enabled body-parser middleware or first-party qs.stringify call; retain the separate maintenance follow-up. No external log drains are configured, and continuous monitoring has not been established.

Temporary browser harnesses, screenshots and controlled timeout fixtures under this Mac's `/private/tmp` are not in Git and will not transfer. Committed tests remain available; recreate any additional browser harness with tools installed in the cloud runtime. Install Gitleaks separately if running `npm run secrets:scan`; fetch remote refs first for fresh history coverage, and retain redacted output.

Read README, SECURITY.md, MODULARITY_REVIEW.md and the guides in `docs/`, especially `structured-logging.md`, `error-tracking.md`, `circuit-breakers.md`, `outbound-retries.md`, `outbound-timeouts.md`, `ssrf-protection.md`, `cors.md`, `input-validation.md`, `xss-audit.md`, `https-security.md`, `data-model.md` and `api/bus-arrival.md`.

First action: verify checkout/runtime/secrets availability, install locked dependencies, run the checks above, start the app through the cloud preview and report actual readiness or concrete blockers. The six Turn 105 error-handling findings were fixed in Turn 107 and delivered in Turn 108; consult the latest history for subsequent work. Do not deploy, migrate production, add login or invent a database as part of environment setup.

## Retry follow-up after the release baseline — 23 October 2026

Turn 101 implemented safe read retries; Turn 102 committed, pushed and verified application b050a89 in production together with this handoff. Consult the latest delivery entry for subsequent documentation deployments. Read docs/outbound-retries.md and the latest COMMENTS.md before continuing. New work includes a shared GET/HEAD retry policy, LTA live/page integration, browser static/OneMap adapters, an extracted read-only Overpass POST retry owner and generated retry settings. NEA remains budgeted, health/deploy hooks single-attempt, and browser API polling has no nested retry layer. The earlier retry release had 231 tests; Turns 101–102 record controlled retry fixtures and actual production checks. Earlier 216-test release evidence remains historical in COMMENTS.md.

## Circuit breaker follow-up — 23 October 2026

Turn 103 implemented circuit breakers; Turn 104 committed, pushed and verified application 63c82b3 in production. A fresh clone of current main contains them; consult the latest COMMENTS.md delivery entries for subsequent documentation commits. Read docs/circuit-breakers.md and the latest COMMENTS.md entry. Defaults are three counted operation failures within 60 seconds, 30 seconds open, then one recovery operation. Owners are separate for LTA arrivals/incidents/collections, each NEA dataset and browser OneMap search. Existing fallbacks, quota reservations and security boundaries remain. State is per warm instance/client, not a fleet-wide shared limiter; no database, new secret or monitoring service was provisioned.

## Error handling follow-up — 23 October 2026

Turn 105 reviewed six error-handling gaps; Turn 106 published the review notes only. Turn 107 implemented the fixes; Turn 108 committed, pushed and verified application 929a145 in production: visible weather/incident freshness and failure state, explicit session-only persistence, alarm capability outcomes, safe numeric provider status in logs, and a minimal public health response. Read docs/error-handling.md for the changed contracts and COMMENTS.md for actual verification/commit/deployment status. The hook regressions are portable Node/DOM tests; temporary Chrome fixtures remain local to this Mac. No login, database, monitoring integration or new environment setting was added. Consult Turn 108 for exact application/deployment verification and later documentation commits. Public health now exposes only status/service/timestamp; authorized server logs carry safe failed-probe details.

## Atomic update follow-up — 23 October 2026

Turn 109 addresses shared-cache and stale-completion races plus cross-tab preference read–modify–write updates. Read docs/concurrency.md and the latest COMMENTS.md for the actual validation/delivery state. New public VITE_PREFERENCE_LOCK_TIMEOUT_MS defaults to 5,000 ms; no production setting is required to use the default. Updated tabs use native Web Locks and storage notifications; denied/unsupported locking keeps changes session-only. Server cache ownership remains per warm instance; no shared database or distributed lock was added. Turn 118 commits, pushes and verifies this work in production; consult that entry for actual checks and limits. Refresh old open tabs so preference writers participate in the updated Web Locks protocol.

## Queue proposal cancelled — 24 October 2026

Turn 116 removes the uncommitted background-queue migration at the user's request. Existing Vercel build-time LTA generation, the route API fallback and the original monthly OSM workflow remain in place; no new background queue was deployed. No GitHub LTA key is needed for the cancelled proposal. Preserve the completed concurrency fixes and consult the latest COMMENTS.md for their release status.

## Repeated-operation cache follow-up — 24 October 2026

Turn 117 adds bounded browser OneMap/static-trip caches (five-minute defaults) and a shared per-warm-owner incident cache using the existing two-minute incident TTL. Incident edge freshness subtracts snapshot age. Read docs/caching.md for invalidation, cancellation ownership, privacy and existing-cache boundaries. VITE_PLACE_SEARCH_CACHE_SECONDS and VITE_TRIP_PLANS_CACHE_SECONDS have defaults; no production setting or new secret is required. Preserve live arrival refresh and dynamic trip ranking. Turn 118 commits, pushes and verifies these changes in production; the cancelled background queue stays removed.

## Release verification — 24 October 2026

Turn 118 releases the concurrency and caching work as e01960a / dpl_FiLq9bsNTxFse8VCsEygFmffNQZU. All 291 tests, TypeScript, client build, HTTPS/security scans, 58 live CORS checks and production browser flows at 375 px/1280 px pass. Provider counts remain 601 services / 5,209 stops / 797 directions. Initial weather had seven missing datasets; the follow-up smoke had zero missing datasets. Runtime records returned in the checked window were existing DEP0169 warnings only. Existing npm audit finding: transitive body-parser 1.20.8 has GHSA-27r3-jxmh-p828, fixed in 1.20.9; app source enables no body-parsing middleware, but the dependency still needs maintenance. No dependency change is part of this release. Refresh old tabs to use the updated preference coordination.

## IP rate-limit rollout — 24 October 2026

The user chose IP limiting now and account limits only when login exists. Read docs/rate-limiting.md and the latest COMMENTS.md before changing the firewall. The shared 600-per-60-second per-IP/per-region API rule is live in blocking mode (rule_public_api_per_ip_limit_q1VNjS, active config waf_YhhlPTGZjZU1 version 6), covering GET/HEAD API reads and exactly POST /api/client-errors, with HTTP 429 above the budget. Turn 127 records the POST extension publication, exact readback and production smoke checks; Turn 128 subsequently deploys/verifies the application collector and actual browser-to-log delivery. Turn 122 records user-authorized API publication, native isolated 3/10 enforcement/recovery verification, full 600/60 readback and passing production smoke checks. The protected-preview probe was inconclusive; do not claim it passed. No draft changes or temporary test restrictions remain. config/firewall.ts and the offline firewall:rule generator preserve the reviewed policy. Application deployments do not publish firewall drafts. Use the documented traffic review and log-mode rollback if tuning becomes necessary. No new secret, SDK, Redis, anonymous cookie or application authentication was added. Standalone Express needs separate gateway protection before public exposure.

## Incident pagination — 24 October 2026

Turn 123 implements opt-in offset pagination on /api/traffic-incidents (100 default, 200 max, 10,000-record bound) with deterministic content fingerprints and 409 on changed snapshots. No-query legacy responses remain complete. The browser drains validated matching pages atomically under one timeout, restarts once on conflict and retains complete stale data on failure. It does not paginate nested arrivals/route/weather resources or introduce a database/index/store/secret. Read docs/pagination.md and the latest COMMENTS.md for validation and delivery; Turn 124 commits, pushes and verifies this application work in production, including a real 24-record/two-page traversal, safe 409 handling and complete legacy responses. Preserve the separately live 600/60 per-IP WAF blocking configuration.

## Pagination delivery — 24 October 2026

Turn 124 delivers application 6db039d / dpl_D7Zex8xX3HZL9aAxbAv5RijNx5Hr, READY at the exact SHA with the live domain. All 305 tests, TypeScript, HTTPS/build/security scans, live pagination and 58 CORS checks pass, plus production phone/desktop flows. The independently published WAF remains the 600/60 per-IP blocking policy; application deploys do not publish firewall drafts. Existing dependency advisory/DEP0169 warnings and variable partial weather remain documented limitations. Consult the latest COMMENTS.md for documentation follow-up deployment and smoke results.
