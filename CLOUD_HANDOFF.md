# Cloud development handoff — BusTrackerSG

Prepared 22 October 2026; updated for the 24 October concurrency/cache release. Paste this note into the new cloud chat.

Continue my project at https://github.com/Mikazukiangus/NYP_Bus_tracker. Set up cloud development from the repository; keep the existing Vercel production hosting unless I explicitly request a hosting migration.

## Start here

- Read `AGENTS.md` and `COMMENTS.md` before project work. Latest history is the source of truth when older review documents describe work as pending.
- Append a dated entry with the next `Turn N` to `COMMENTS.md` on every project-related turn. Preserve history, record actual validation and distinguish local edits, commits, pushes and verified deployments. Never record credentials.
- Use normal concise completion summaries. The old fixed “This is completed” rule was removed. Ask explicitly when a decision or confirmation is actually required.
- Inspect the current branch, working tree and latest remote commits before changing anything. Preserve existing edits. Use a development branch for new cloud changes: pushing `main` automatically deploys production.
- In a managed cloud runtime, read its applicable runtime/setup instructions first and inspect network/secret availability without printing secret values. This handoff does not provision or migrate infrastructure.

## Repository and release baseline

- Repository: https://github.com/Mikazukiangus/NYP_Bus_tracker
- Production: https://nypbus-tracker.vercel.app/
- Branch at handoff: `main`.
- Latest verified application release: `e01960a7532d6928a4a1a17a0aee8715fa430784` — atomic shared updates and repeated-operation caches, including the earlier error-handling fixes; subsequent commits record release notes.
- Application commit: `e01960a7532d6928a4a1a17a0aee8715fa430784`; it includes the previously released circuit breakers, retries and outbound request/map image deadlines.
- Verified application deployment: `dpl_FiLq9bsNTxFse8VCsEygFmffNQZU`, READY with the exact application SHA and live domain assigned.
- Existing Vercel project: `nypbus-tracker`, team slug `carbon-bc04`; project ID `prj_hRkofLg97cZMW7uyG1cvDrDx4R7L`, team ID `team_ZEUyUqyAE43B7bGMi6Rdux14`. These IDs are identifiers, not credentials. New chat access must be established separately.
- GitHub integration deploys pushes to `main`. Do not trigger a second manual deployment for the same push.
- This handoff is committed and pushed; Turn 104 updates its circuit-breaker release baseline. A fresh clone of current main contains it. Read the latest COMMENTS.md delivery entries and recheck remote state rather than resetting to an earlier SHA.

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

Latest application release passed 291 tests, TypeScript including unused-local checks, HTTPS scan across 147 files, client build, working-tree/history Gitleaks scans, 58 live CORS checks and production browser flows at 375 px/1280 px. Real arrivals, trips, map tiles/logo/local CSS, saved buses, location persistence and map cleanup passed. Consult COMMENTS.md for the latest documentation-only deployment and its smoke results. These are historical results; rerun checks in the new runtime before claiming new verification.

The production build generated 601 services, 5,209 stops and 797 directions. Dataset counts can change. NEA weather can return validated partial data: it had seven missing datasets initially and no missing datasets on follow-up; later cold instances can still return partial data. Runtime error-level records checked were existing Node DEP0169 `url.parse()` deprecation warnings; no other failures were returned in that window. No external log drains are configured, and continuous monitoring has not been established.

Temporary browser harnesses, screenshots and controlled timeout fixtures under this Mac's `/private/tmp` are not in Git and will not transfer. Committed tests remain available; recreate any additional browser harness with tools installed in the cloud runtime. Install Gitleaks separately if running `npm run secrets:scan`; fetch remote refs first for fresh history coverage, and retain redacted output.

Read README, SECURITY.md, MODULARITY_REVIEW.md and the guides in `docs/`, especially `circuit-breakers.md`, `outbound-retries.md`, `outbound-timeouts.md`, `ssrf-protection.md`, `cors.md`, `input-validation.md`, `xss-audit.md`, `https-security.md`, `data-model.md` and `api/bus-arrival.md`.

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
