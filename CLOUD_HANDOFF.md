# Cloud development handoff — BusTrackerSG

Prepared 22 October 2026; updated for the 23 October retry release. Paste this note into the new cloud chat.

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
- Latest verified application release: `b050a890ca05df235db34be8a50873cc0d4e020b` — safe read retries and this cloud handoff; subsequent commits record release notes.
- Application commit: `b050a890ca05df235db34be8a50873cc0d4e020b`; it includes the previously released outbound request/map image deadlines.
- Final verified production deployment: `dpl_FVWY1QwaCxPP89mtFDGPk9SNCWnb`, READY with the exact application SHA and live domain assigned.
- Existing Vercel project: `nypbus-tracker`, team slug `carbon-bc04`; project ID `prj_hRkofLg97cZMW7uyG1cvDrDx4R7L`, team ID `team_ZEUyUqyAE43B7bGMi6Rdux14`. These IDs are identifiers, not credentials. New chat access must be established separately.
- GitHub integration deploys pushes to `main`. Do not trigger a second manual deployment for the same push.
- This handoff is committed and pushed with the Turn 102 retry release. A fresh clone of current main contains it. Read the latest COMMENTS.md delivery entries and recheck remote state rather than resetting to an earlier SHA.

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

Last release passed 231 tests, TypeScript including unused-local checks, HTTPS scan across 135 files, client build, working-tree/history Gitleaks scans, 58 live CORS checks and production browser flows at 375 px/1280 px. Real arrivals, trips, map tiles/logo/local CSS, saved buses, location persistence and map cleanup passed. The docs-only deployment then passed final API/asset/CORS smoke checks. These are historical results; rerun checks in the new runtime before claiming new verification.

The production build generated 601 services, 5,209 stops and 797 directions. Dataset counts can change. NEA weather can return validated partial data: it had seven missing datasets initially and no missing datasets on follow-up; later cold instances can still return partial data. Runtime error-level records checked were existing Node DEP0169 `url.parse()` deprecation warnings; no other failures were returned in that window. No external log drains are configured, and continuous monitoring has not been established.

Temporary browser harnesses, screenshots and controlled timeout fixtures under this Mac's `/private/tmp` are not in Git and will not transfer. Committed tests remain available; recreate any additional browser harness with tools installed in the cloud runtime. Install Gitleaks separately if running `npm run secrets:scan`; fetch remote refs first for fresh history coverage, and retain redacted output.

Read README, SECURITY.md, MODULARITY_REVIEW.md and the guides in `docs/`, especially `outbound-timeouts.md`, `ssrf-protection.md`, `cors.md`, `input-validation.md`, `xss-audit.md`, `https-security.md`, `data-model.md` and `api/bus-arrival.md`.

First action: verify checkout/runtime/secrets availability, install locked dependencies, run the checks above, start the app through the cloud preview and report actual readiness or concrete blockers. There is no unfinished application fix from the safe-retry release. Do not deploy, migrate production, add login or invent a database as part of environment setup.

## Retry follow-up after the release baseline — 23 October 2026

Turn 101 implemented safe read retries; Turn 102 committed, pushed and verified application b050a89 in production together with this handoff. Consult the latest delivery entry for subsequent documentation deployments. Read docs/outbound-retries.md and the latest COMMENTS.md before continuing. New work includes a shared GET/HEAD retry policy, LTA live/page integration, browser static/OneMap adapters, an extracted read-only Overpass POST retry owner and generated retry settings. NEA remains budgeted, health/deploy hooks single-attempt, and browser API polling has no nested retry layer. The released suite has 231 tests; Turns 101–102 record controlled retry fixtures and actual production checks. Earlier 216-test release evidence remains historical in COMMENTS.md.
