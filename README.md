# BusTrackerSG

Live Singapore bus arrivals, live bus positions on a map, trip planning and NEA weather, built around Nanyang Polytechnic.

Live site: https://nypbus-tracker.vercel.app

## Code structure

`src/App.tsx` composes feature owners in `src/features/` for tracking, journey planning, location, saved buses, weather, incidents and maps. Places, network and saved-bus features separate pure `domain/` rules, `data/` adapters and `application/` hooks; browser data clients live with their features; `src/services/` retains focused algorithms and arrival/alarm hooks. `server/lta/` and `server/weather/` hold reusable provider services, while `api/` and `scripts/` provide HTTP and build entry points. `shared/` contains environment-neutral geometry, contracts and weather parsers.

See [the modularity review and implementation notes](MODULARITY_REVIEW.md) for the responsibility boundaries, extraction results and optional follow-ups. `npm test` includes checks that protect domain/UI/data and server/browser boundaries and keep Leaflet behind its lazy import.

The [bus-arrival response contract](docs/api/bus-arrival.md) includes an example JSON response, accepted empty-bus values, runtime validation and fallback behavior.

The [data-model guide](docs/data-model.md) explains stop visits, absolute arrival times, generated-file validation and the backward-compatible saved-record formats. It also records [implemented lookup indexes and shared arrival requests](docs/data-model.md#implemented-lookup-and-request-optimizations--21-october-2026); `npm run profile:lookups` compares the optimized lookups with an uncached baseline without calling providers.

Route and shape loaders now share pending requests and a bounded success cache, and load independent geometry in parallel. See the [N+1 review and implementation](docs/n-plus-one-review.md#implementation-follow-up--21-october-2026) for behavior, expiry and validation. `VITE_ROUTE_ASSETS_CACHE_SECONDS` defaults to 300; zero keeps pending sharing while disabling settled caching.

The [HTTPS and cookie policy](docs/https-security.md) covers production redirects, HSTS/CSP, trusted proxies, secure cookie defaults and mixed-content findings. Run `npm run security:https` to flag insecure browser resource URLs; production builds run it automatically. Development configuration permits HTTP loopback endpoints, while server outbound requests always reject private destinations.

The [input-validation guide](docs/input-validation.md) lists HTTP, provider, artifact, storage and GPS boundaries. Public API reads accept body-free GET/HEAD requests and reject malformed input before service work; approved CORS preflights are handled separately without service calls. Runtime schemas use the CSP-safe validator entry point; existing successful formats and saved-record migrations remain supported.

The [XSS audit and hardening guide](docs/xss-audit.md) records the DOM-based map popups/markers, scoped stop buttons, declarative bus SVG, encoded attribution and payload-test results.

The [CSRF route check](docs/csrf-protection.md) records that the current APIs are public reads with no cookie authentication, the form/method regression checks, and protection requirements before adding session-authenticated writes.

The [API CORS policy](docs/cors.md) allows the exact `APP_ORIGIN` plus validated `CORS_ALLOWED_ORIGINS`, handles read-only preflights and keeps credentialed cross-origin sharing disabled. No wildcard or automatic preview-host trust is enabled.

The [SSRF guard](docs/ssrf-protection.md) checks URL schemes and public IP ranges inside the socket DNS lookup, refuses redirects, and protects server provider requests and download scripts. Use its `safeFetch` for future server-side URL inputs.

The [outbound timeout guide](docs/outbound-timeouts.md) lists request budgets and their settings, including guarded-fetch deadlines, map images, long Overpass requests and the bounded CI deploy hook.

The [safe retry guide](docs/outbound-retries.md) explains bounded exponential backoff with jitter, Retry-After, cancellation and which provider/data reads can retry without multiplying API calls or replaying mutations.

The [circuit breaker guide](docs/circuit-breakers.md) covers repeated LTA, NEA and OneMap failures: three failed operations in a minute pause calls for 30 seconds, then one recovery operation tests the dependency. State is local to each warm server/browser owner; existing fallbacks remain available.

## Setup

You need Node.js 24 (what Vercel and the GitHub workflow use) and an LTA DataMall account key, free from https://datamall.lta.gov.sg/.

1. Install the exact package versions in `package-lock.json`:

   ```bash
   npm ci
   ```

   Use `npm ci` rather than `npm install`, so you get the same versions as the live site.

2. Copy `.env.example` to `.env` and put your key in it:

   ```
   LTA_ACCOUNT_KEY="your key"
   ```

   `.env` is ignored by git, so the key stays on your machine. Every other setting has a default. `DATA_GOV_SG_API_KEY` is optional; keyless weather works but takes more requests to fill a cold cache. See [`.env.example`](.env.example) for all settings, units and limits.

### Local virtual environment (macOS / Linux)

This is a Node.js project. The optional `.venv` uses [nodeenv](https://github.com/ekalinin/nodeenv) to keep its own Node.js 24.19.0 and npm 11.17.0, plus npm's cache and global tools, inside the project. Python is used to set up nodeenv; the app's packages are managed with npm and live in this project's `node_modules/`. Both directories are ignored by git.

The environment is already set up on this Mac. In each new terminal, activate it and run the app with:

```bash
cd /Users/admin/Projects/TravelTracker
source .venv/bin/activate
npm run dev
```

To install the existing locked packages, run `npm ci`. To add a package, replace `PACKAGE_NAME` below with its npm name:

```bash
npm install PACKAGE_NAME
# For a development tool instead:
npm install --save-dev PACKAGE_NAME
```

Adding a package updates `package.json` and `package-lock.json`; keep both in git. `npm ci` restores the versions in the lockfile, so it does not add new packages.

Check which runtime is active with `command -v node` and `node --version`. The path should end in `TravelTracker/.venv/bin/node`. To leave both the Node and Python environments:

```bash
deactivate_node
deactivate
```

To recreate the environment on another Mac or Linux machine, from the project folder (Python 3 is needed):

```bash
python3 -m venv .venv
.venv/bin/python -m pip install nodeenv==1.11.0
.venv/bin/python -m nodeenv --node=24.19.0 --prebuilt --with-npm --npm=11.17.0 --isolate-npm -p .venv
source .venv/bin/activate
npm ci
```

## Run it

```bash
npm run dev
```

Then open http://localhost:3000. `server.ts` serves the app with Vite (it reloads as you edit) and the same `/api/*` functions Vercel runs. Open http://localhost:3000/api/health: `status` is `"ok"` once LTA DataMall and NEA both answer, or `"degraded"` otherwise. The public response contains only status, service and timestamp. Restricted server logs record a provider name and safe failure code/status when a probe fails; credentials and configuration details stay out of the response.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the tests in `tests/` |
| `npm run lint` | Type-checks the project (`tsc --noEmit`) |
| `npm run routes` | Downloads LTA's bus routes and stops into `public/bus-routes/` (needs the key) |
| `npm run build` | Runs `npm run routes`, then builds the site into `dist/` |
| `npx vite build` | Builds the site only, keeping the route files you already have |
| `npm run shapes` | Rebuilds the road-following route lines in `public/route-shapes/` from OpenStreetMap |
| `npm run config:check` | Validates local configuration and reports key presence without printing secrets |
| `npm run config:example` | Regenerates `.env.example` from the schema's defaults, without reading local secrets |
| `npm run --silent firewall:rule -- log` | Prints the validated Vercel IP-limit rule; no publish or remote write. See [rate limiting](docs/rate-limiting.md) for rollout status |
| `npm run secrets:scan` | Scans current first-party files and complete local Git history with Gitleaks, reporting only finding locations |

`npm run build` empties `public/bus-routes/` before downloading, so without a key, or if LTA DataMall is down, it leaves none. The app still works (it asks `/api/bus-route` instead), just more slowly. To see the production build locally, run `npm run build`, then:

```bash
NODE_ENV=production npm start
```

## Configuration

[`config/schema.ts`](config/schema.ts) defines one validated, immutable configuration object, imported as `config` from `config/server.ts` by the server, API functions and data scripts. [`config/public.ts`](config/public.ts) defines its browser allowlist; `src/config.ts` exposes that public projection. Vite injects only `config.public` and disables automatic environment-variable exposure. API keys and server settings are never sent with the public object.

The configuration audit moved these settings out of their individual callers:

| Settings | Variables |
|---|---|
| Local runtime and hot reload | `NODE_ENV`, `PORT`, `HOST`, `DISABLE_HMR` |
| LTA endpoint, credentials, request/page timeouts, pagination and retry/cache policy | `LTA_*` |
| Upstream health-check stop and timeout | `HEALTH_*` |
| NEA credentials, request budget/window, dataset lifetimes and CDN policy | `DATA_GOV_SG_API_KEY`, `NEA_*` |
| Route-shape provider mirrors, retry/deadline/query settings and User-Agent | `OVERPASS_*` |
| Browser API/data prefixes, OneMap/NEA bases, polling and request/GPS timeouts | Explicit `VITE_*` fields in `.env.example` |

All defaults and supported variables are generated into [`.env.example`](.env.example), including the platform-provided `VERCEL` flag and a note for the CI-only deploy-hook secret. Blank values use defaults; blank credentials preserve the existing offline/degraded behaviour. Invalid integers, booleans, URLs, stop codes and incompatible time budgets fail before serving or building. Errors name the setting and constraint, without printing its supplied value. URLs must use HTTPS, except for HTTP on localhost, and may not contain credentials, queries or fragments.

Files load from the repository in this order, later values winning: `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local`. Shell/platform environment variables have highest priority. Values are literal: put full URLs in the file rather than references such as `${OTHER_VARIABLE}`. Local runtime defaults to development, and `npm run build` uses production mode for both route generation and Vite; `NODE_ENV` can explicitly select the runtime mode. Leave the example's `NODE_ENV` and `VERCEL` lines commented unless you intend to override those automatic values.

Use `npm run config:check` after changing your local settings and restart the server. Public `VITE_*` values are built into JavaScript, so rebuild/redeploy after changing them. Keep credentials in `LTA_ACCOUNT_KEY` and `DATA_GOV_SG_API_KEY`, never under a `VITE_` name. API and data URL prefixes default to the same origin; external hosts must allow the browser's origin with CORS. The NEA base is deliberately public because it is used both by the server aggregator and by the keyless browser fallback.

Singapore geography, provider response contracts (such as LTA's 500-row pages), weather/health bands, walking and trip-ranking rules, storage keys, branding, attribution and UI constants remain in code: they define the product and data model. Vercel's hashed-asset caching, rewrites/function limits and the GitHub workflow's schedule/job timeout remain in their deployment files, which must be read before application code runs.

## Deploying

See [SECURITY.md](SECURITY.md) for the latest secret-scan result, safe local/Vercel/GitHub storage, redacted logging examples and credential-rotation steps.

Pushing to `main` deploys to Vercel. Vercel installs with `npm ci`, runs `npm run build` and serves `dist/` with the functions in `api/`. It needs `LTA_ACCOUNT_KEY` (and optionally `DATA_GOV_SG_API_KEY`) set in the Vercel project's environment variables.

On the 1st of each month, the "Refresh route data" GitHub workflow rebuilds the route lines and commits any that changed, which redeploys the site with fresh LTA data. If nothing changed, it redeploys through a Vercel deploy hook kept in the repository secret `VERCEL_DEPLOY_HOOK_URL`. You can also run it by hand from the Actions tab.

## Caching: keep React's file the same across deploys

The build splits the JavaScript so returning visitors download as little as possible after a deploy:

| File in `dist/assets/` | What's in it | Changes when |
|---|---|---|
| `react-*.js` | React, react-dom and scheduler | React is upgraded |
| `index-*.js` | The app | The app's code changes |
| `LiveBusMap-*.js` | The map and Leaflet, loaded after the first screen | The map's code changes |
| `index-*.css` | The styles | The classes used in `src/` change |

Each file is named after a hash of its contents, and `vercel.json` sends everything under `/assets/` with `Cache-Control: public, max-age=31536000, immutable`. A browser keeps a file for a year without asking again. After a deploy, the new `index.html` points to new names only for the files that changed, so a deploy that doesn't touch React leaves `react-*.js` in every returning visitor's cache.

To keep it that way:

- **Leave the React group in `vite.config.ts`** (`build.rolldownOptions.output.codeSplitting.groups`). Without it, React goes back into `index-*.js` and is downloaded again after every deploy.
- **Put only content-hashed files in `/assets/`.** Anything there is cached for a year under its name. Data that's refreshed without a rename, like `public/bus-routes/` and `public/route-shapes/`, belongs elsewhere and keeps Vercel's default caching.
- **Don't send `/assets/` to the `index.html` fallback.** The catch-all rewrite in `vercel.json` skips `/assets/`, so a missing file is a 404, not the HTML page cached for a year under a `.js` name.
- **Keep notes out of Tailwind's scan.** Tailwind reads every project file for class names, and a word in a note that looks like one (`sticky`, `table`) adds a CSS rule, renaming the CSS and app files. `src/index.css` excludes the project's Markdown files with `@source not`.
  Configuration descriptions and test fixtures are excluded too, so editing settings or tests does not change the CSS.

To check a change, run `npx vite build` before and after it: the file names that stay the same are the ones browsers will keep.

Error states, temporary saves, alarm capability notices and the minimal public health contract are documented in [docs/error-handling.md](docs/error-handling.md).

[Centralized error tracking](docs/error-tracking.md) uses existing Vercel runtime logs for server exceptions and bounded, privacy-filtered browser reports. Safe reload/dismiss screens show a generated reference. No additional account or secret is needed. Centralized tracking is deployed and verified live (application release 5ae3003); its exact client-error POST firewall extension is active as version 6. See the guide and COMMENTS.md for the delivery evidence.

[Structured logging](docs/structured-logging.md) adds automatic request IDs, route/method, anonymous user context, release labels and response status/duration to shared server logs. This is deployed and verified in application release 9c69da4; the app still has no login or user identity source.

Shared-cache ownership, atomic cross-tab preferences and stale request guards are documented in [docs/concurrency.md](docs/concurrency.md).

Repeated OneMap searches and static trip plans now have bounded five-minute caches; incident provider reads share the existing two-minute freshness window. See [caching and invalidation](docs/caching.md) for keys, TTL settings, cancellation rules and measured results. `npm run profile:lookups` includes repeated-plan cache timings.

Public API IP rate limiting is managed by Vercel WAF: 600 requests per minute per IP per region, shared across API GET/HEAD reads and exactly POST /api/client-errors. The rule is live and returns HTTP 429 for excess matching requests; see [the rate-limit guide](docs/rate-limiting.md). Per-account limits are deferred until verified login exists. Local Express is not protected by the Vercel rule.

Traffic incidents support opt-in `limit`/`offset` pagination with a snapshot fingerprint; the map client loads complete matching pages before route filtering. See [pagination](docs/pagination.md) for bounds, 409 recovery, legacy compatibility and why offset suits the current cached feed. Related arrays inside arrivals/routes/weather remain atomic.
