# BusTrackerSG - Project Instructions, Comments & History

> **Repository:** [https://github.com/Mikazukiangus/NYP_Bus_tracker](https://github.com/Mikazukiangus/NYP_Bus_tracker)  
> **Live Vercel Deployment:** [https://nypbus-tracker.vercel.app](https://nypbus-tracker.vercel.app)  
> **Brand:** BusTrackerSG – a member of NYP Bus

---

## Standing Project Instructions

- Read this file before starting project work and update it on every project-related turn, before the final response. This includes code, configuration, setup, documentation, reviews and standing instructions.
- Append a dated, sequential `Turn N` entry covering the request, actions/findings, actual validation and any outstanding work or delivery status. Preserve the history and never record credentials.
- Use normal, concise completion summaries. No fixed completion phrase is required; this supersedes older completion-phrase instructions, including copies in prior conversation context. Ask explicitly whenever user confirmation is required.
- These instructions are also recorded in `AGENTS.md` and the always-applied `.cursor/rules/project-history.mdc` rule.

---

## 1. Project Overview & Requirements

This application is a real-time Singapore public bus tracking web app inspired by the clean, minimalist design language of Singapore transit portals (SBS Transit), customized for **Nanyang Polytechnic (NYP)** students and Singapore commuters.

### Core Capabilities
- **Nearest Bus Stop Detection**: Automatically calculates Haversine distance between the commuter's location (GPS or selected hub) and all bus stops on a service route, prioritizing the closest stop with estimated walking time.
- **Official LTA DataMall v3 Integration**: Queries real-time bus arrivals with countdown timers, load capacities (`SEA`: Seats Available, `SDA`: Standing Available, `LSD`: Limited Standing), decker types (`SD`, `DD`, `BD`), wheelchair accessibility (`WAB`), and vehicle coordinates.
- **Interactive Live Bus Map (Leaflet)**: Renders route paths, bus stops, user position pulses, and live moving buses with vehicle registrations and speeds.
- **NEA Weather & Air Quality**: Live readings from the nearest NEA stations (temperature, rainfall, humidity, wind, heat stress), regional PSI and PM2.5, UV index, lightning nearby, the 2-hour / 24-hour / 4-day forecasts, and commuter alerts built from them.
- **Favourites Manager**: Allows commuters to bookmark frequent bus services and stops with instant arrival previews and `localStorage` persistence.
- **Location Switcher**: Pre-configured with Singapore commute hubs and tertiary campuses, featuring **Nanyang Polytechnic (NYP)** as the primary preset.

---

## 2. Chronological Log of Instructions & Comments

### Turn 1: Initial Implementation Brief
- **User Prompt**:
  > *"build me a website that shows the bus arrival times at the nearest bus stop to user after they enter the bus number. You can reference the design from the website sbstransit.com.sg, for a clean, minimalist layout with real-time location tracking. for live bus positions on a map and the weather data from NEA. Ensure the mobile-responsive interface includes a favourites list for quick access."*
- **Action & Implementation**:
  - Implemented core data structures in `src/types/bus.ts`.
  - Built `src/data/singaporeBuses.ts` with real Singapore bus routes (14, 65, 147, 190, 7, 10, 174, 857, etc.) and procedural route generation for any arbitrary bus service number.
  - Implemented `src/services/busTrackerService.ts` for Haversine distance calculation, arrival countdowns, and live bus movement interpolation.
  - Created interactive Leaflet map component `src/components/LiveBusMap.tsx`.
  - Created NEA weather widget `src/components/NEAWeatherWidget.tsx`.
  - Created favorites drawer `src/components/FavoritesModal.tsx` and location selector `src/components/LocationPickerModal.tsx`.
  - Created `src/components/Header.tsx`, `src/components/BusSearchBox.tsx`, `src/components/NearestStopBanner.tsx`, and `src/components/ArrivalDisplay.tsx`.

---

### Turn 2: Git Repository Setup & Initial Push
- **User Prompt**:
  > *"git push <GITHUB_PERSONAL_ACCESS_TOKEN>@https://github.com/Mikazukiangus/NYP_Bus_tracker.git"*
- **Action & Implementation**:
  - Initialized git repository with `main` branch.
  - Configured git author settings.
  - Staged all files, committed, and pushed to `https://github.com/Mikazukiangus/NYP_Bus_tracker.git`.
  - Sanitized the remote URL to ensure authentication tokens are never stored in plaintext in `.git/config`.

---

### Turn 3: LTA DataMall v3 Endpoint Configuration & Health Monitoring
- **User Prompt**:
  > *1. configure the bus arrival information using this LTA endpoint. # Next buses at a stop (v3 - the current version; 20-second refresh):  
  > `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=83139`  
  > ...optionally one service: `&ServiceNo=15`  
  > 2. create a folder under the project main `/api` and place it there. I will add in the api key in vercel environment variable later under `LTA_ACCOUNT_KEY`  
  > 3. create `/api/health.ts` for me to monitor the health of my apis.*
- **Action & Implementation**:
  - Created `/api/bus-arrival.ts`:
    - Handles queries: `BusStopCode` and optional `ServiceNo`.
    - If `LTA_ACCOUNT_KEY` is present in `process.env`, calls `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival` with `AccountKey` header.
    - If `LTA_ACCOUNT_KEY` is pending, provides high-fidelity simulated fallback with schema adherence and warning notice.
  - Created `/api/health.ts`:
    - Reports service status, uptime, node environment, LTA DataMall v3 connection state, and whether `LTA_ACCOUNT_KEY` is configured.
  - Created `server.ts` to support both local full-stack dev execution (`tsx server.ts`) and production static hosting.
  - Added `LTA_ACCOUNT_KEY` to `.env.example`.
  - Committed and pushed changes to GitHub.

---

### Turn 4: React 19 State Update Bugfix
- **User Prompt**:
  > *Fix the errors in the app  
  > error 0: Cannot update a component (`App`) while rendering a different component (`ArrivalDisplay`). To locate the bad setState() call inside `ArrivalDisplay`, follow the stack trace as described in https://react.dev/link/setstate-in-render App ArrivalDisplay ArrivalDisplay*
- **Action & Implementation**:
  - **Root Cause**: In `ArrivalDisplay.tsx`, the parent `onRefresh()` callback was invoked directly inside `setSecondsUntilRefresh((prev) => { if (prev <= 1) { onRefresh(); return 15; } return prev - 1; })`.
  - **Fix**: Decoupled state updates from side effects. Stored `onRefresh` inside a `useRef` and executed the refresh trigger in a dedicated `useEffect` when the counter cycles from 1 to 15.
  - Verified fix with `compile_applet` and `lint_applet`.
  - Committed and pushed fix to GitHub.

---

### Turn 5: Vercel Configuration & Live Deployment Verification
- **User Prompt**:
  > *"environment variable added to Vercel already, please check."*  
  > *"THe Vercel URL is https://nypbus-tracker.vercel.app"*
- **Action & Implementation**:
  - Added `vercel.json` with build commands, output directory (`dist`), and SPA rewrites preserving `/api/(.*)`.
  - Pushed to GitHub to trigger Vercel deployment with the newly injected `LTA_ACCOUNT_KEY`.
  - Tested live endpoints via curl:
    - `https://nypbus-tracker.vercel.app/api/health` returned `200 OK` with `ltaAccountKeyConfigured: true` and `status: "READY (LTA_ACCOUNT_KEY provided)"`.
    - `https://nypbus-tracker.vercel.app/api/bus-arrival?BusStopCode=83139&ServiceNo=15` returned live LTA v3 data (`source: "LTA_DATAMALL_V3"`) with real bus coordinates and arrival timestamps.

---

### Turn 6: Nanyang Polytechnic (NYP) Location & Route Integration
- **User Prompt**:
  > *"I can't change the location to Nanyang polytechnic"*
- **Action & Implementation**:
  - Updated `src/data/singaporeBuses.ts` to add **Nanyang Polytechnic (NYP Campus / AMK Ave 8)** (`lat: 1.3800, lng: 103.8489`) as the primary preset location.
  - Added nearby transit hubs: Yio Chu Kang MRT & Bus Interchange and Ang Mo Kio Hub.
  - Added **Bus 72** (Yio Chu Kang Interchange ➔ Tampines Interchange via NYP & Hougang) with authentic NYP bus stops:
    - `55189`: **Nanyang Poly (Main Gate)**
    - `55181`: **Opp Nanyang Poly**
    - `55171`: **Yio Chu Kang Bus Interchange**
  - Revamped `src/components/LocationPickerModal.tsx` with:
    - A 1-tap **Nanyang Polytechnic (NYP)** featured banner.
    - Live search input matching keywords (`"NYP"`, `"Nanyang"`, `"Polytechnic"`, `"AMK"`, etc.).
    - Filter tabs: `All Hubs`, `NYP & Campuses`, `North (AMK/YCK)`, `Central`.
  - Set Nanyang Polytechnic as the default starting location and Bus 72 as the default route.
  - Committed and pushed changes to GitHub.

---

### Turn 7: Official NEA 2-Hour Weather Forecast API Integration
- **User Prompt**:
  > *Connect the below endpoints for NEA weather forecast. # Weather & environment (v2 host, wrapped responses) - all keyless, all live:  
  > `https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast`*
- **Action & Implementation**:
  - Verified live endpoint structure (`data.area_metadata` with 47 monitoring stations, `data.items[0].forecasts`, `valid_period`).
  - Created `/api/weather.ts` serverless proxy with cache headers (`s-maxage=60`).
  - Rewrote `src/services/neaWeather.ts` to calculate the nearest NEA station to the commuter's active coordinates:
    - Commuters at Nanyang Polytechnic automatically map to **"Ang Mo Kio"** (~1.2 km away).
  - Extracted forecast text (e.g., `"Partly Cloudy (Day)"`, `"Light Showers"`, `"Thundery Showers"`), valid period, and commuter transit rain alerts.
  - Added `/api/weather` route to `server.ts` and updated `/api/health.ts`.
  - Committed and pushed changes to GitHub.

---

### Turn 8: Rebranding to "BusTrackerSG - a member of NYP Bus"
- **User Prompt**:
  > *Change the name to BusTrackerSG - a member of NYP Bus* (with attached screenshot of header)
- **Action & Implementation**:
  - Updated `src/components/Header.tsx`:
    - Top corporate banner: `BusTrackerSG | A member of NYP Bus`
    - Main title: `BusTrackerSG` with `LIVE` tag
  - Updated `src/App.tsx` footer: `BusTrackerSG • A member of NYP Bus` with `NYP` badge.
  - Updated `index.html`: `<title>BusTrackerSG - A member of NYP Bus</title>` and OpenGraph tags.
  - Updated `/api/health.ts` service name.
  - Verified compilation and pushed commit `c33e455` to GitHub.

---

### Turn 9: Real LTA Route & Stop Data, Dependency Cleanup, NYP Stop Corrections
- **User Prompt**:
  > *"continue the project ... read COMMENTS.md"* → review found the NYP/Bus 72 stop data was fabricated; user approved fixes A–C and push.
- **Findings**:
  - Hardcoded stops `55189`/`55181`/`55171` were labelled "Nanyang Poly (Main Gate)" / "Opp Nanyang Poly" / "Yio Chu Kang Interchange", but are actually *Yio Chu Kang Stn*, *Opp Yio Chu Kang Stn* and *Castle Green*. Bus 72 does not call at them, so the default view was falling back to simulated arrivals.
  - Real NYP stops: `55329` Nanyang Poly (AMK Ave 8, Bus 72 → Tampines), `55321` Opp Nanyang Poly (Bus 72 → Yio Chu Kang Int), `54351` Nanyang Poly (AMK Ave 5, Bus 45 / 50 / 72 / 159). Yio Chu Kang Int is `55509`.
  - `npm install` failed on a clean checkout (esbuild 0.25 devDependency conflicted with Vite 8's esbuild peer range).
- **Action & Implementation**:
  - **A. Real route data** – new `/api/bus-route?ServiceNo=72` serverless endpoint pages through LTA DataMall `BusStops`, `BusRoutes` and `BusServices` (500 rows/page, 8 pages in parallel), caches them in memory per warm instance (12 h) and at the CDN (`s-maxage=86400, stale-while-revalidate=604800`). Returns a `BusRoute` with real stop codes, names, roads, coordinates and both directions; `404` for unknown services, `503` when `LTA_ACCOUNT_KEY` is missing. `maxDuration: 60` set in `vercel.json` for cold loads.
  - Client (`src/App.tsx`, `src/services/busTrackerService.ts`) now loads routes via `fetchBusRoute()`, auto-picks the direction whose nearest stop is closest to the user, and tracks the selected stop by code (so favourites restore the right stop after the async load). Unknown bus numbers show a "not a current LTA bus service" notice instead of a made-up route; if the API is unreachable, the bundled data is used with an "approximate stops" notice.
  - **B. Dependencies** – removed unused `@google/genai`, `autoprefixer` and the conflicting `esbuild` devDependency; renamed package to `bustrackersg`; regenerated `bun.lock` (the lockfile Vercel uses); trimmed `.env.example` to `LTA_ACCOUNT_KEY` / `PORT`.
  - **C. NYP corrections** – Bus 72 offline fallback in `src/data/singaporeBuses.ts` replaced with the real 45/44-stop LTA sequence; default favourite is now Bus 72 @ `55329` Nanyang Poly; popular chips include NYP services 45, 50 and 159.
- **Known remaining simulations**: map bus markers (`initLiveBuses`/`stepLiveBuses`), bus registration numbers, and favourites-modal arrival previews are still generated client-side. Other entries in `POPULAR_ROUTES` (14, 65, 147, ...) still contain approximate stops but are only used when `/api/bus-route` is unavailable.

---

### Turn 10: Free Map Data (OneMap + OpenStreetMap), Real Bus Positions, Mobile/Desktop Optimisation
- **User Prompt**:
  > *"Can we also figure how to pull some free map data for the map? Also ensure the site is mobile optimized and desktop optimized."*
- **Free map data sources evaluated**:
  - **OneMap basemap tiles** (Singapore Land Authority) – `https://www.onemap.gov.sg/maps/tiles/{Default|Grey|Night}/{z}/{x}/{y}.png`. Free, no API key, CORS-enabled, zoom 11–19, Singapore only. Attribution (logo + "OneMap © contributors | Singapore Land Authority") is required and shown.
  - **OpenStreetMap bus route relations** via the public Overpass API – OSM has `type=route, route=bus, ref=<service>` relations for Singapore services (e.g. Svc 72 both directions, Go-Ahead). Free under ODbL with attribution. Public Overpass instances are flaky (504/500s seen), so results are cached hard.
  - (Considered: `data.busrouter.sg` route polylines – fast, but third-party with unclear licensing, so not used.)
- **Action & Implementation**:
  - New `/api/route-shape?ServiceNo=72` – queries Overpass (kumi.systems → overpass-api.de → mail.ru fallbacks, Singapore bbox), stitches each relation's ordered ways into one line (handles reversed ways and roundabout rings), simplifies with Douglas–Peucker (~3 m), and caches 30 days at the CDN. `maxDuration: 60` in `vercel.json`.
  - `src/services/routeShape.ts` matches each OSM line to the LTA direction by origin/destination proximity (≤1 km) and requires ≥90% of LTA stops within 100 m of the line; otherwise the map keeps dotted stop-to-stop lines (guards against outdated OSM routes).
  - `LiveBusMap.tsx`: OneMap basemap with Standard/Grey/Night switcher, Singapore max bounds, road-following route line (solid) vs. stop-to-stop (dotted), auto-framing of user + nearest stop on route/direction/location change.
  - **Simulated moving buses removed.** The map now plots the real 1st/2nd/3rd buses due at the selected stop using GPS coordinates from the LTA BusArrival response (only when `Monitored=1` and data is live), with ETA labels and load/deck/WAB popups.
  - **Mobile**: fixed horizontal overflow at 375 px (header was 467 px wide); compact sticky header (corporate bar and duplicate location pill hidden on phones), full-width tabs with short labels, one-line location bar, compact search box, icon-only map controls, map height 60vh, arrival cards in a 3-up compact grid via container queries, larger touch targets.
  - **Desktop/tablet**: container queries so the arrival cards, map header and weather widget adapt to their column width (e.g. compact cards in the Route Stops side column), shorter card labels, no clipped toolbars at 1280 px.
  - Arrival badge now says "Simulated (live feed unavailable)" instead of "LTA Real-Time Feed" when falling back; made-up registration/speed lines removed from arrival cards.
- **Still simulated**: favourites-modal arrival previews; NEA widget temperature/humidity/wind (the 2-hour forecast API only provides the forecast text).

---

### Turn 11: Live Verification & Static Route Shapes
- **User Prompt**:
  > *"yes push it and check the live site"*
- **Live findings** (https://nypbus-tracker.vercel.app):
  - OneMap basemap, LTA route loading (operator now correctly shows **GAS** – Go-Ahead runs Bus 72) and real bus GPS markers all work. Example: Bus 72 towards Yio Chu Kang at Opp Nanyang Poly (`55321`) showed 3 tracked buses at their LTA GPS positions.
  - At Nanyang Poly (`55329`, 2nd stop out of Yio Chu Kang Int) the map correctly shows "No live GPS": the next buses are still at the interchange, so LTA returns `Monitored=0` and `0.0, 0.0` coordinates.
  - `/api/route-shape` was unreliable in production: 45 and 14 failed after ~32 s and 159 hung, because public Overpass mirrors failed/timed out from Vercel's `sin1` region (logs: `AbortError`).
  - `/api/bus-route` takes ~10 s on the first request after a deploy (Vercel clears the CDN cache per deployment and the function must page through all LTA route data); the offline route is shown meanwhile.
- **Action & Implementation**:
  - Replaced the runtime `/api/route-shape` endpoint with **pre-built static files**: `scripts/build-route-shapes.ts` (`npm run shapes`) makes one bulk Overpass query for every Singapore bus route (~54 MB, ~75 s), stitches + simplifies each relation and writes `public/route-shapes/<SERVICE>.json` (673 services, ~2.5 MB total, ~5–9 KB each). Served from Vercel's CDN, no runtime dependency on Overpass.
  - Coverage: 595 of LTA's 602 services have an OSM shape; 780 of 798 route directions (97.7%) pass the stop-coverage check and draw road-following lines, the rest use dotted stop-to-stop lines.
  - Re-run `npm run shapes` occasionally (e.g. monthly) and commit the output to pick up route changes.

---

### Turn 12: Static LTA Route Data Generated at Build Time
- **User Prompt**:
  > *"Yes"* (to building the LTA route data into static files to remove the ~10 s cold-start wait)
- **Action & Implementation**:
  - New `scripts/build-bus-routes.ts` runs before `vite build` (`"build": "tsx scripts/build-bus-routes.ts && vite build"`). On Vercel, where `LTA_ACCOUNT_KEY` is available at build time, it loads LTA DataMall `BusStops` / `BusRoutes` / `BusServices` once (reusing `loadDatasets` / `buildRoute` exported from `api/bus-route.ts`) and writes `public/bus-routes/<SERVICE>.json` for every service (~600 files, ~3 MB) plus `public/bus-routes/index.json` (`generatedAt` + service list).
  - Without a key (local builds) or if LTA is unreachable, the script logs a warning and skips; the deploy still succeeds and the app uses `/api/bus-route` as before. `public/bus-routes/` is git-ignored because it is regenerated on every deploy. `npm run routes` runs it on its own.
  - Client (`fetchBusRoute` in `src/services/busTrackerService.ts`): static file first → if missing and the index exists but doesn't list the service, show "not a current LTA bus service" instantly → otherwise fall back to `/api/bus-route`.
  - **Freshness**: route data is as fresh as the last deploy. LTA amends routes from time to time, so redeploy periodically (e.g. a monthly Vercel Deploy Hook) to refresh it.

---

### Turn 13: Real Weather & Air Quality Data
- **User Prompt**:
  > *"Suggest improvements to the data provided if it makes logical sense, and for the Weather, add rain, psi, pm2.5, temperature etc"*
- **Findings**: the weather widget's temperature, humidity, wind and "rain chance" were invented from the forecast wording (e.g. "Showers" → 28 °C / 70%), and the weather tab's advisory card ("Wet Weather Driving Protocol", sheltered linkway) was made up. At the time of checking, Ang Mo Kio's real forecast was "Thundery Showers" and the 24-hr PSI was 170 (Unhealthy).
- **Action & Implementation**:
  - `/api/weather` (`api/weather.ts`) now aggregates 12 NEA datasets from `api-open.data.gov.sg/v2/real-time/api`: `two-hr-forecast`, `air-temperature`, `rainfall`, `psi`, `pm25`, `relative-humidity`, `twenty-four-hr-forecast`, `uv`, `weather?api=lightning`, `weather?api=wbgt`, `wind-speed`, `four-day-outlook`. The response is one Singapore-wide snapshot (~24 KB) so the CDN can cache it for everyone.
  - **Rate limit**: data.gov.sg allows 6 keyless calls per 10 s. Each dataset has its own in-memory TTL (2 min for station readings, 10 min for PSI/PM2.5/UV/WBGT, 30–60 min for forecasts); each instance makes at most 5 calls per 10 s window (10 with `DATA_GOV_SG_API_KEY`), most important first, and serves the last good value if a call fails. Response lists `missing` / `stale` datasets; complete snapshots are cached `s-maxage=60, stale-while-revalidate=300`, incomplete ones `s-maxage=5`, and the client re-requests after 12 s (up to 3 times) to fill gaps.
  - `src/services/neaWeather.ts`: `fetchWeatherSnapshot()` (falls back to the keyless 2-hr forecast direct from data.gov.sg if `/api/weather` is down) and `summarizeWeather(snapshot, lat, lng)` – nearest station for temperature / humidity / wind (knots → km/h) / WBGT, heaviest rain reading among gauges within 3 km, nearest PSI region, lightning strikes within 10 km in the last 15 min. Bands: PSI (Good ≤50, Moderate ≤100, Unhealthy ≤200, Very Unhealthy ≤300, Hazardous), 1-hr PM2.5 (Normal ≤55, Elevated ≤150, High ≤250, Very High), UV (Low ≤2 … Extreme 11+), rain intensity from mm/h. Alerts (lightning, rain now or forecast, PSI with NEA's health advisory wording, PM2.5, heat stress, high UV) are sorted by severity.
  - `NEAWeatherWidget.tsx` rewritten: compact variant beside the map (forecast + temperature, Rain / PSI / PM2.5 / Humidity / Wind / UV tiles, top 2 alerts) and full variant on the Weather tab (adds heat stress, lightning, all alerts, next-24-hour periods for the user's region and the 4-day outlook). Readings show station and distance. One snapshot is fetched every 5 minutes and re-summarised when the location changes (no refetch).
  - Removed the made-up weather-tab advisory card. Fixed a Leaflet `_leaflet_pos` crash when the map is unmounted mid zoom animation (e.g. switching tabs right after "Nearest Stop").
  - Shared types in `src/types/weather.ts`; `NEAWeather` removed from `src/types/bus.ts`. `/api/health` reports whether `DATA_GOV_SG_API_KEY` is set.

---

### Turn 14: Data Improvements (GPS vs Scheduled, All Buses at Stop, First/Last Bus, Incidents, Freshness)
- **User Prompt**:
  > *"push it and do 1-8"* (the eight data improvements suggested in Turn 13)
- **Action & Implementation**:
  1. **Live GPS vs scheduled** – each arrival card shows whether LTA's estimate comes from the bus's GPS (`Monitored=1`) or the timetable (`Monitored=0`, e.g. bus still at the interchange); legend added. Shared `TrackingBadge` in `src/components/ArrivalBits.tsx`.
  2. **All buses at the stop** – arrivals now use one LTA BusArrival call per stop (no `ServiceNo`), shared by the main board and the new `StopServicesBoard` (Arrivals and Route Stops tabs): every service due, its destination, next two buses, load and GPS/scheduled. Tapping a service tracks it from the same stop (`pickDirectionForStop` chooses the direction that serves it). Destination names come from `public/bus-routes/stops.json` (stop code → name, built with the route files). Removed the old "use the first service if the requested one is missing" fallback, which could show another bus's times.
  3. **First/last bus** – `api/bus-route.ts` now includes LTA's `WD/SAT/SUN_FirstBus/LastBus` per stop (`firstLastBus`); the arrivals board shows today's first/last bus at the selected stop (Sunday times on Sundays; before 4 am the previous day's schedule) with an expander for all three day types. Route files grow to ~2.5 KB gzipped each.
  4. **Removed invented content** – header "Bus Services: Normal Operation", footer "WSH & ISO certified" (now lists the real data sources), the `sheltered` stop flags, and the generated bus registration numbers / speeds. Header clock now always shows Singapore time.
  5. **Favourites** – modal and Arrivals-tab mini card show live next-bus times (`useFavoriteArrivals` in `src/services/favoriteArrivals.ts`, one call per distinct stop, every 30 s while visible).
  6. **Traffic incidents** – new `/api/traffic-incidents` (LTA DataMall `TrafficIncidents`, CDN cache 2 min). The client refreshes every 3 min and shows incidents within 150 m of the current route line as map markers with LTA's message, plus a count in the map header.
  7. **Walking time** – labelled as a straight-line estimate on the nearest-stop banner; the Route Stops list notes distances are straight-line. Stop numbers now stay correct while filtering.
  8. **Freshness** – `.github/workflows/refresh-data.yml` runs monthly (03:00 SGT on the 1st, or manually): rebuilds OSM route shapes and commits only the routes that changed (`build-route-shapes.ts` now leaves unchanged files alone); if nothing changed it calls the Vercel Deploy Hook (`monthly-data-refresh`, ref `main`, URL stored as the `VERCEL_DEPLOY_HOOK_URL` repository secret) so the build regenerates the LTA route data.
- **Still simulated**: only the arrival-board fallback when the LTA feed is unreachable (labelled "Simulated").

---

### Turn 15: Arrival Reliability, Upstream Health Checks & Refresh Schedule (10 October 2026)
- **User Prompt**:
  > *"continue the project ... read COMMENTS.md"* → *"Address problems found in the review"*.
- **Review findings**:
  - Initial generated arrival times were labelled as live until the first API response. Changing stops could briefly show the previous stop's times and GPS markers under the new stop's name.
  - Arrival polling belonged to `ArrivalDisplay`, so it stopped while the Weather tab was open. Manual refresh near the countdown boundary could trigger two refreshes.
  - `/api/health` always returned `ok` / HTTP 200 and treated a configured LTA key as proof of connectivity without checking the upstream.
  - The monthly workflow used `0 19 1 * *` in UTC, which runs at 03:00 SGT on the **2nd**, despite its comment saying the 1st.
- **Action & Implementation** (local branch `codex/arrival-reliability`):
  - New `src/services/useStopArrivals.ts` owns the selected stop's snapshot, loading state, countdown, manual refresh and polling. A stop change immediately hides the old snapshot; late responses cannot replace the current stop's data. The next poll is scheduled 15 s after a request completes, preventing overlapping automatic requests. Polling continues across tabs and no longer refetches just because route geometry loads.
  - The main board, all-services board and map derive their data from that snapshot. Initial/loading views show no invented times or GPS markers. The simulated fallback remains clearly labelled after a failed live request, and successful checks show their Singapore timestamp.
  - Arrival parsing rejects responses for another stop and invalid arrival timestamps (which previously became a misleading 99-minute ETA).
  - `/api/health` now probes LTA BusArrival at NYP stop `55329` and NEA's 2-hour forecast in parallel, with 5-second timeouts and response validation. Both must succeed for HTTP 200 / `ok`; missing credentials or a failed probe produce HTTP 503 / `degraded`. Each probe reports its HTTP status, latency and check time; failures expose a generic reason only. Responses use `Cache-Control: no-store`. These are representative LTA/NEA probes, not checks of every route or weather dataset.
  - Monthly refresh now uses `0 3 1 * *` with `timezone: Asia/Singapore`, as supported by [GitHub's current workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule).
- **Validation**:
  - `npm test`: 10 regression tests passed (healthy/degraded health responses, missing/rejected credentials, invalid NEA payloads, timeout handling, stop identity, simulated vs live data, invalid timestamps, and empty services).
  - `npm run lint` and `npm run build` passed. The local build has no LTA key, so build-time route generation was skipped as designed.
  - Chrome checks with controlled arrival responses passed at **1440 px** and **375 px**: initial loading, rapid direction/stop switching with delayed responses, polling while Weather is open, simulation/recovery, no horizontal overflow and no browser exceptions. Map tiles and weather datasets were stubbed for these arrival-focused checks.
  - Existing deployed endpoints were checked before editing: NYP stop `55329` returned real LTA Bus 72 arrivals; `/api/weather` returned real NEA data with cold-start datasets still filling. The new local `/api/health` returned HTTP 503 for the missing local LTA key and confirmed the actual NEA upstream was reachable (HTTP 200).
- **Delivery**: prepared on `codex/arrival-reliability`; the user subsequently authorized committing and deploying live (Turn 16). Publication uses `main`, and production verification is reported in the deployment response.

---

### Turn 16: Commit & Live Deployment (10 October 2026)
- **User Prompt**:
  > *"commit and deploy live"*.
- **Publication target**: the existing `nypbus-tracker` Vercel project in `carbon-bc04`, linked to this GitHub repository. Publish the reviewed fixes through `main` to [https://nypbus-tracker.vercel.app](https://nypbus-tracker.vercel.app).
- **Validation already completed**: 10 regression tests, TypeScript, production build, and desktop/mobile browser checks (see Turn 15).
- **Production acceptance checks**: confirm Vercel deploys the new commit, then check the site, upstream-probing `/api/health`, NYP arrivals, route data, weather and incidents. The deployed runtime result is reported in chat after completion.

---

### Turn 17: Wada Plate 259 Colour Scheme (10 October 2026)
- **User Prompt**:
  > *"i want to change the colour scheme to \"Lemon Yellow & Green Blue +2\", plate 259 from Sanzo Wada's 1933 dictionary of colour combinations - lemon yellow, green blue, helvetia blue, warm gray."*
- **Palette**: Lemon Yellow `#F8ED43`, Green Blue `#099197`, Helvetia Blue `#005B8D`, Warm Gray `#A1A39A`; screen swatches verified against the [plate 259 archive](https://colorcombinations.org/palettes/wada-259-lemon-yellow-green-blue/).
- **Implementation**:
  - Central Tailwind theme tokens in `src/index.css`, with lighter and darker tones for readable small text and restrained surfaces.
  - Lemon actions, selected directions, nearest-stop badges and first-arrival highlight; Helvetia branding, navigation, service badges and map route; Green Blue location/weather accents and live/available states; warm neutral backgrounds, dividers and text. Alert and capacity labels retain their explicit severity cues.
  - Applied to all four tabs, both dialogs, Leaflet markers/popups/legend and browser `theme-color`.
  - Darkened secondary text, added consistent keyboard focus, accessible marker/control names and a wheelchair-icon role; route-stop rows are now keyboard-operable buttons.
- **Validation**: TypeScript, all 10 regression tests and production build passed. Chrome checks at 1440 px and 375 px confirmed the four exact tokens, focus styling, map stroke, keyboard stop selection and no horizontal overflow/browser errors. Axe reported zero WCAG A/AA violations across Arrivals, Map (including the stop popup), Stops, Weather, Favourites and Location at both widths, using live-derived route/weather fixtures and controlled arrival fixtures.
- **Publication**: continue the user's existing commit-and-live-deploy direction through the linked `nypbus-tracker` Vercel project; confirm the exact commit and deployed palette before reporting completion.
- **Production check**: the first deployed weather cold start exposed low contrast in the small missing/stale-readings message; darkened that warning and added an incomplete-weather browser audit at both widths before the follow-up deploy.

---

### Turn 18: Remember Commuter Location (10 October 2026)
- **User Prompt** (comment on the current-location bar):
  > *"let this be the last saved location or new gps location"*
- **Implementation**:
  - Restore the last chosen preset or GPS coordinates from browser storage immediately on startup. NYP remains the first-visit fallback when no valid saved location exists.
  - Save each location change, including a fresh GPS fix. Request uncached GPS coordinates on startup and from the location picker; keep the saved location when GPS is denied, times out or is outside Singapore.
  - A delayed startup GPS callback cannot replace a newer manual location choice. Location changes still update the nearest stop, route direction, map and weather together.
  - Shared location validation tolerates corrupt/blocked storage and rejects invalid coordinates; a GPS selection outside Singapore explains how to choose a local preset.
- **Validation**: TypeScript, all 14 tests and production build passed. Desktop (1440 px) and the commented viewport (537 px) browser checks covered preset/GPS persistence across reloads, denied/timed-out GPS, fresh GPS, delayed-fix races, explicit GPS selection, corrupt-storage fallback and no overflow/browser errors.
- **Publication**: use the existing commit-and-live-deploy instruction, then verify the same reload and GPS flows on the deployed app.

---

## 3. Architecture & API Endpoints Summary

### Serverless & Proxy Endpoints
| Endpoint | Method | Description | Data Source |
|---|---|---|---|
| `/api/health` | GET | Runtime health monitor; 200 when both probes succeed, 503 when degraded | Live LTA BusArrival + NEA 2-hour forecast probes; environment check |
| `/api/bus-arrival` | GET | Live arrivals for every service at a stop (or one service with `ServiceNo`): ETA, load, deck, GPS position / monitored flag | Singapore LTA DataMall v3 |
| `/api/traffic-incidents` | GET | Live traffic incidents across Singapore (the client shows those near the route) | LTA DataMall TrafficIncidents |
| `/api/bus-route` | GET | Real stop sequence (both directions) for a service; fallback when static files are missing | LTA DataMall BusRoutes + BusStops + BusServices |
| `/bus-routes/<SERVICE>.json`, `/bus-routes/index.json` | GET (static) | Real stop sequences with first/last bus times, and the service list, generated at build time | LTA DataMall, via `scripts/build-bus-routes.ts` |
| `/bus-routes/network.json` | GET (static) | Every stop (code, name, road, position) and every service direction (stop order + road distances), for stop names, nearest bus stops, stop search and trip planning in the browser (~135 KB gzipped) | LTA DataMall, via `scripts/build-bus-routes.ts` |
| `/route-shapes/<SERVICE>.json` | GET (static) | Road-following route geometry for a service | OpenStreetMap (ODbL), pre-built by `npm run shapes` |
| `/api/weather` | GET | Singapore-wide snapshot of 12 NEA datasets (forecasts, station readings, PSI/PM2.5, UV, lightning, WBGT), with the last hour of rain gauge readings for the rain nowcast; the client picks the nearest station/region | NEA via data.gov.sg v2 real-time API |

Map basemap tiles and address / postal-code search (`https://www.onemap.gov.sg/api/common/elastic/search`) are called directly by the browser from OneMap (Singapore Land Authority); no proxy or key needed.

### Query Parameters for `/api/bus-arrival`
- `BusStopCode` (Required): 5-digit bus stop code (e.g. `83139`, `55329`, `09037`).
- `ServiceNo` (Optional): Specific service number (e.g. `15`, `72`, `14`).

### Query Parameters for `/api/bus-route`
- `ServiceNo` (Required): Bus service number (e.g. `72`, `45`, `851e`).

---

## 4. Environment Variables Reference

| Variable | Description | Required Location |
|---|---|---|
| `LTA_ACCOUNT_KEY` | Land Transport Authority DataMall API Key | Vercel Project Environment Variables |
| `DATA_GOV_SG_API_KEY` | Optional data.gov.sg API key; raises the rate limit for `/api/weather` (keyless works) | Vercel Project Environment Variables |
| `PORT` | Local server port (Default: 3000) | Development environment |

The complete reference, including operational settings added in Turn 51, is generated in [`.env.example`](.env.example) from `config/schema.ts` and its public allowlist in `config/public.ts`. See the README's Configuration section for file priority, validation and the server/browser boundary. The table above lists the original primary inputs, not every supported setting.

### Turn 19: Refresh Workflow Test & Hardening (10 October 2026)
- **User Prompt**:
  > *"run the refresh workflow now to test it"* → *"yes, do both and push"*
- **Manual test run**: the redeploy path worked (Deploy Hook → production deploy, `bus-routes/index.json` regenerated at 14:21 UTC with first/last bus times). The OSM rebuild failed because all three Overpass servers returned HTTP 504/500, but the job still showed green because that step is `continue-on-error`.
- **Implementation**:
  - `scripts/build-route-shapes.ts` now tries every Overpass instance in up to 3 rounds, pausing 1 min then 2 min between rounds, within a 25-minute overall deadline (inside the job's 30-minute limit).
  - `.github/workflows/refresh-data.yml`: if the shapes step still fails, a follow-up step posts a "Route shapes not refreshed" warning annotation and a note in the run summary. Updated `actions/checkout` and `actions/setup-node` to v7 (Node.js 24 runtime) to clear GitHub's Node.js 20 deprecation warning.
- **Validation**: the shapes script type-checks; a stubbed run with every Overpass call failing showed all three rounds and the final error without touching any route files.

---

### Turn 20: Location Search, Buses Near You & Trip Planner (10 October 2026)
- **User Prompt**:
  > *"For the current location, i would like to be able to use GPS location, or a location which i can input or the postal code of the location. And for "Find Bus Service", instead of showing popular bus services, it should show the bus services that are around the area. There should also be a field to input the location that you would like to go to and it should show you the buses to take to that location. This route should also be reflected on the map. Figure out how this can be done in a nice logical UI/UX."*
- **UX design**:
  - **From** (`LocationBar.tsx`): the location bar shows where trips start, with an icon for how it was set (GPS with accuracy, place, address, postal code or bus stop), a one-tap **GPS** button and **Change**.
  - **Set your location** (`LocationPickerModal.tsx`, a bottom sheet on phones): one search box for address, place, 6-digit postal code or bus stop (name or 5-digit code), then "Use my current GPS position", recent places, NYP and suggested places. The old category chips were removed.
  - **Find Bus Service** (`BusSearchBox.tsx`): "Bus number" and "Where to?" side by side (stacked on phones). The "Popular" chips are now **Near you**: every service at stops within 500 m (widening to 800 m / 1.5 km when nothing is nearby), ordered by the nearest stop; tapping one tracks it from that stop. "Popular" only returns if the network data can't load.
  - **Buses to <destination>** (`TripPlannerCard.tsx`): up to 5 direct options plus changes when they are at least 8 min faster (or when nothing is direct). Each shows the bus(es), walk to the boarding stop, stops ridden, live next buses ("Leave in 6 min"), GPS/scheduled, and the door-to-door estimate with arrival time. The best option is selected automatically once live times are in; the selected option expands into steps (walk → board → ride/get off → change → walk) with "Live times" buttons to track each bus. If walking is quicker it says so.
  - **Map** (`LiveBusMap.tsx`): the chosen trip is drawn in its own layer above the route: dashed walking lines, the ridden part of each bus route in lemon with a Helvetia casing (road-following when OSM geometry matches), boarding markers with the service number, alighting dots and a destination flag; the full tracked route fades and its stops hide (Stops toggle brings them back). A "Trip" button reframes the whole trip; the header reads "Trip to …".
- **Implementation**:
  - `scripts/build-bus-routes.ts` writes `public/bus-routes/network.json` (replaces `stops.json`): stops as `[code, name, road, lat, lng]` and each service direction as stop indexes plus per-stop road distance in 100 m units, from LTA's `Distance` field (straight-line ×1.25 where missing). ~500 KB raw, ~135 KB gzipped; loaded once in the background (`busNetwork.ts`, with a ~550 m spatial grid).
  - `tripPlanner.ts` (pure, runs in a few ms): walks of up to 500 m (800 m if needed) at each end, direct buses, and one change within 200 m (e.g. across the road) with a 5-min assumed wait. Walking = straight line ×1.3 at 80 m/min; riding = 22 km/h + 0.35 min per stop. Services between the same two stops are merged ("159 or 159A"). Live waits come from LTA BusArrival at each boarding stop (`useStopsArrivals`, every 30 s), using the first bus still catchable after walking; options with no bus due drop to the end.
  - `placeSearch.ts`: OneMap search from the browser (CORS allowed, no token), debounced 350 ms, title-cased, de-duplicated and re-ranked (exact/prefix matches first; e.g. "Jurong Point" no longer lists a clinic first), plus local bus stop search; recent places (6) in local storage. `routeShape.ts` `legPath` cuts the ridden section out of the OSM line, matching stops in order so loop services are cut correctly.
  - Shared `requestGpsLocation()` in `userLocation.ts`; `UserLocation` gains optional `kind` / `address`.
- **Limits**: buses only (no MRT), at most one change, walking distances are straight-line estimates, and OneMap search returns its first 10 results.
- **Validation**: TypeScript, production build and 22 tests (8 new: nearby services, stop search, direct/merged options, one change, walk-only, live catchable bus, OneMap parsing/ranking, recent places). Browser checks with the local LTA stub (real BusArrival via the deployed API) at desktop and 375 px: destination search → options with live times → auto-selected trip on the map; postal code 560123 as start (re-plans to "walk ~7 min"); stop-code search; recent places; no horizontal overflow or console errors.

---

### Turn 21: Search Ranking for Travel Destinations (10 October 2026)
- **User Prompt**:
  > *"Yes rank results with postal code above things like flyovers and exits as the focus is places that people take public transport to reach."*
- **Change** (`parseOneMapResults` in `src/services/placeSearch.ts`): OneMap results with a postal code (buildings, stations, malls, terminals) now come before those without (flyovers, MRT exits, pumping stations), then exact → prefix → word matches of the name, then OneMap's order. Results without a postal code are still listed, just lower. Bus stops still follow the OneMap results.
- **Result**: "Changi Airport" now lists Changi Airport MRT Station (CG2) and Terminals 1–4 first instead of "Changi Airport Aircraft Flyover". "Jurong Point" and "Bishan" lead with the mall and with Bishan 8 / Bishan Bus Interchange.
- **Validation**: new regression case in `tests/trip-planner.test.ts`; 22 tests and TypeScript pass; checked against live OneMap results.

---

### Turn 22: Nearest Bus Stops Replace Popular Services (11 October 2026)
- **User Prompt**:
  > *"Instead of showing the popular bus services, show the bus services servicing the nearest bus-stops to the location that you set."*
- **Change** (`BusSearchBox.tsx`): the "Near you" / "Popular" chip row under **Find Bus Service** is now **Nearest bus stops to <location>**, a list with one row per stop: stop name, code and distance, then a chip for every service that can be boarded there. The 3 nearest stops are shown, with "Show N more nearby stops" (up to 8). The list collapses again when the location changes. Tapping a chip tracks that bus from that stop (direction set from the stop), and a chip is only highlighted at the stop being tracked. The hard-coded Popular list is gone: while the network loads the list shows placeholders, and if it can't load a short note points to the bus number search.
- **Implementation**: `nearestStops(network, lat, lng, max = 8)` in `src/services/busNetwork.ts` replaces `servicesNear`. It searches 500 m, then 1 km, then 2 km, keeps stops in distance order, lists each service once per stop (sorted by number, with "towards" its last stop) and skips stops where buses only terminate. `App.tsx` passes the tracked stop code so the right chip is highlighted.
- **Validation**: TypeScript and 22 tests pass (the nearby test now checks stop order, per-stop services and the terminus rule). Browser checks with the local LTA stub at desktop and 375 px: NYP lists Nanyang Poly 55329 (72, 72A, 72B), Opp Nanyang Poly 55321 (72) and Nanyang Poly 54351 (45, 50, 72, 72A, 72B, 159, 159B); 72A at 54351 tracks from 54351; changing the location to stop 54259 refreshes and collapses the list; no horizontal overflow.

---

### Turn 23: Highlight the Stop to Get Off (11 October 2026)
- **User Prompt**:
  > *"When the bus service is selected for a location to travel to is indicated in "Where to?", highlight the bus stop to alight as well."*
- **Where it shows** (only while a destination is set):
  - **Arrivals card** (`ArrivalDisplay.tsx`, on all three tabs): a lemon strip under the header, e.g. "Get off for AMK Hub at **Ang Mo Kio Int** 54009 · 3 stops · ~4 min ride, then walk ~1 min (40 m) to AMK Hub". On the first bus of a trip with a change it reads "Get off to change buses at … then Bus 167 from the same stop" (or "walk ~2 min to … for Bus 167"). If the bus never gets within walking distance of the destination after this stop, an amber note says so (naming its closest stop when that is within 2 km, otherwise pointing to the trip options).
  - **Route Stops** (`RouteStopsList.tsx`): the stop to get off at has a lemon row, a flag in place of its number, a "Get off here" badge and "For AMK Hub · walk ~1 min" (or "Change to Bus 167 here"). The stops ridden in between get blue numbers. A "Get off at … (stop 29, 3 stops after boarding)" link above the list scrolls the list (not the page) to that stop.
  - **Map** (`LiveBusMap.tsx`): the route's stop markers show the stop to get off at as a lemon flag marker with a "Get off here for …" popup, plus a "Get off (code)" legend entry. Without a drawn trip, the map frames you, your nearest stop and that stop together. A selected trip still draws its own get-off markers as before.
- **How the stop is chosen** (`alightHint` in `App.tsx`):
  1. If a suggested trip uses the tracked bus from the tracked stop, its stop is used: the selected trip first, then direct trips, then trips with a change. That way the first bus of a trip with a change stops at the change stop.
  2. Otherwise `alightFor()` in `tripPlanner.ts` picks the later stop on that bus with the least riding + walking time, within the planner's walking reach (500 m, then 800 m). It returns nothing when walking from the boarding stop is as quick, and returns "not near" with the closest stop when no later stop is within 800 m.
  This covers buses chosen from the nearest stops list, a bus number search, favourites or "Live times" on a trip step.
- **Also**: the Route Stops list now keys rows by position, so loop services that pass a stop twice no longer share a React key.
- **Validation**: TypeScript, app build and 23 tests (new: `alightFor` picks the nearest stop by time, reports "not near", and returns nothing for walkable, unknown or terminating cases). Browser checks with the local LTA stub, NYP → AMK Hub:
  - The auto-selected trip on 265 highlights Ang Mo Kio Int 54009 in the strip, the stop list (stop 29) and the trip map.
  - 668 from Opp Grandeur 8, which is not a suggested trip, gets Blk 522 54401 (2 stops, 530 m walk) highlighted on the route map.
  - 72 from Nanyang Poly shows the "not near" note (closest stop 810 m away).
  - NYP → ION Orchard on 852 → 167 shows the change at Opp St. Theresa's Hme, and tracking 167 shows Orchard Stn/Tang Plaza.
  - At 375 px nothing overflows the page width and numbers stay with their units.

---

### Turn 24: Trips With a Change: the Next Bus in the Stops List and on the Map (11 October 2026)
- **User Prompt**:
  > *"For routes that requires at least 1 bus change, figure how to display the next leg displayed for the bus-stops (the highlighted stops) and how it's displayed on the map."*
- **One colour per bus** (`src/components/tripLegs.ts`): the first bus is lemon and the bus after a change is green-blue (the two Wada plate 259 colours). The same colours are used for the map lines, markers and legend, the trip steps' bus icons, the service chips and the highlighted rows in the stops list.
- **Route Stops** (`RouteStopsList.tsx`):
  - **Header**: a "Your trip: [852] 1st bus → [167] 2nd bus" switcher; tapping a bus shows its stops and live times. The jump link reads "Change buses at …" on the first bus.
  - **On the first bus**: the change stop is marked ⇄ "Change here" with "Take 167 from this stop" (or "Walk ~2 min to … for 167"). Right under it, a green block shows the next bus: towards, stops and ride time, where to board ("Board at the same stop" or the walk), the stops in between (folded, tap to show) and the final stop ("Get off for ION Orchard · walk ~2 min"), plus a "Bus 167 stops & times" button.
  - **On the second bus**: a lemon "First 852 from Opp Blk 646 · 9 stops · get off at …" block sits above the boarding stop, which is badged "Change here from 852". The list scrolls to it when you switch buses.
  - **Fading**: stops that aren't ridden on the shown bus (before boarding or after getting off) are faded.
- **Arrivals card strip**: shows "Bus 1 of 2 to ION Orchard" (or "Bus 2 of 2 · after Bus 852"), where to change, the next bus as a coloured chip with its stop count and final stop, and a button to switch to the other bus's live times. On the second bus the strip is green.
- **Map** (`LiveBusMap.tsx`): each bus is drawn in its own colour with the dark casing. The change stop gets a single "⇄ 167" pill (bordered in the second bus's colour) with a "Change buses" popup, instead of a get-off dot under a boarding pill. If the change needs a walk across the road, the dot, the dashed walk and the pill stay separate. The bus not being tracked is drawn slightly fainter, so the map shows which bus you're on. The legend lists "1st bus: 852" and "2nd bus: 167" (or "Your bus: 265"). With no trip drawn, the route-stop marker at a change stop uses ⇄ and the legend says "Change buses".
- **Showing the trip for a tracked bus** (`App.tsx`):
  - **Which trip is shown**: the chosen trip, or else a suggested trip that uses the tracked bus from the tracked stop (direct trips first). Picking 852 at Opp Blk 646 from the nearest stops list therefore shows the 852 → 167 trip in the trip list, strip, stops list and map, as if it had been chosen. A bus that isn't part of a suggested trip drops the trip, as before.
  - **Switching buses**: switching between the buses of a trip keeps that trip chosen.
  - **Data passed down**: a `TripView` (the trip's buses with their stops from `network.json`) goes to the components through `AlightHint.trip`; the old `change` field is replaced by it.
- **Validation**: TypeScript, app build and 23 tests pass. Browser checks with the local LTA stub, NYP → ION Orchard on 852 → 167 (change at Opp St. Theresa's Hme 53019, get off at Orchard Stn/Tang Plaza 09047):
  - Strip, switcher, change row and next-bus block (16 stops when expanded); the 40 stops not ridden on 852 are faded.
  - The second-bus view, with the previous-bus block and the "Change here from 852" badge.
  - The map, with the lemon and green-blue lines, "⇄ 167" pill and legend.
  - Picking 852 from the nearest stops shows the trip; picking 72 drops it.
  - At 375 px nothing overflows the page width. NYP → AMK Hub (direct 265) is unchanged apart from the legend label.

---

### Turn 25: Where To First, a Choice of Buses, and Bus Deck Types (11 October 2026)
- **User Prompt**:
  > *"1. Bring the "Where to?" field to be under the current location, and above the bus number field so it is obvious to users the destination. 2. For bus routes with more than one bus service numbers, also highight those and make it selectable in case users want to choose other bus service numbers. 3. Also if possible, figure if there is a way to identify if it is a single-deck bus or double-deck bus."*
- **1. Where to? under From** (`LocationBar.tsx`, `BusSearchBox.tsx`, `App.tsx`): the location bar is now a card with **From** (GPS / Change) and, right under it, the **Where to?** field. On the Arrival Times and Route Stops tabs the "Buses to …" trip options follow it directly; **Find Bus Service** (bus number, nearest stops, direction) comes after. On the map tab the map still comes before the trip options.
- **2. A choice of buses for each step of a trip**:
  - **Which buses count** (`tripPlanner.ts`): every service that runs between a step's boarding and alighting stops, not only ones that happened to be planned for the same stops. A service that takes much longer to get there (more than 5 min or 30% extra, e.g. round a loop) is left out. Each `TripLeg` keeps these as `alternatives` (full legs, quickest first) as well as `alsoServiceNos`. `withServices(option, serviceNos)` gives the trip with another bus chosen for any step, timed for that bus and keeping the trip's id.
  - **How it looks** (`ServiceChoice.tsx`): the bus numbers of a step sit together on a light blue tint, in number order; the chosen bus is filled in (blue in the trip list, the bus's lemon / green-blue colour elsewhere) and the others are white. Buses with no bus due at the boarding stop right now are greyed out but can still be chosen. The group wraps on narrow screens.
  - **Where you can choose**: in a selected trip's steps (with "All these buses go between these stops. Tap a number to take that bus."), in the arrivals strip (the next bus after a change, and "both/all go from this stop to …" for the bus being tracked), and in the Route Stops list (the header, and the next / previous bus blocks). Choosing the tracked bus's step tracks the chosen bus; choosing for the other step changes the plan without leaving the tracked bus. The map draws the chosen bus's route and the legend reads e.g. "2nd bus: 851 (or 851e, 852, 853, 853M)".
  - **Defaults** (`App.tsx`): a step nobody has chosen for uses its quickest bus, unless none of that is due at the boarding stop and another one is (e.g. the 851e express outside peak hours), in which case it uses the quickest bus that is. Live arrivals are now fetched for every boarding stop of every option (including where you change) to know this. The chosen buses are kept per trip while the destination stays the same, and the list keeps its order when you change a choice.
  - **Live times**: when the next buses at a stop are of different services, the trip option names the bus for each time ("Next: <bus> in <min>, <bus> in <min> …") instead of "Buses in 3, 8, 12 min".
- **3. Single deck, double deck or bendy**: LTA's BusArrival API gives the type of **each arriving bus** (`SD`, `DD` or `BD`), not of a service: many services run a mix (on 11 October at noon, 72 at Nanyang Poly had a single-deck bus followed by two double-deckers, and 912 ran bendy buses). The app already read it; it is now shown with side-view icons (`BusTypeIcon.tsx`: one row of windows, two rows, or two joined carriages):
  - **Arrival cards**: "Single deck" / "Double deck" / "Bendy bus" with the icon ("Single" / "Double" / "Bendy" on narrow cards), replacing the old "SD"/"DD" badge.
  - **All buses at this stop**: the next bus of every service shows its type.
  - **Map**: the bus markers' ETA tag has the icon and the popup names the type.
  - A bus whose type LTA leaves blank no longer shows as single deck.
- **Validation**: TypeScript, app build and 24 tests pass (new: another service between the same stops is listed and can be chosen, a much slower one isn't, and live times say which service each bus is). Browser checks with the local LTA stub and live arrivals at about noon, at desktop size and at 375 px:
  - NYP → ION Orchard: "851 → [143 | 167]"; choosing 167 changes the step ("towards Bt Merah Int") and the arrivals strip.
  - NYP → Northpoint City: "72 → [851 | 851e | 852 | 853 | 853M]", with 851e and 853 greyed out and 851 chosen by default. Choosing 852 in the stops list updates the switcher, strip and trip list while 72 stays tracked. Then "Bus 852 stops & times" tracks 852, and choosing 853M in the strip tracks 853M.
  - "[45 | 668]": choosing 668 tracks 668 at Aft Grandeur 8 (greyed out when no 668 is due).
  - Deck types show on arrival cards, in the all-buses list and in map markers and popups.
  - At 375 px nothing overflows the page width.

---

### Turn 26: Less Scrolling on Phones (11 October 2026)
- **User Prompt**:
  > *"Figure out how to improve on the UI/UX for mobile users to minimise alot of scrolling."*
- **What was measured first** (375 × 812, Arrival Times tab): the page was **3,304 px** tall with no destination and **4,884 px** with one (NYP → Northpoint City). The tracked bus's live times started about 2,350 px down. The biggest blocks were the map preview and full weather widget (≈ 1,100 px together), the selected trip's steps (≈ 600 px), Find Bus Service (530 px) and the nearest-stop banner (260 px).
- **Phones only** (narrower than 640 px, `useIsPhone.ts`; CSS `max-sm:` / `sm:` classes). Desktop and tablet layouts are unchanged: at 1280 px the local build and the live site give the same page height (2,350 px).
- **Next-bus bar** (`LiveArrivalsBar.tsx`): while the arrivals card is scrolled out of view, a bar is pinned to the bottom of the screen with the tracked bus, the stop, "Live GPS" / "Scheduled", where to get off for a destination, and the next three times (e.g. "45 · at Aft Grandeur 8 · Live GPS · off at Aft Blk 648 · 7 min, then 16, 35"). Tapping it scrolls to the arrivals card. It shows on the Arrival Times, Live Bus Map and Route Stops tabs, and steps aside when a third or more of the card is on screen.
- **Trip options** (`TripPlannerCard.tsx`): the selected trip's steps start folded behind "Show steps and where to get off". The best two trips are listed, plus the chosen one, with "Show 1 more trip" for the rest. The walk / board / live lines use the full card width instead of wrapping beside the total time. The estimates note sits behind "How times are estimated".
- **Find Bus Service** (`BusSearchBox.tsx`): once a destination is set (the trip card picks the bus), it folds to one row ("Another bus number or a nearby stop" with the tracked bus) that opens the full box. When open, the bus badge and the direction buttons share one row.
- **Nearest bus stop** (`NearestStopBanner.tsx`): the distance and walking time join the "Along …" line, and Map and "Other stops on this route" are one row of buttons (260 → 150 px).
- **Arrivals card** (`ArrivalDisplay.tsx`): the header is one row with a small refresh button showing the countdown ("⟳ 8s"). The big service badge is hidden, since the title names the bus. The live badge reads "● Live", and the capacity guide is folded behind "What do Seats, Standing and Live GPS mean?".
- **All buses at a stop** (`StopServicesBoard.tsx`): 4 services before "Show all" instead of 8.
- **Bottom of the Arrival Times tab** (`App.tsx`, `NEAWeatherWidget.tsx`): the map preview is not loaded on phones (the Map tab and the Map buttons open it), and the weather is one row (`WeatherStrip`: forecast, temperature and the top alert) that opens the Weather tab. Saved Favourites stays.
- **Result at 375 px** (same places, live arrivals in the afternoon):

  | Page | Before | After |
  |---|---|---|
  | Arrival Times, no destination | 3,304 px | 1,928 px |
  | Arrival Times, to Northpoint City | 4,884 px | 2,327 px |
  | Route Stops, to Northpoint City | 4,443 px | 3,497 px |
  | Live Bus Map, to Northpoint City | 3,702 px | 2,357 px |

  The next bus's time is on screen from the moment the page opens (in the bar), and the arrivals card starts at about 1,100 px instead of 2,350 px with a destination.
- **Validation**: TypeScript, app build and 24 tests pass. Checked in headless Chrome at 375 × 812 (because the app's preview pane was hidden): the bar appears, hides over the card, and its tap lands the card just under the header; steps open and close; the capacity guide toggles. At 1280 × 900 the layout matches the live site, and there is no bar.

---

### Turn 27: Trip Lines Cutting Across Estates (11 October 2026)
- **User Prompt**:
  > *"Some bus route dont follow the stops along the road and shows a straight line cutting across estates as per screenshot. Can you figure out what is the issue?"* (screenshot: trip to AMK Hub on Bus 269, whose yellow line ran diagonally across Ang Mo Kio from near Mayflower Stn)
- **Cause** (`routeShape.ts`, `legPath`): the road-following OpenStreetMap line for each service was fine. The bug was in how the yellow "your bus" part was cut out of it. Each stop was matched to the nearest *point* of the line, in order. OSM lines only have points where roads bend, so on a long straight road the nearest point can be hundreds of metres away. On a loop that uses the same roads out and back (269: Ang Mo Kio Int ↺ Lentor), a stop on the way out was nearer a point on the way back. For example, Blk 209 was 36 m from a return-pass point but only 12 m from the outbound road itself, which had no point nearby. From then on every later stop could only match points even further along, so the drawn line jumped:
  - **Straight cuts**: the line ran straight from the boarding stop to a far point. This is the diagonal in the screenshot.
  - **Detours**: on 268, Bef Mayflower Stn Exit 3 → Blk 700B, a 1.6 km ride was drawn as 10.4 km round an eastern loop.
- **How common**: checked against the live LTA stop lists for all 602 services. **48% of all possible rides** (285,000 of 593,000 board/alight pairs) and **93% of route directions** had at least one broken ride. It was worst on loop services and on roads drawn with few points.
- **Fix** (`matchStopsToPath`):
  - Each stop is matched to the closest point *on the line itself* (any point along a segment, not only the corners).
  - Every pass of the line within 100 m is kept as a candidate, plus the line ends if they're within 300 m, e.g. a line that stops short of the interchange.
  - One candidate per stop is then chosen so that all stops are in riding order with the smallest total distance from the line.
  - A stop that can't be placed in order, or is over 300 m from the line, is left out. That happens where the OSM line is out of date, e.g. Christ Church on 60, or part of 241's loop drawn the other way round. A ride from or to such a stop starts or ends at the next stop that is on the line.
  - The yellow line now starts and ends exactly beside the boarding and alighting stops, not at the nearest corner.
- **Result** (same check): broken rides 48% → **0.4%**; route directions with any broken ride 93% → **4.5%** (35 of 779). The rest are places where the OSM line itself disagrees with LTA's stops, e.g. 229 near Bedok South, where three stops are 200–300 m from the line. Bus 269: 228 of 231 rides broken → 0.
- **Not changed**: 12 services have no usable OSM line and still use straight stop-to-stop lines for the whole route:
  - No OSM line at all (7): 181A, 182A, 382, 451, 861M, SWA, SWB.
  - OSM line too different from LTA's stops (5): 138A, 138C, 189, 225W, 861B.
- **Validation**: TypeScript, app build and 27 tests pass. The 3 new tests in `tests/route-shape.test.ts` use a 269-like loop and check that stops are placed on the right pass, that rides follow the road they're on, and that a stop far from the line is left out. The loop test fails on the old code. In the browser (375 px, from Kebun Baru Link to AMK Hub), the 269 line now runs from Bef Mayflower Stn Exit 3 along the roads to Ang Mo Kio Int.

---

### Turn 28: Tabs at the Bottom, and One Job per Tab (11 October 2026)
- **User Prompt**:
  > *"Bring the 4 tabs "Arrival", "Map", "Stops" and "Weather" to the bottom as buttons like a mobile app for easy navigation. Check that each tab does not have duplicated information to reduce excess scrolling further on each tab. Basically improve on the user interface and user experience."*
- **Tab bar** (`AppTabs.tsx`, phones narrower than 640 px): Arrivals, Map, Stops and Weather are a bar of icon buttons pinned to the bottom of the screen. The open tab has a lemon pill behind its icon. The Weather tab gets a dot in the alert's colour when there's a weather alert worth a look (rain near you, lightning, unhealthy air, heat stress, UV 8+). The tab row under the header is gone on phones, and the header (logo and Favourites) now scrolls away instead of staying pinned, so the content gets the screen. The tab list is shared with the desktop tab row (`APP_TABS`).
- **Tab behaviour** (`App.tsx`, all screen sizes): each tab opens at the top, and tapping the open tab again scrolls back to the top. On phones, the tab bar and the next-bus bar step aside while a text field has focus (`useTextEntry.ts`), so they don't cover the "Where to?" suggestions above the keyboard. `viewport-fit=cover` with safe-area padding keeps the bar clear of the iPhone home indicator.
- **What each tab repeated, and what changed** (phones unless noted):

  | Tab | Repeated before | Now |
  |---|---|---|
  | Arrivals | The stop's name three times: the nearest-stop banner, the arrivals card, and "All buses at Opp Nanyang Poly 55321". The banner's Map and "Other stops on this route" buttons did what the tabs do. A refresh button in both the header and the card. The trip card's "From Kebun Baru Link" repeated the From field just above it. | The banner is folded into the arrivals card: "★ Nearest stop · 1.3 km, ~16 min walk" (or "Not your nearest stop · Go to nearest") with a Save button. The services board reads "All buses at this stop" (all sizes). The header refresh is gone on phones, since the card's has the countdown. The trip card shows only the distance under "Buses to …" (all sizes), and "From …" only on the Map tab. |
  | Map | The From / Where to box, the bus search, and the full arrivals card that's on the Arrivals tab. | The map first, filling the screen down to the bars, then the trip options. The next-bus bar stays on screen and opens the Arrivals tab. |
  | Stops | The From / Where to box, trip options, bus search and nearest-stop banner above the list (the list already marks the nearest stop and the trip's stops), and the arrivals card and services board below it. | Only the route's stop list, sized to the screen, with an "Other direction" button (the bus search with its direction buttons is on the Arrivals tab). Tapping a stop updates the next-bus bar. On wider screens the banner is gone from this tab too. |
  | Weather | The From / Where to box and the whole bus search above the weather (all sizes). | Only the weather (all sizes). Its alerts now come before the readings, as they say what to do and the readings back them up. |

- **Next-bus bar** (`LiveArrivalsBar.tsx`): sits on top of the tab bar. It shows on the Map and Stops tabs all the time, and on Arrivals while the card is scrolled away. Tapping it on another tab opens Arrivals at the card.
- **Find Bus Service** (`BusSearchBox.tsx`): when it is folded (phones, with a destination), picking a bus folds it again so the bus's arrivals are right below. It stays open without a destination, because its nearest-stops list is how people near a stop other than the default bus's find their bus.
- **Result at 375 × 812** (from Kebun Baru Link; page height including the footer):

  | Page | Before | After |
  |---|---|---|
  | Arrivals, no destination | 1,953 px | 1,795 px |
  | Map, no destination | 2,047 px | 986 px (the map is 524 px tall, up from 487) |
  | Stops, no destination | 2,443 px | 954 px |
  | Weather | 2,335 px | 1,598 px |
  | Map, to AMK Hub | 2,167 px | 1,423 px |
  | Stops, to AMK Hub | 2,897 px | 1,088 px |

  The header takes 57 px at the top and scrolls away, instead of a pinned 96 px with the tabs. The tab bar takes 56 px at the bottom.
- **Wider screens**: Arrival Times and Live Bus Map are unchanged; at 1280 × 900 the local build and the live site measure the same section by section. Route Stops is 211 px shorter (no banner) and NEA Weather is 626 px shorter.
- **Validation**: TypeScript, app build and 27 tests pass. Checked in headless Chrome at 375 × 812:
  - The tab bar switches tabs and opens each one at the top, and tapping the open tab goes back to the top.
  - The bars hide while typing in "Where to?" or the bus number, and come back after.
  - The next-bus bar on the Stops tab opens Arrivals with the card at the top of the screen.
  - "Other direction" flips the list, and the bar follows the new stop.
  - The stop list ends above the bars.
  - The arrivals card's refresh button no longer overlaps the stop line.

  At 1280 × 900 there is no tab bar or next-bus bar.

---

### Turn 29: Leave Now, Wait or Take an Umbrella (11 October 2026)
- **User Prompt**:
  > *"Under Arrivals, figure out how you can use the nea weather rain data to indicate whether users should leave now (before rain starts), or leave later or bring an umbrella (as raining has started)"*
- **What NEA offers**: no rain radar in its open data, but 89 rain gauges (about 3 km apart) report the rain of every 5 minutes, and the area 2-hour forecast is updated about every 30 minutes. A day query (`rainfall?date=…`) returns the newest 25 readings in one call, so `/api/weather` now gets the last hour from the same single call it already made (`parseRainfall`), with no extra rate-limit cost. The newest reading in that query is often still coming in (4 of 89 gauges in its first minutes), so it starts from the newest one most gauges have reported, as the plain latest-reading endpoint does.
- **Rain nowcast** (`rainNowcast.ts`), from the last hour of readings, for a place:
  - **Raining**: rain at the gauges within 3 km (or the closest one), with how heavy and for how long.
  - **Stopped**: rain there in the last 15 minutes, but not now.
  - **Approaching**: the nearest wet gauge within 10 km has been getting closer over the last 30 minutes (at 6 km/h or more). It gives the direction, speed and an arrival window. It is **likely** when the rain is within 5 km and covers 2 or more gauges. A lone gauge's 0.2 mm drizzle doesn't count.
  - **Nearby** (rain within 20 km, not heading here, or moving away) or **clear**.
- **Backtest** (scratchpad scripts, not in the repo): 7 rainy days (10–13 Nov 2025; 27, 28 Sep and 10 Oct 2026), about 130,000 gauge-moments. Each gauge was predicted from the *other* gauges only, then checked against what it recorded next, with NEA's 2-hour forecast for its area at that moment.
  - "Raining near you" was right (that gauge wet now or within 5 min) 74% of the time when the forecast was wet. With a dry forecast it was usually a passing drizzle (16%).
  - Chance rain started in the next 30 / 60 min, after 15 dry minutes:

    | Nowcast | Wet forecast | Dry forecast |
    |---|---|---|
    | Approaching, likely | 74% / 79% | 19% / 21% |
    | Approaching, possible | 48% / 68% | 4% / 8% |
    | Stopped | 34% / 43% | 2% / 4% |
    | Nearby | 15% / 28% | 1% / 4% |
    | Clear | 4% / 10% | 0% / 1% |

  - When approaching rain did arrive, it came within the given window (±5 min) 67% of the time.
  - How long rain lasts once it's raining near you: light rain stopped within 30 min 56% of the time. Moderate rain eased to light within 15 min half the time but stopped within 30 min only 22% of the time. Heavy rain eased within 30 min 55% of the time. Very heavy rain eased within 30 min only 16% of the time (median an hour).
  - Whether rain was "easing" or "getting heavier" over the last half hour did not predict when it stopped, so the nowcast doesn't say it. The forecast mattered more than anything else: "approaching" with a dry forecast seldom arrives, so the advice treats it as dry.
- **Advice** (`rainAdvice.ts`), shown in the arrivals card under the bus times (`RainAdviceStrip.tsx`):

  | Situation | Advice |
  |---|---|
  | Lightning within 10 km in the last 15 min | Wait under shelter |
  | Rain approaching, the walk to the stop ends before its window starts | **Leave now to beat the rain**, with the next bus you can catch |
  | Rain approaching, it arrives before you'd reach the stop | Bring an umbrella |
  | Rain approaching, but you're at the stop | The shelter has you covered; umbrella for the other end |
  | Light rain | Umbrella, or wait a little: half of light showers stop within 30 min |
  | Moderate rain | Umbrella: waiting gets a lighter walk, not a dry one |
  | Heavy rain | **Wait for a later bus** if you can; otherwise umbrella and extra time |
  | Very heavy rain | Umbrella and extra time: it usually lasts an hour, so waiting won't help much |
  | Rain just stopped, wet forecast | A good moment to go, with an umbrella |
  | Rain nearby or none, wet forecast | Umbrella (just in case) |
  | Dry forecast, no rain around | One short line: no umbrella needed |

  - With a destination at least 3 km away, the nowcast and forecast there are checked for when the bus gets there (walk to the stop, wait for the bus you can catch, the ride). A line with a flag says, for example, "Light rain at Tampines Bus Interchange now. It may have stopped by the time you get there (~74 min), but an umbrella helps for the ~1 min walk at the end." When it's dry here but wet there, the title says to take an umbrella for the destination.
  - Each advice shows the time of the gauge readings, with a link to the Weather tab.
- **No repeats**: on the Arrivals tab, the weather row (phones) and weather card (wider screens) leave out the rain, lightning and "good conditions" alerts, as the advice covers them. Alerts now carry a `kind`. The Weather tab keeps all alerts and gains "Rain heading your way", with the arrival window, when rain is approaching and the forecast is wet.
- **Validation**:
  - TypeScript, app build and 35 tests pass. The 8 new tests in `tests/rain-nowcast.test.ts` cover:
    - Synthetic showers: raining, stopped, approaching with its window, far-off rain, a lone drizzle, and rain moving away.
    - The advice choices.
    - The server skipping a half-reported newest reading.
  - In the browser, a test-only stub replayed recorded days from data.gov.sg as if live:
    - 27 Sep 2026, 6:05 pm, phone, NYP: "Leave now to beat the rain. Rain 4.3 km to the north-west… should arrive in 10–20 min". It rained there 10 minutes later.
    - The Weather tab showed "Rain heading your way".
    - 13 Nov 2025, 3:00 pm, 1280 px, to Tampines: "Heavy rain: wait for a later bus if you can", with the Tampines line, and the weather card without the rain alert.
    - Today's live data: "No rain around: no umbrella needed" on one line.

---

### Turn 30: Rain Advice Under "Where to?" (11 October 2026)
- **User Prompt**:
  > *"On the arrival tab, bring the weather message under "Where to?" and update it based on the gps location or selected location in the first row."*
- **Where it is now**: the rain advice from turn 29 (leave now, wait or take an umbrella) moved out of the arrivals card and into the "Your trip" box, right under "Where to?" (`LocationBar` takes it as children). It is on the Arrivals tab only, at all screen sizes. On wider screens it no longer shows on the Live Bus Map and Route Stops tabs, where it used to come with the arrivals card.
- **Follows the From row**: the advice is for the place in the first row, whether a GPS fix or a chosen place, and it changes as soon as that place changes. Its source line names the place, e.g. "For Orchard Rd · NEA rain gauges 6:55 pm & 2-hr forecast".
  - Now that it sits outside the bus card, it names the stop and the bus: "Nanyang Poly is a ~3 min walk, so you'd reach it first; the next Bus 72 you can catch comes in 13 min."
  - If the tracked bus's stop is more than 1.5 km from the From place (a bus tracked somewhere else), it uses the walk to the nearest stop to the From place instead, without bus times.
  - "You're at the stop" is now said only within 50 m; further than that it's at least a minute's walk. Before, anything under 120 m counted, so 110 m from Bef Cairnhill Rd read "You're at the stop".
- **Validation**: TypeScript, app build and 35 tests pass, including a new case for being at the stop. Replayed rainy moments in the browser:
  - 13 Nov 2025, 3:00 pm, 375 px: from NYP, "Heavy rain: wait for a later bus if you can". Changing From to Orchard Rd switched it to "Leave now to beat the rain… Bef Cairnhill Rd is a ~1 min walk". Changing back restored the heavy-rain advice.
  - 27 Sep 2026, 6:05 pm, from NYP: the "leave now" advice named Nanyang Poly and the next Bus 72.
  - 1280 px: shown under "Where to?" on Arrival Times only, not on Live Bus Map or Route Stops.
  - The arrivals card no longer contains it.

---

### Turn 31: Citymapper's Layout in Our Colours (16 October 2026)
- **User Prompt**:
  > *"Using "Citymapper: All Live Transit" iphone app as a reference, figure out how we can use the UI and design with our colour scheme."*
- **Reference**: Citymapper's six App Store screenshots: home, trip results, trip steps, the ride view, "Get off now", and nearby vehicles. Its patterns map onto the Wada 259 palette as follows. Citymapper's green becomes green-blue for live and "go" signals, its yellow live sign becomes lemon on dark surfaces, and its dark blue cards become Helvetia Blue 950.

  | Citymapper | BusTrackerSG now |
  |---|---|
  | Yellow arcs beside live times | `LiveSignal` (`ArrivalBits.tsx`): a dot sending out arcs that pulse (still when reduced motion is on). Green-blue on white, lemon on the dark next-bus bar. It marks every GPS-tracked time; timetable estimates get a small clock instead. The "Live GPS / Scheduled" text line under each time is gone, which shortens the arrival boxes. |
  | Big number with a small "min" | `Minutes` (`ArrivalBits.tsx`), used in the arrivals card, the departure rows, the next-bus bar and trip totals |
  | "Leave within 2 min" | New `leaveWithin` (`src/services/leaveWithin.ts`). It compares the walk from the From place to the tracked stop (80 m a minute; within 50 m counts as being at the stop) with the stop's next three buses. Like the trip planner, it allows a minute's slack. It appears in three places. In the arrivals card it is a band: "Leave within 6 min · By 9:22 am · ~3 min walk for the bus due in 9 min", which turns lemon and says "Leave now" with a minute or less to spare. On phones it is the next-bus bar's second line. Each trip option also shows it. |
  | Dark blue Start / End card with a swap button | The From / Where to? box is now a dark Helvetia card. A green-blue dot marks the start and a lemon flag the destination, joined by a dotted line. With a destination set, a swap button (↕) plans the trip back: the destination becomes From and the old From becomes the destination. |
  | "Get me home" / "Work" shortcuts | Up to 4 recent places as one-tap chips under "Where to?" while no destination is set |
  | Departure rows | "All buses at this stop" is a list of rows. Each row shows the bus number, "To Tampines Int", seats and deck, and the next time big on the right with the later times under it. The tracked bus is shaded and labelled "Tracking". |
  | Suggested routes: walk › line › walk, total on the right, "Leave within" and "Arrive" | Each trip option is a route strip (🚶3 › [72] › 🚶1, with any change walk) and the total minutes. Below that: "Leave within 3 min" and "Bus in 1, 6, 14 min" on the left, "Arrive 10:34 am" on the right, and "Board at Nanyang Poly · 43 stops · direct" |
  | Ride view: the line with its stops on it | Route Stops: a continuous Helvetia line runs through the numbered stop circles, darker over the stops you ride on a trip |
  | "in 6, 12, 15 min" bubble on the map | A white bubble over the tracked stop: "72 in 1, 7, 15 min", with the live sign for a GPS-tracked bus. On a trip it sits over the boarding pill instead (the route's own stops are hidden then). |

- **Not taken**:
  - Citymapper's own green brand colour and mascot.
  - Other transport modes (this app is buses only).
  - The "Get off now" alarm, which would need location tracking in the background.
- **Validation**:
  - TypeScript, the app build and 37 tests pass. The 2 new tests in `tests/leave-within.test.ts` cover the bus you can reach, the minute's slack, being at the stop, every bus leaving too soon, and having no buses.
  - In the browser at 390 px and 1280 px, using the test-only LTA stub with real arrival times:
    - Arrivals: "Leave now" and "Leave within 5 min" in both the card and the next-bus bar.
    - The recent-place chip set Tampines Bus Interchange as the destination, and the trip row showed the strip, "Leave within 3 min" and "Arrive".
    - Swap planned Tampines Bus Interchange → Nanyang Polytechnic, and swapping again restored the original trip.
    - The Map bubble read "72 in 1, 7, 15 min", and the Stops tab showed the route line.
    - No console errors.

---

### Turn 32: One Leave Time for the Trip and the Arrivals Card (16 October 2026)
- **User Prompt**:
  > *"Make the trip planner and arrivals card leave times match"*
- **Why they differed**:
  1. **Walking model**: the arrivals card used the straight line at 80 m a minute, while the trip planner added 30% for the real route. At 220 m that's ~3 min against ~4 min.
  2. **Rules**: each rounded differently and had its own "can I still catch it" check. The trip planner also had no "you're at the stop". From a place 40 m from Tampines Int, the trip said "Leave within 12 min" while the next-bus bar said nothing. The rain advice had a third rule, with no minute's slack.
  3. **Data**: the card's arrivals refresh every 15 s, while the trip list fetched its own copy every 30 s. The two could be up to a refresh apart.
  4. **Distance**: the trip planner's stop positions are rounded to about a metre, so its walk could differ slightly from the card's.
- **Now**: `src/services/leaveWithin.ts` holds the one walking model and the one rule.
  - The walking model is the straight line +30% at 80 m a minute (`walkMinutesFor`, `walkMinutes`). Within 50 m counts as being at the stop.
  - The catch rule (`firstCatchable`) takes the first bus due no earlier than the walk minus a minute.
  - `leaveWithin` gives the time to spare, and `leaveLabel` gives the words: "Leave now" with a minute or less, otherwise "Leave within N min".
  - Everything that shows a walk or a leave time uses these. That covers the trip planner (`liveDeparture` now carries `leave`), the arrivals card, the next-bus bar, the rain advice's "the next Bus 72 you can catch", and the "~N min walk" in the arrivals card and the nearest-stop banner.
  - A trip from the tracked stop uses the arrivals card's own times. The card uses the trip's walk when the trip boards at the tracked stop.
- **Still different on purpose**: a trip can be caught by any of the buses that run between the same stops (e.g. 159 or 159A), but the arrivals card is for the tracked bus only. When the first bus you can catch is a different one, the trip row names it: "Leave within 2 min for the 159A".
- **Validation**:
  - TypeScript, the app build and 39 tests pass.
  - A new test plans trips from 0 to ~850 m away against five sets of bus times. In every case the trip's walk and leave time equal the arrivals card's.
  - In the browser, on a phone, NYP to Tampines Bus Interchange: the trip row, the arrivals card and the next-bus bar showed "Leave now" and then "Leave within 6 min" together across several refreshes. After a swap to start at Tampines Bus Interchange (at the stop), none of the three showed a leave time.

---

### Turn 33: "Get Off Now" Alarm, and No Default Bus 72 (16 October 2026)
- **User Prompt**:
  > *"Add the "Get off now" alarm like Citymapper as an option and also under the "find a bus service" don't automatically put "72" as the default bus number, and maybe let it be the last bus number search instead."*
- **Get-off alarm** (opt in, Citymapper style):
  - A **Get-off alarm** switch sits in the "Get off at…" box of the arrivals card. That box shows whenever a destination is set in "Where to?".
  - While the alarm is on, it follows the phone's GPS along the ride, from the boarding stop to the stop to get off at:
    - Its status reads "finding you", then "starts once you're on Bus 72", then "N stops to go".
    - On phones, the next-bus bar shows the same progress, e.g. "Opp Hougang Ctrl Int is next: ring the bell".
  - **Two alerts**, each with a vibration and rising beeps:
    - **"Your stop is next"** (a Helvetia blue bubble) comes as the bus reaches or leaves the stop before yours. Buses here only stop if someone rings the bell, so this is the moment to ring it.
    - **"Get off now"** (a lemon bubble) comes within 250 m of your stop. Both bubbles have a shaking alarm clock and say what comes next ("then ~2 min walk to…" or "then Bus 190 from…").
  - "Get off now" only comes once the bus has left the stop before yours. Where two stops are close together, nobody is told to get off a stop early.
  - The alarm turns itself off once it has gone off, or when you track a different bus or ride.
  - It keeps the screen on (Wake Lock) while set. A web page can't run in the background, so the page has to stay open; the switch says so.
  - If location is blocked, the switch explains how to allow it.
  - GPS fixes coarser than 150 m are ignored. On a route that loops back past where you got on, the alarm never jumps ahead to the end of the loop.
  - New files:
    - `src/services/getOffAlarm.ts`: `rideProgress`, which places a GPS fix along the ride's stops (pure, tested).
    - `src/services/useGetOffAlarm.ts`: the GPS watch, the alerts and the wake lock.
    - `src/components/GetOffAlarm.tsx`: the switch, the status wording and the alert bubble.
- **No default Bus 72**:
  - The "Find Bus Service" box no longer starts with 72. Its field shows the bus number you last searched for, remembered in this browser (`src/services/lastBusSearch.ts`). The app opens on that bus.
  - Picking a bus another way (a nearby stop's button, a favourite, a trip) doesn't replace the remembered search.
  - On a first visit the field is empty ("Type a bus number"). The app opens on the first bus at the stop nearest you, e.g. Bus 3 at Opp Century Sq from Tampines Mall. At NYP that is still Bus 72, because 72 is the first bus at Nanyang Poly (55329). Bus 72 is only the fallback when the bus network can't load.
  - The seeded favourite (Bus 72 at Nanyang Poly) is unchanged.
- **Validation**:
  - TypeScript, the app build and 43 tests pass. There are 4 new tests: the alarm's stages, close stops, a looping route, and remembering the last search.
  - In the browser with the local LTA stub, first visit at NYP: the field was empty and the bus was 72 from the nearest stop. From Tampines Mall it was Bus 3 from Opp Century Sq.
  - Searching 190 remembered it. Tapping a nearby stop's 15 did not replace it. After a reload, the app opened on Bus 190 with "190" in the field.
  - With simulated GPS along Bus 72's real stops, NYP to Hougang Ctrl Int, the status went "starts once you're on Bus 72" → "18 stops to go" → "12 stops to go" → "2 stops to go". A 400 m-accuracy fix was ignored.
  - "Your stop is next" (short buzz) came at Blk 830A, and "Get off now" (long buzz) came 45 m before Opp Hougang Ctrl Int. The GPS watch then stopped.
  - Location blocked showed the explanation. Switching to the 72A turned the alarm off.
  - Checked on a phone (375 px) and on desktop (bubble top right). There were no new console errors.

---

### Turn 34: The Best of Citymapper's Rivals (16 October 2026)
- **User Prompt**:
  > *"also take reference from the strong competitors of citymapper and take the best design UI elements to make it more visually appealing."*
- **References**: the App Store screenshots of Transit, Google Maps and Moovit, the Singapore bus app SG BusLeh, and write-ups of Transit's redesign and Google Maps' crowding levels. Each idea was redrawn in the Wada 259 colours:

  | App | Idea | BusTrackerSG now |
  |---|---|---|
  | Transit | Every trip drawn to scale on one clock axis, so faster or later trips stand out at a glance | `TripBar` and `TimeAxis` (`TripPlannerCard.tsx`) replace the walk › bus › walk strip. Each trip option is a bar of walk (🚶 and a dotted line), wait (a thin line) and bus (a pill in the leg's colour: lemon, then green-blue after a change). All options share one axis that starts at "Now" with clock ticks every 5–30 min (Singapore time). A trip you have to leave for later starts further right. The new `tripTimeline` (`tripPlanner.ts`) works out the segments from the same leave and arrive times as the rest of the row. |
  | Transit | Big, bold route numbers in the departure list | "All buses at this stop" rows now lead with the bus number in large black type, a small tag (Tracking, Double, Single or the operator) and "→ destination". The tracked bus is a dark Helvetia row with lemon numbers. On desktop the rows sit in two columns. |
  | SG BusLeh, Google Maps | How full the bus is, under each time | `LoadMeter` (`ArrivalBits.tsx`): three short bars, one filled for seats, two (amber) for standing, three (rose) for limited standing. It sits under every time in the departure rows and in the arrivals card, and the capacity guide uses it too. The old coloured load chips are gone. |
  | Google Maps, Apple Maps | The clock time at each step of a trip, and beside each "in N min" | The trip steps now start each line with its time: 10:32 walk to Blk 502, 10:39 Bus 50, 10:55 get off, 10:55 Bishan Int ("~" when the bus times are estimates). Each arrivals card box shows the clock time under the minutes ("8 min / 10:39 am"). |
  | Transit | "Get off in 5 stops" with a progress bar during the ride | With the get-off alarm on, a progress bar under the switch fills as the bus passes stops, with a bus marker at your position and a flag at your stop. |
  | Moovit | "Your line arrives in 1, 6, 7 min" | Already in place (the trip row's "Bus in 1, 6, 14 min" and the map bubble), so it was kept as is. |

- **Also fixed**: with the destination at the stop you get off at, the steps, the "Get off at" box and the alert bubble said "~1 min walk (0 m)". They now say you're there, and the steps skip the walk. When the From place is at the boarding stop, the first step reads "You're at" that stop instead of a walk.
- **Not taken**:
  - Transit's and Moovit's per-line brand colours: here a leg's colour says which leg it is, matching the map.
  - Moovit's ads and dense chips, and Google Maps' driving and other transport modes (this app is buses only).
  - Transit's live bus positions along the trip bar, which LTA's data doesn't give per trip.
- **Validation**:
  - TypeScript, the app build and 44 tests pass. A new test checks that a trip's timeline runs without gaps from setting off to arriving and agrees with its leave and arrive times, for live and estimated times and for a trip with a change.
  - In the browser with the local LTA stub, NYP to Bishan Int, at 390 px and 1280 px:
    - Two trips (Bus 50 direct, Bus 13) were drawn on one axis ("Now", 10:40, 10:50) with the lemon bus pills, "Leave within 2 min" and "Arrive 10:58 am".
    - The steps read 10:32 walk, 10:39 Bus 50, 10:55 get off, 10:55 Bishan Int, with no "0 m" walk.
    - The arrivals card boxes showed "8 min / 10:39 am / seats meter / Double deck".
    - The departure rows showed the big numbers and load meters, with Bus 50 dark as the tracked row, in two columns on desktop.
    - With simulated GPS, the alarm's progress bar showed 4 of 10 stops passed.
    - No new console errors.

---

### Turn 35: An App a New User Doesn't Have to Learn (16 October 2026)
- **User Prompt**:
  > *"figure how to further the design UI so that it is very human intuitive, so that a new user does not need to learn how to use the app, it should be very natural to new users."*
- **How**: I went through the app as a first-time user on a phone (saved state cleared), tab by tab, and noted every point where you would have to guess or already know something. The fixes follow standard usability guidance:
  - **No tutorial.** Nielsen Norman Group's tests found tutorials don't make apps easier. Each screen says what it needs, where it's needed.
  - **Words beside icons**, because phones have no hover to explain an icon.
  - **Everyday words**, not system terms.
  - **Show, don't make people remember.**
- **What was hard, and what it is now**:

  | A new user had to… | Now |
  |---|---|
  | Guess what the heart with a "1" in the header is | It reads **♥ Saved 1**. "Favourites", "Add to Favs" and "My Favourites" all become **Save / Saved / Saved buses**, one set of words for one thing. |
  | Notice the From place was NYP, not where they are | On a first visit the From card says **"Not at Nanyang Polytechnic? Use my location"** until GPS answers or a place is chosen. A GPS position is called **"Your location"** (not "My Device GPS Location"), and sentences read "Nearest bus stops to you". Old saved GPS places are renamed when loaded. |
  | Know that tapping a bus number does something, then scroll to find it | **"Tap a bus number to see when it comes."** sits under the nearest stops. Picking a bus from a nearby stop, a search, "All buses at this stop" or the saved buses **scrolls its times into view** (smoothly, or straight there if reduced motion is on, or if a smooth scroll didn't run and you haven't scrolled yourself). A number that isn't a bus stays put, so its message is seen: "There's no Bus 999 running in Singapore". |
  | Decode "GAS", "WAB", "Sched.", "services", "Find Bus Service" | Bus companies by the names on their buses: **Go-Ahead**, SBS Transit, Tower Transit, SMRT ("Run by Go-Ahead"). The wheelchair sign alone. **Timetable** for a time with no GPS. "4 buses", "Show all 15 buses", "Find a bus". |
  | Learn what the arcs and the little clock beside a time mean | A key under the times shows the signs in use: **"Live GPS" · "Timetable"**. The guide that was behind "What do Seats, Standing and Live GPS mean?" is now "What do the bars mean?", about how full the bus is only. The "LTA DataMall v3 Live" badge is gone. A badge shows only when something is off ("Loading live times…", "Sample times: the live feed is down"). |
  | Work out "⟳ 15s" | The button says **Refresh**. Under the times it says how fresh they are, as a person would: **"Updated 12 s ago · updates every 15 s"**, not "Updated 11:34:08 SGT". |
  | Know the other trip options can be picked | Each option ends with **"Choose ›"**, and the one the app is following shows **"✓ Selected"**. |
  | Guess the map's ⇱ ◎ ⤢ buttons, some scrolled off the edge | **Nearest stop, Me, Trip, Whole route**, in words on phones too. They wrap instead of scrolling sideways, so none is hidden. The Buses and Stops layers show a ✓ while they're on the map. "No live GPS" became "No bus on GPS yet". |
  | Know what tapping a stop in Route Stops does | **"Tap a stop to see when Bus 72 gets there."** The ✓ on the chosen stop has a spoken label. |

- **Not done**:
  - A first-run tour or coach marks. The research above says they don't help, and every hint here sits next to the thing it explains.
  - "Arr": it's what Singapore's bus stop displays and LTA use.
  - Stop codes: riders use them to look stops up.
- **Validation**:
  - TypeScript, the app build and 45 tests pass. The new test covers a GPS place saved under the old name being shown as "Your location", and a chosen place keeping its name.
  - In the browser with the local LTA stub, first visit on a phone (390 px), saved state cleared:
    - "Saved 1", "Not at Nanyang Polytechnic? Use my location", "Find a bus" and the tap hint were all shown.
    - Tapping 45 at Nanyang Poly scrolled to "Bus 45 Arrivals · Go-Ahead · Refresh", with "Updated just now · updates every 15 s" and "Timetable" under the times. Tapping 50 in "All buses at this stop" scrolled back up to Bus 50.
    - Searching 999 stayed put with its message, and searching 190 scrolled to Bus 190.
    - NYP to Bishan Bus Interchange showed "✓ Selected" and "Choose ›".
    - The Map tab showed the labelled controls on two rows, and the Stops tab showed its hint.
    - A simulated GPS fix through "Use my location" replaced the prompt with "Your location".
    - The Saved buses list read "Your usual buses, one tap away".
  - The same was checked at 1280 px. There were no console errors.
  - **On the live site**: in my test browser, which draws no frames while its panel is hidden, the first tap's smooth scroll never ran. A real phone draws frames, but the reveal now checks itself: if the page hasn't moved 0.6 s later, it goes straight to the times. If you've scrolled yourself in that time, it leaves you where you are. Both cases were tested.
- **Also fixed: a deploy without bus routes**:
  - **What happened**: the deploy of the scroll fix came up with "Nearby bus stops can't be loaded right now", and trip planning was off. Its Vercel build log showed why: LTA DataMall answered one page of bus stops with a server error (`BusStops skip=5500 failed (500)`), so the build skipped every route file, `network.json` included. That page comes after the end of the stops anyway.
  - **Now**: `api/bus-route.ts` asks for a page again after a server error, "too many requests" or no answer (3 tries, 0.5 s then 1.5 s apart). A refused key isn't retried. A failed page after the end of the data no longer matters. This helps the build and the live `/api/bus-route` alike.
  - **Tests**: 3 new tests in `tests/lta-pages.test.ts` (48 tests in all): a page that fails twice and then answers, a failing page after the end, and a page of data that keeps failing or a refused key, which still fail.

---

### Turn 36: A Clean Build Log for the API Functions (16 October 2026)
- **User Prompt**:
  > *"every Vercel build log shows, once per serverless function in api/: `error TS2688: Cannot find type definition file for 'vite/client'.` The deployment still succeeds, but this noise hides real errors. Fix it so the api functions compile cleanly without losing Vite's types for src/."*
- **Why it happened**: `tsconfig.json` listed `"vite/client"` in `compilerOptions.types`. Those are browser-only types for the Vite app (`import.meta.env`, `import './index.css'`). Vercel compiles each `api/*.ts` function with the same root config, so all five functions asked for them and got TS2688.
- **Now**:
  - `src/vite-env.d.ts` holds `/// <reference types="vite/client" />`, so only the app's own files bring in Vite's types.
  - The root `tsconfig.json` has `"types": []`. No type library is forced on every file. The functions get Node's types through `express`, as before.
- **Validation**:
  - `npx tsc --noEmit -p .` passes. Without the new file, `src/main.tsx` fails on `import './index.css'` (TS2882), which shows `src/` still gets Vite's types from it.
  - The five `api/*.ts` files type-check on their own (with only `src/types/weather.ts` pulled in), the way Vercel builds them.
  - `npm test`: 48 tests pass. `npx vite build` works.

---

### Turn 37: One Locked Set of Packages, Everywhere (19 October 2026)
- **User Prompt**:
  > *"check my dependency setup: am i locking exact versions, and are any of my packages unmaintained or risky?"*, then *"go ahead"*
- **What was wrong**:
  - `package.json` uses `^` ranges, as is usual. The exact versions lived in `bun.lock`, but only Vercel and the monthly workflow used it. On this Mac packages were installed with npm, which ignores `bun.lock`, and there was no `package-lock.json`, so a fresh `npm install` could pick versions the live site doesn't run.
  - Vercel ran a plain `bun install`, which quietly picks new versions when `package.json` and the lockfile disagree, instead of failing.
  - `motion` was installed but imported nowhere.
  - `@types/node` described Node 22, while Vercel and this Mac run Node 24.
- **Now**:
  - npm everywhere. `package-lock.json` replaces `bun.lock`, with the same versions as before (compared package by package) and a sha512 checksum for every package, each matching both the npm registry and the old `bun.lock`.
  - `vercel.json` installs with `npm ci`, which installs exactly what the lockfile says and fails the deploy if it and `package.json` disagree.
  - The monthly "Refresh route data" workflow installs with `npm ci` on Node 24, instead of Bun on Node 22.
  - `motion` is removed, and with it `framer-motion`, `motion-dom` and `motion-utils`. `@types/node` is `^24.19.2`.
- **Checked and left alone**: no locked package is deprecated, and npm's audit finds no known vulnerabilities. Three are older but not risky: Leaflet 1.9.4 (last release May 2023, 2.0 still in alpha), Express 4 (officially still supported, and only the local dev server runs it) and lucide-react 0.546 (held to 0.546.x by its `^0.` range).
- **Validation**:
  - A clean `npm ci` installs from the lockfile, and tsx (esbuild) runs without its setup script.
  - `npm ls --all` finds no missing or mismatched packages, and npm leaves the lockfile unchanged when it re-reads it.
  - `npx tsc --noEmit -p .` passes with Node 24's types, 48 tests pass, `npx vite build` works and `npm audit` finds 0 vulnerabilities.

---

### Turn 38: esbuild's Install Script Approved (19 October 2026)
- **User Prompt**:
  > *"approve the esbuild install script"*
- **Why**: npm now runs a package's install script only once the project approves it, so every install warned that `esbuild@0.28.2` (`postinstall: node install.js`) was waiting. The script checks that esbuild's binary for the machine is there and works, and swaps in a faster launcher for it. If the binary package is missing, it downloads it from npm and checks it against its checksum.
- **Now**: `package.json` has `"allowScripts": { "esbuild@0.28.2": true }`, written by `npm approve-scripts esbuild`. The approval is for that exact version, so when esbuild is updated, npm asks again before running the new version's script.
- **Validation**: `npm approve-scripts --allow-scripts-pending` lists nothing waiting, and npm leaves `package-lock.json` unchanged, so `npm ci` still accepts it.

---

### Turn 39: No More `__dirname` Warning from Vite (19 October 2026)
- **User Prompt**:
  > *"fix the vite __dirname warning in vite.config.ts"*
- **Why it happened**: `vite.config.ts` is an ES module, and its `@` alias used CommonJS's `__dirname`. Vite warned in every build that its coming native config loader (`configLoader: 'native'`) won't support that.
- **Now**: the alias uses `import.meta.dirname`, the ES-module equivalent, which Node 24 (here and on Vercel) has built in.
- **Validation**:
  - `npx vite build` no longer prints the warning, and Vite's own config loader resolves `@` to the project folder as before.
  - The local dev server (`server.ts`, which loads this config) starts and the app shows "Find a bus".
  - `npx tsc --noEmit -p .` passes, and 48 tests pass.

---

### Turn 40: The Map Loads on Its Own (19 October 2026)
- **User Prompt**:
  > *"fix the large chunk warning with code splitting"*
- **Why it happened**: the whole app was one 605 kB JavaScript file, over Vite's 500 kB warning size. The live map and Leaflet were a quarter of it, though phones only need them on the Map tab.
- **Now**:
  - `LiveBusMap` (and Leaflet with it) is loaded with `React.lazy`, so it is its own 169 kB file (49 kB gzipped). The main file is 439 kB (130 kB gzipped, was 178 kB).
  - While it loads, a "Loading map…" box of the map's exact size holds its place, so nothing below it jumps.
  - Once the first screen is drawn, the map's code is fetched while the page is idle, so on a phone it's ready before the Map tab is opened.
- **Validation**:
  - `npx vite build` no longer warns, and shows the two files above.
  - Desktop (1280 px): the map shows in the arrivals view with its tiles, from its own file.
  - Phone (375 px): the map's code was fetched while the arrivals showed, after the route data. Opening the Map tab showed the placeholder for a moment, then the map with its tiles, 48 markers and the trip line.
  - `npx tsc --noEmit -p .` passes, and 48 tests pass.

---

### Turn 41: React in Its Own File (19 October 2026)
- **User Prompt**:
  > *"split React into its own vendor chunk too"*
- **Why**: React changes far less often than the app. In its own file, with its own content-hashed name, a returning visitor's browser keeps it across deploys and only fetches the app's code again.
- **Now**: `vite.config.ts` has a Rolldown code-splitting group (`build.rolldownOptions.output.codeSplitting.groups`) for `react`, `react-dom` and `scheduler`. The build is:

  | File | Size | Gzipped |
  |---|---|---|
  | `react-*.js` | 219 kB | 68 kB |
  | `index-*.js` (the app) | 219 kB | 61 kB |
  | `LiveBusMap-*.js` (map and Leaflet, loaded later) | 169 kB | 49 kB |
  | `rolldown-runtime-*.js` (shared loader) | 0.6 kB | 0.4 kB |

  `index.html` preloads the React and runtime files alongside the app's, so they download in parallel. The map file uses the shared React file instead of a copy.
- **Validation**:
  - The production build, served by `server.ts` with `NODE_ENV=production` (new `prod-lta-stub` preview), on a phone (375 px): the four files loaded, the arrivals showed, and the Map tab showed the map with its tiles and 47 markers. No request to the app failed.
  - `npx tsc --noEmit -p .` passes, and 48 tests pass.

---

### Turn 42: Built Files Cached for a Year (19 October 2026)
- **User Prompt**:
  > *"yes, add the cache headers"*
- **Why**: Vercel sent every file with `Cache-Control: public, max-age=0, must-revalidate`, so on every visit browsers asked again for the React, app and map files, even when nothing had changed. The files in `/assets/` are named after a hash of their contents, so a file with a given name never changes and can be kept for good.
- **Now** (`vercel.json`):
  - `/assets/*` is sent with `Cache-Control: public, max-age=31536000, immutable`: a year, with no checking back. A deploy that changes a file gives it a new name, which the new `index.html` points to.
  - The catch-all rewrite to `index.html` no longer covers `/assets/`. Before, a missing asset (such as an old map file asked for by a tab left open across a deploy) came back as the HTML page with status 200, and with the new header that page would have been kept for a year under a JavaScript file's name. A missing asset is now a plain 404.
  - `index.html`, `/bus-routes/*`, `/route-shapes/*` and the API keep Vercel's default, so new deploys and refreshed route data still show at once.
- **Validation**: on the live site after the deploy (below the table in the reply), compared with before.

---

### Turn 43: The Change Notes No Longer Change the CSS (19 October 2026)
- **User Prompt**:
  > *"add it"*
- **Why**: Tailwind looks for class names in every file of the project, COMMENTS.md included. Words in these notes that look like class names (`sticky`, `container`, `table`) added CSS rules, so each new entry changed the CSS, renamed it and the app file, and made returning browsers download about 70 kB (gzipped) again, despite the year-long caching from Turn 42.
- **Now**: `src/index.css` has `@source not "../COMMENTS.md";`, so Tailwind no longer reads the notes.
- **Validation**:
  - The CSS file is now the same (`index-bjwK25IH.css`) whether built with these notes, the notes from two turns ago, or the notes plus made-up class names.
  - It lost exactly three rules, `.sticky`, `.container` and `.table`, which only the notes used. The app's `sm:sticky` and `@container` are still there, and in the production build the header still stays at the top after scrolling.
  - `npx tsc --noEmit -p .` passes, and 48 tests pass.

---

### Turn 44: The Caching Tip in a README (19 October 2026)
- **User Prompt**:
  > *"put React's caching tip in the README"*
- **Now**:
  - The project has a `README.md` (there wasn't one), with a section on caching: which file holds what, why `react-*.js` stays in returning visitors' caches across deploys, and four rules that keep it so (the React group in `vite.config.ts`, only content-hashed files in `/assets/`, no `index.html` fallback for `/assets/`, notes kept out of Tailwind's scan).
  - Writing it showed the problem from Turn 43 again: Tailwind read README.md and its words renamed the CSS. `src/index.css` now has `@source not "../*.md";`, which covers every Markdown file at the top of the project instead of only COMMENTS.md.
- **Validation**: the CSS builds to the same file as the live site (`index-bjwK25IH.css`) with the README, with made-up class names added to it, and with them added to COMMENTS.md.

---

### Turn 45: Setup and Run Instructions in the README (19 October 2026)
- **User Prompt**:
  > *"add setup and run instructions to the README"*
- **Now**: `README.md` has, above the caching section:
  - **Setup**: Node.js 24, an LTA DataMall key, `npm ci` (not `npm install`, to get the live site's versions) and a `.env` copied from `.env.example`, with the two optional settings.
  - **Run it**: `npm run dev` on port 3000, how to check the key at `/api/health`, a table of the other commands, why `npm run build` without a key leaves no route files (and `npx vite build` for building the site alone), and `NODE_ENV=production npm start` for the production build.
  - **Deploying**: what Vercel runs, the environment variables it needs, and the monthly "Refresh route data" workflow with its `VERCEL_DEPLOY_HOOK_URL` secret (named only).
- **Validation**:
  - `NODE_ENV=production npm start` (with a test key, on another port) served the built page, and `/api/health` reported `ltaAccountKeyConfigured: true`, with `status: "degraded"` because the test key isn't a real one, as the README says.
  - Each command in the table matches `package.json`.
  - The CSS still builds to the live file (`index-bjwK25IH.css`), so the README doesn't change what visitors download.

---

### Turn 46: Icons on lucide-react 1.x (19 October 2026)
- **User Prompt**:
  > *"upgrade lucide-react to 1.x"*
- **Why**: `^0.546.0` only allows 0.546.x (a `^` range on a 0.x version stops at the next minor), so the icons had been stuck on a release from October 2025, 92 releases behind.
- **Before upgrading**, against 1.59.0's published type definitions:
  - All 60 names the app imports still exist. Five survive only as aliases of renamed icons: `AlertCircle` (now `CircleAlert`), `Building2` (`BuildingComplex`), `Home` (`House`), `Loader2` (`LoaderCircle`) and `Trash2` (`Trash`).
  - 1.0's one change that matters here, `aria-hidden` on icons by default, is only applied to icons with no `aria-*`, `role` or `title` attribute (from 1.59.0's `Icon.mjs` and `hasA11yProp.mjs`), so the icons that carry their own label keep it.
- **Now**: `lucide-react` is `^1.59.0`, and the five aliased icons use their 1.x names in `App.tsx`, `FavoritesModal`, `LocationBar`, `LocationPickerModal`, `PlaceSearch` and `TripPlannerCard`, so a later release that drops the aliases won't break them. npm also sorted `devDependencies` alphabetically.
- **Validation**:
  - On a phone (375 px) in the browser: all 39 icons on the first screen draw, the 37 decorative ones are now hidden from screen readers, and both "Timetable time" clocks keep their label. The Saved list shows the bin (`lucide-trash`, with its two lines, as `Trash2` had). Searching "ang mo kio" shows the spinner (`lucide-loader-circle`) while it loads, then the building icon (`lucide-building-complex`) on the places. No console errors.
  - The app file is 4.3 kB larger (1.5 kB gzipped), from 1.x's icon component. The React file keeps its name.
  - `npx tsc --noEmit -p .` passes, 48 tests pass and `npm audit` finds 0 vulnerabilities.

---

### Turn 47: Escape Closes the Saved Buses List (19 October 2026)
- **User Prompt**:
  > *"make Escape close the saved buses list"*
- **Why**: the Saved buses list could only be closed with its ✕ or Close button, though the location picker already closes on Escape, as people expect a pop-up to.
- **Now**: `FavoritesModal` listens for Escape while it's open, the same way `LocationPickerModal` does, and stops listening when it closes.
- **Validation**:
  - In the browser: the list opened, Escape closed it, it opened again, and its Close button still closed it. No console errors.
  - `npx tsc --noEmit -p .` passes, and 48 tests pass.

---

### Turn 48: Tapping Outside Closes the Saved Buses List (19 October 2026)
- **User Prompt**:
  > *"make the saved list close when tapping outside it"*
- **Now**: tapping the dimmed backdrop around the Saved buses list closes it, as the location picker already does. Only a tap on the backdrop itself counts (`e.target === e.currentTarget`), so taps anywhere inside the list, including its empty spaces, leave it open.
- **Validation**:
  - On a phone (375 px) in the browser: a tap on an empty spot inside the list kept it open. A tap on the backdrop above it closed it, without reaching the From row underneath (the location picker stayed closed).
  - `npx tsc --noEmit -p .` passes, and 48 tests pass.

---

### Turn 49: Drag the Location Picker Down to Close It (19 October 2026)
- **User Prompt**:
  > *"do the same for the location picker modal"*, then *"go with your recommendation"*
- **Why**: the location picker already closed on Escape and on a backdrop tap, and it had a ✕. On a phone, though, it is a bottom sheet, and people expect to pull a sheet down to dismiss it.
- **Now**: below the `sm` breakpoint, the picker shows a grab handle above its header. Dragging the handle or header moves the sheet down with the finger. Letting go after 120 px, or after a quick flick (over 30 px at more than 0.5 px/ms), closes it. A shorter drag springs it back. Pressing the ✕ doesn't start a drag. On wider screens the handle is hidden and the centred dialog doesn't move.
- **Validation**:
  - On a phone (375 px) in the browser: a short drag left the sheet open and back in place. A long drag closed it without changing the location. The handle shows above the header, and the ✕ still closes the sheet.
  - On desktop (1280 px): the handle is `display: none`, and dragging the header 320 px left the dialog open with no transform. No console errors.
  - `npx tsc --noEmit` passes, and 48 tests pass.

---

### Turn 50: Local Node.js Virtual Environment (19 October 2026)
- **User Prompt**:
  > *"Setup a virtual environment for this project and show me how to activate it and install packages into it."*
- **Setup**:
  - Created `.venv` using Python's `venv` and nodeenv 1.11.0, with its own Node.js 24.19.0 and npm 11.17.0. npm's cache, user configuration and global install prefix stay inside `.venv`; app dependencies remain local to the project's `node_modules/`.
  - Added `.venv/` to `.gitignore` and activation, package installation, deactivation and recreation instructions to `README.md`.
  - Installed the existing dependencies with `npm ci` using the environment; npm reported 0 vulnerabilities.
- **Validation**: activation resolves Node and npm inside `.venv`, with the intended versions and project-local npm paths; deactivation returns to the system runtime. `npm ls --depth=0`, TypeScript and all 48 tests pass. The app's dependency files are unchanged.

---

### Turn 51: Audit and Validate Environment Configuration (19 October 2026)
- **User Prompt**:
  > *"Audit my repo for hardcoded settings that should be environment variables, centralize them into one validated config object, and generate a complete .env.example."*
- **Audit and implementation**:
  - Centralized local runtime, provider URL/credentials, timeout, polling, cache, pagination, rate-limit and Overpass retry/deadline settings in one immutable typed config. Server/API/data scripts import `config/server.ts`; Vite validates the same schema and injects only the explicit `config.public` projection from `config/public.ts` into `src/config.ts`.
  - All app reads of `process.env` are confined to `config/env.ts`. Repository `.env` files load in a documented order, with shell/platform variables taking priority. Invalid values fail before startup/build and errors never echo supplied credentials or URLs. Blank keys retain the existing offline/degraded behaviour.
  - Replaced duplicated LTA/NEA/OneMap endpoints and operational numbers in callers. Added bounded timeouts to LTA arrivals and paginated dataset fetches, and retained the OneMap timeout when a search cancellation signal is supplied. Health now reports its configured weather request budget.
  - `.env.example` is generated from schema defaults, with every supported setting, units/bounds, blank secrets and a CI deploy-hook note. Added `npm run config:example` and `npm run config:check`, plus the audit/usage guide in README. No local credential file was changed.
  - Kept geographic and transit/weather rules, browser storage identifiers, branding, attribution and UI constants in code. Deployment-file settings also remain in code. Excluded configuration and test descriptions from Tailwind scanning.
- **Validation**:
  - TypeScript and 55 tests pass, including config parsing, constraints, redaction, public projection, environment precedence, generated-example consistency and custom health provider/stop integration.
  - The production Vite build passes with code splitting. A separate production build with sentinel credentials contained none of the secrets or server-schema descriptions.
  - Local fixture tests verified configured URLs and secret headers through all five API endpoints, custom health timeout/stop, CDN cache overrides, and invalid runtime/public-build settings failing early. Production-build browser checks at 375 px and 1280 px verified the configured API/data/OneMap paths, the 25-second refresh override, map rendering, and no overflow/browser exceptions. These checks used controlled providers, not production upstream credentials.
- **Delivery**: changes are local on `codex/validated-config`; no deployment or production configuration was changed.

---

### Turn 52: Keep Project History Updated Every Time (19 October 2026)
- **User instructions**:
  > *"if there is anything that needs me to confirm, explicitly ask me for this or if there is nothing to confirm, jut say \"This is completed\""*
  > *"ensure COMMENTS.md is updated everytime."*
- **Action**: added standing instructions near the top of this file, a root `AGENTS.md` for future project work, and an always-applied `.cursor/rules/project-history.mdc` rule. Every project-related turn must update this history before its final response. Confirmation questions must be explicit; otherwise the final response uses the user's exact completion phrase.
- **Validation**: checked the instruction files and Markdown diff for consistency. Documentation-only change; no application tests were needed.
- **Status**: saved locally on `codex/validated-config`; no confirmation is needed.

---

### Turn 53: Secret Scan, Safe Storage and Redacted Logs (19 October 2026)
- **User Prompt**:
  > *"scan my code and git history for leaked secrets, then show me how to store them safely and redact them in logs and error output."*
- **Scan**:
  - Fetched origin refs/tags and confirmed a complete, non-shallow checkout. Installed official Gitleaks 8.30.1 into the ignored `.venv/bin`, checking its release archive's SHA-256 checksum.
  - Scanned 2,052 current first-party/built/metadata inputs plus all 52 commits reachable from local refs, tags and reflogs. Included uncommitted/untracked files, local env/npm files when present, Git config and commit metadata. Excluded dependencies/virtualenv; GitHub caches, unfetched PR refs, forks and remote logs were outside scope.
  - No confirmed credential leaks. Initial candidates were a public localStorage identifier (current and historical) and documentation prose. Verified each; added only an exact-value allowlist for the public identifier and reworded the prose. The final configured scan has zero findings. The remote contains no embedded credentials, and no local credential env files were present.
  - Added `.gitleaks.toml`, provider-specific credential/deploy-hook rules and `npm run secrets:scan`. It validates the custom rule with synthetic/blank examples, captures raw output privately, prints only finding locations, and removes temporary reports/snapshots. A failed/incomplete scan cannot count as clean.
- **Fixes and instructions**:
  - Added a shared server logger/redactor for configured secrets and common encoded/auth/header/URL/private-key forms. Error objects become safe classifications; raw messages, stacks, causes and binary data are omitted. Removed upstream-body and raw-exception logging across APIs/build scripts and NEA error-message propagation.
  - Express async API failures now reach a generic JSON error handler, including in development. Request bodies and raw errors are never sent back through that handler.
  - Added safe storage and logging examples in `SECURITY.md`, linked from README: ignored, mode-600 `.env.local`; Vercel Secret variables; GitHub Actions deploy-hook secret; no credentials under `VITE_`; and revoke/rotate-before-history-cleanup guidance. Expanded ignores for local platform/npm and private-key files.
- **Validation**: TypeScript, production Vite build and all 63 tests pass. Tests include nested/encoded/binary/error redaction, injection-safe JSON logging, async error forwarding and actual upstream credential-echo suppression. The real local development server returned generic 400/500 JSON for malformed input/async failures, with no sentinel values or stacks in responses/logs. Final Gitleaks scan reports zero findings across working tree/history.
- **Delivery**: local on `codex/validated-config`. No credentials were changed/tested against providers, no history was rewritten and nothing was deployed. No confirmation is required; the report explains scan/redaction limits and handling of intentional ignored local credential files.

---

### Turn 54: Project Status Review (19 October 2026)
- **User Prompt**:
  > *"read COMMENTS.md to understand current status of project."*
- **Findings**:
  - Live on `main` and Vercel: up to commit `a41fee8` (Turn 49, the drag-to-close location picker).
  - Turns 50–53 (the `.venv` Node environment, the validated config, the history instructions, and the secret scan with redacted logs) were done in this same folder on local branch `codex/validated-config`. That branch points at `a41fee8`. Its work is all uncommitted: 28 modified files plus new `config/`, `security/`, `SECURITY.md`, `AGENTS.md`, `.cursor/`, `.gitleaks.toml`, three scripts and two test files. None of it is pushed or deployed.
  - The older `codex/arrival-reliability`, `codex/remember-location` and `codex/wada-259-palette` branches are already merged into `main`.
- **Validation**: on the current working tree, `npx tsc --noEmit -p .` passes and all 63 tests pass. No files changed apart from this entry.
- **Status**: waiting for the user to decide whether to commit and deploy the `codex/validated-config` work.

---

### Turn 55: Check and Deploy the Validated Config and Secret Scanning (19 October 2026)
- **User Prompt**:
  > *"yes, check it and deploy to main"* (the Turns 50–53 work on `codex/validated-config`)
- **Checks before deploying**:
  - `npx tsc --noEmit -p .` passes and all 63 tests pass. `npm run config:check` reports a valid config. `npm run secrets:scan` finds 0 secrets in the working tree and in all 52 commits.
  - `npx vite build` works. The CSS (`index-CK6caHgK.css`) and React (`react-CyONRaQH.js`) file names are unchanged, so returning visitors keep both cached.
  - In the browser, the production build with the LTA stub (`prod-lta-stub`):
    - Phone (375 px): arrivals, nearest stops, the rain line and the map load (20 of 20 OneMap tiles, the Bus 72 route, live GPS bus, incident). No horizontal overflow and no console errors.
    - Desktop (1280 px): the OneMap place search ("ang mo kio hub") returns results.
    - API: `/api/health` returns 200, a missing `BusStopCode` returns a JSON 400, and an unknown service returns a JSON 404.
  - **Vercel preview** (`a952403` on branch `codex/validated-config`): this was the main risk, because the API functions now import `../config/server.ts`. The build succeeded and all four functions ran:
    - `/api/health` returns 503 "degraded", because `LTA_ACCOUNT_KEY` is set for Production only, not Preview. NEA is ok.
    - `/api/bus-arrival` returns 200, labelled simulated.
    - `/api/traffic-incidents` returns a JSON 503.
    - `/api/weather` returns 200.
- **Delivery**: committed as `a952403`, with this entry in `ca3b8a7`, and fast-forwarded `main` to them. The temporary remote branch `codex/validated-config` was deleted after the preview check. The local branch is kept, and the checkout is back on `main`.
- **Production check** (https://nypbus-tracker.vercel.app, live about 30 s after the push):
  - All four asset files return 200.
  - `/api/health` returns 200 "ok" with the production LTA key. `/api/bus-arrival?BusStopCode=55329` returns real LTA data (Bus 72, Go-Ahead). `/api/traffic-incidents` and `/api/weather` return 200.
  - The error responses are JSON: 400 for a missing stop code and 404 for an unknown service.
  - The build-time `/bus-routes/72.json` and `/route-shapes/72.json` return 200, so the route step works with the new config.
  - On a phone (375 px), the live site loads with no failed requests, no console errors and no overflow.

---

### Turn 56: No Completion Phrase for Claude (19 October 2026)
- **User Prompt**:
  > *"no you don't have to reply \"This is completed\""*
- **Now**: Claude reports normally at the end of a turn instead of using the exact phrase. The rule stays in `AGENTS.md`, `.cursor/rules/project-history.mdc` and the standing instructions above for the other agents. Everything else there still applies to Claude: log every project turn here, and ask explicitly when a confirmation is needed.
- **Validation**: documentation only, no application change.

---

### Turn 57: The Completion Phrase Stays for Codex (19 October 2026)
- **User Prompt**:
  > *"leave it in AGENTS.md for Codex"*
- **Now**: no files changed. The "This is completed" rule stays in `AGENTS.md`, `.cursor/rules/project-history.mdc` and the standing instructions above, for Codex. Claude's exception is recorded in Turn 56.
- **Validation**: none needed; no application change.

---

### Turn 58: What Still Needs the User (19 October 2026)
- **User Prompt**:
  > *"anything else i need to confirm?"*
- **Findings**: the checkout is clean on `main`, and everything is deployed. Still open for the user:
  - There's no local `.env` or `.env.local` yet, so local runs have no LTA key. The user adds the key themselves.
  - The drag-to-close location picker (Turn 49) hasn't been tried on a real phone yet.
  - Optional: Vercel preview builds have no `LTA_ACCOUNT_KEY`, so previews show simulated arrivals.
  - Optional: four local `codex/*` branches are all merged into `main` and could be deleted.
- **Validation**: checked `git status`, the branches, and which `.env*` files exist (names only). No files changed apart from this entry.

---

### Turn 59: Old Codex Branches Deleted (19 October 2026)
- **User Prompt**:
  > *"delete the old codex branches"*
- **Now**: deleted the four local branches `codex/arrival-reliability`, `codex/remember-location`, `codex/validated-config` and `codex/wada-259-palette` with `git branch -d`. That command only deletes branches already merged, and `git branch --merged main` listed all four first. GitHub had no `codex/*` branches. Only `main` is left.
- **Validation**: `git branch` shows only `main`, and `git ls-remote --heads origin` lists no `codex/*` branches.

---

### Turn 60: Read Current Project Status (19 October 2026)
- **User Prompt**:
  > *"Read COMMENTS.md to understand current status of project."*
- **Review**: read the project history and `AGENTS.md`. The configuration centralization, virtual environment, secret scanning and safe logging work was committed and deployed in Turn 55; its recorded checks passed 63 tests and verified production APIs and mobile rendering. The four merged local Codex branches were deleted in Turn 59.
- **Current checkout**: `main` at `b34a4aa`, matching the local `origin/main` reference, with a clean working tree before this entry. No remote fetch or live deployment checks were performed during this documentation review.
- **Outstanding items recorded in Turn 58**: local LTA credential setup, a real-phone check of drag-to-close, and optional preview-environment credentials. Branch cleanup is complete. These items do not require confirmation for this reading request.
- **Validation and delivery**: documentation only; checked Git status/history and the Markdown diff. No application tests rerun. This history entry is local and uncommitted.

---

### Turn 61: Review Modularity and Responsibility Boundaries (19 October 2026)
- **User Prompt**:
  > *"review my structure for modularity: which files do too much, and how should i split them along responsibility seams?"*
- **Review**: inspected the 67 production/tool TypeScript files by size/import relationships and traced state, effects and shared logic in the main modules. Saved evidence, proposed owners/contracts and a staged extraction plan in `MODULARITY_REVIEW.md`.
- **Findings**: prioritize `App.tsx` (route/journey/GPS/weather/saved-state coordination plus layout) and reusable LTA logic currently exported from `api/bus-route.ts` to its build script. Next separate Leaflet lifecycle/layers/markup, weather parsing/cache scheduling/presentation, generic geometry from fallback route data, and transport from domain rules in `busTrackerService.ts`. Large UI files have lower-priority subcomponent seams; existing walking, rain and alarm modules remain useful boundaries.
- **Recommendations**: preserve request identity, cache/timer ownership, the server/browser config boundary, shared departure rules, map lazy loading and existing response/static-file formats. Extract pure selectors and focused state owners before splitting layouts; avoid replacing App with one equally broad hook/global store.
- **Validation**: `npm run lint` passes and all 63 tests pass via `node --import tsx --test tests/*.test.ts`. Checked report source references and documentation diff. No new tests, build, browser checks or live requests were needed for this review; proposed refactors remain unimplemented.
- **Delivery**: report and this history entry are local and uncommitted on `main`; preserved the existing Turn 60 entry. No source changes, commit, push or deployment. No confirmation is required.

---

### Turn 62: Clarify the Recommended Improvements (19 October 2026)
- **User Prompt**:
  > *"is there no improvements?"*
- **Clarification**: the modularity review found several improvements; the earlier completion phrase did not communicate them clearly. Explained the priorities directly: extract focused state owners from App, move reusable LTA data logic below HTTP/build entry points, separate Leaflet lifecycle/layers/markup, and divide weather parsing/cache/presentation responsibilities.
- **Status**: recommendations are documented in `MODULARITY_REVIEW.md` and remain unimplemented. This question did not request applying the refactors. No application code, commits or deployments changed.
- **Validation**: checked the history and documentation diff; no application tests rerun for this clarification.

---

### Turn 63: Implement the Recommended Modularity Refactor (20 October 2026)
- **User Prompts**:
  > *"proceed with your recommendation."*
  > *"continue from last action"*
- **Implementation**:
  - Created local branch `codex/modularity-refactor`, preserving the existing uncommitted history/review work. Shared geometry, transit/network/weather contracts and provider parsers now live in `shared/`; presets and offline routes are separate.
  - Extracted LTA transport, dataset/cache ownership, route mapping and network serialization into `server/lta/`. The API and actual build CLI consume these services independently. Provider operators are validated at the mapping boundary.
  - Reduced App from 1,356 to 642 lines and from 22 to three local state calls. Focused feature hooks own route tracking, journey selection, GPS/storage, saved buses, network loading, polling and navigation. Pure journey selectors/presentation and commute-advice assembly are separate from effects and layout. Kept route request IDs, trip geometry keys, late-GPS protection and the shared selected-stop arrival snapshot.
  - Reduced the map component from 666 to 57 lines, separating Leaflet lifecycle, layer ownership/cleanup, viewport behavior, escaped marker builders, controls and legend. Preserved lazy loading, attribution and zoom-animation teardown handling.
  - Separated weather catalog/cache/budget service, shared provider normalization, browser transport, summary/bands, UI presentation and refresh state. Removed duplicate two-hour forecast parsing. Route and weather API adapters are now 51 and 28 lines respectively; their public paths and supported response formats remain intact.
  - Replaced the mixed bus service module with focused arrivals, routes, incidents and stop-name clients; separated route-shape transport from geometry algorithms. Updated README and `MODULARITY_REVIEW.md` with the implementation and optional smaller UI follow-ups.
- **Validation**:
  - TypeScript and the separate unused-local check pass. All 78 tests pass (63 existing plus 15 new cases for contracts, cache coalescing/expiry/isolation/failures, weather budgets/stale data, journey timing/transfer/alarm/geometry, marker escaping and import boundaries).
  - Production Vite build passes with separate app/React/lazy-map chunks. CSS remains `index-CK6caHgK.css` and React remains `react-CyONRaQH.js`. The actual route-build CLI produced correct route/index/network JSON against a controlled LTA provider in a temporary output directory, preserving existing route data.
  - Local fixture checks passed all five API endpoints, configured URLs/headers, health timeouts and arrival cache headers. Production client builds contain no credential sentinels or server schema text.
  - Browser checks at 375 px and 1280 px passed trip auto-selection/map overlays, destination swap/clear, delayed route-response races, saved buses, persisted location/search across reload, protection against late startup GPS, and repeated map teardown during zoom. No page exceptions, duplicate live-bus markers or horizontal overflow. These checks used local provider fixtures rather than production upstream credentials.
  - Gitleaks 8.30.1 reports zero findings across 2,109 working-tree/built/metadata inputs and 59 commits reachable from local refs/tags/reflogs; checkout is non-shallow and the remote has no embedded credentials. No remote fetch was performed for this refactor audit. Documentation links and diff whitespace checks pass.
- **Delivery**: implementation, tests and documentation are local and uncommitted on `codex/modularity-refactor`. No push, deployment or production configuration change. Smaller UI-only extractions listed in the review remain optional follow-ups; the four recommended responsibility splits and their foundation are implemented. No confirmation is required.

---

### Turn 64: Restore Normal Completion Responses (20 October 2026)
- **User Prompt**:
  > *"remove the rule on \"This is completed\" when the task is complete, and back to your usual"*
- **Action**: removed the fixed completion phrase from `AGENTS.md` and this file's standing instructions. Responses now use normal, concise summaries. The `.cursor/rules/project-history.mdc` rule delegates to `AGENTS.md`, so it inherits the updated guidance without an edit. This supersedes the completion-phrase instructions recorded in Turns 52, 56 and 57; those entries remain as historical records.
- **Validation**: verified the active instructions no longer require a fixed phrase and checked the Markdown diff. Documentation-only change; no application tests needed.
- **Status**: saved locally on `codex/modularity-refactor`, preserving the existing refactor and history updates. The requirements to update this file every project turn and ask explicitly when confirmation is needed remain in effect.

---

### Turn 65: Options After Completing the Refactor (20 October 2026)
- **User Prompt**:
  > *"what are my options after \"Continue from last action\""*
- **Current state**: confirmed the refactor remains local and uncommitted on `codex/modularity-refactor`, with HEAD at `b34a4aa`. Turn 63 records 78 passing tests, the production build, local API/CLI/browser checks and a clean secret scan; those checks were not rerun for this status question.
- **Options**: review and publish the completed batch to main/Vercel; create a pull request and preview for review before production; or continue the optional smaller UI/place-search extractions. Recommended finishing review and delivery of the current batch before expanding the refactor.
- **Validation and delivery**: read the current history/review and checked Git status. Documentation-only update; no commit, push, PR or deployment performed in response to this question.

---

### Turn 66: Review and Publish the Modularity Refactor (20 October 2026)
- **User Prompt**:
  > *"go with your recommendation"* (review, commit, merge into main, deploy and verify live)
- **Review**: checked the extracted state owners, request/geometry guards, map lifecycle/layers, provider services and entry points. No blocking issue found. Fetched origin branches/tags; at release start remote `main` matched `b34a4aa`, the refactor's base. Confirmed Vercel's existing `nypbus-tracker` project in `carbon-bc04` is linked to this GitHub repository; no new project or credential change is needed.
- **Release checks**:
  - TypeScript with unused-local checking passes; all 78 tests pass; the production Vite build passes with the map still lazy loaded and unchanged CSS/React asset filenames.
  - Repeated the actual route-build CLI fixture check and all five local API checks, including configured provider URLs/headers, health timeout, cache headers, invalid settings and client-build secret exclusion.
  - Repeated production-build browser checks at both 375 px and 1280 px: destination/trip selection and map overlay, swap/clear, delayed route races, saved buses and location persistence, late-GPS protection and repeated map cleanup. No page exceptions, duplicate bus markers or horizontal overflow.
  - After fetching remote refs, Gitleaks reports zero findings in 2,109 scanned inputs and 59 commits; the checkout is non-shallow and the remote has no embedded credentials. Corrected whitespace in five extracted files; the staged diff whitespace check passes.
- **Delivery**: committed the refactor and accumulated documentation as `f296d21`, fast-forwarded `main` and pushed to GitHub. Vercel production deployment `dpl_62bP3N5ALsSsngQnekXxHuhLqiGB` is READY; verified the live domain resolves to that exact commit.
- **Production APIs** (https://nypbus-tracker.vercel.app): all five endpoints return 200, health is `ok`, arrivals are real LTA v3 data, and Bus 72's API route has operator GAS. Missing stop and unknown service return JSON 400/404. Static route, road shapes and network return 200; the network contains 5,209 stops and 797 patterns. Weather initially had two missing datasets, then returned all 12 on follow-up. The deployed app asset matches the local release build; linked assets return 200.
- **Live browser verification**: both 375 px and 1280 px pass real-arrival display, automatic trip selection, journey map/OneMap tiles, saving a bus, manual location persistence across reload, remembered bus search and repeated map teardown/remount. No page exceptions, extra map containers or horizontal overflow. The harness was corrected for the seeded default favorite and to dismiss mobile text entry before tapping Save; no application change was made for those harness adjustments.
- **Final status**: the refactor is merged, pushed and verified live. This delivery-results update changes documentation only and is committed separately. No confirmation or outstanding release work is required; the smaller extractions in `MODULARITY_REVIEW.md` remain optional.

---

### Turn 67: Check Whether Confirmation Is Needed (20 October 2026)
- **User Prompt**:
  > *"anything i need to confirm?"*
- **Finding**: no confirmation is required. The approved refactor was committed as `f296d21`; the delivery notes were committed and pushed as `845f33e`. In the preceding turn, Vercel verified the final production deployment at that exact documentation commit, followed by successful live page, health, route and network checks. Optional smaller modularity improvements do not block the release.
- **Validation**: read `AGENTS.md` and the release history; checked the latest two commits and confirmed the working tree was clean before this entry. No fresh remote fetch, live checks or application tests were run for this status question.
- **Delivery**: this status entry is local and uncommitted. No application changes, additional commit, push or deployment were requested or performed.

---

### Turn 68: Explicitly Supersede the Old Completion Phrase (20 October 2026)
- **User Prompt**:
  > *"remove the rule on \"This is completed\" when the task is complete, and back to your usual"*
- **Finding and action**: the repository instructions already requested normal summaries after Turn 64, but the previous two replies followed an older copy in conversation context. Strengthened `AGENTS.md` and this file's standing instructions to explicitly supersede older completion-phrase requirements, including copies in prior context. The always-applied `.cursor/rules/project-history.mdc` delegates to `AGENTS.md` and needs no separate edit. Preserved historical entries and the existing Turn 67 update.
- **Validation**: searched project instruction references, read the rule files and checked the documentation diff for whitespace errors. Documentation-only change; no application tests or live checks were run.
- **Delivery**: instruction and history changes are local and uncommitted. No commit, push or deployment; no confirmation is required. Future responses use normal summaries, with explicit questions only when confirmation is needed.

---

### Turn 69: Trace UI, Business Rules and Data-Access Boundaries (20 October 2026)
- **User Prompt**:
  > *"Show me where my UI, business logic, and data access are tangled together, and how to split them into clean layers."*
- **Review**: traced the current post-refactor imports and responsibilities rather than repeating the already-completed App/map/weather extraction. Added a dated follow-up to `MODULARITY_REVIEW.md` with source references, consequences, proposed modules, dependency direction and migration order.
- **Findings**: place search combines provider HTTP/mapping, ranking, React timing and recent-place storage; network algorithms share a module with fetch/cache ownership; saved-bus state mixes persistence, identity/default rules and timestamps. The all-buses view requests stop names, arrival/trip UI still contains schedule/threshold rules, and arrival/incident HTTP handlers still own provider access/fallback or normalization. Identified recent-place storage writes inside an App state updater and unvalidated non-array favorite JSON as concrete reasons to separate the boundaries.
- **Recommendation**: start with places/network, then validated favorite storage and prepared stop-service rows. Extract schedule/shared-threshold rules and remaining server clients afterward. Preserve public behavior, cancellation, cache/poll ownership, source labels, storage keys and valid empty favorites. Keep ordinary UI expansion/formatting and App composition where they are; use small functions/contracts rather than a global store or generic repository framework.
- **Validation**: all three existing architecture tests pass. Checked source references against current file lengths and checked documentation whitespace. The current tests cover server/browser/shared boundaries and lazy Leaflet loading, not all proposed UI/domain/data restrictions. No full test run, build or live checks were needed for this review; no production source was changed.
- **Delivery**: review and history updates are local and uncommitted, preserving the existing instruction/history changes. No implementation, commit, push or deployment was requested or performed. No confirmation is required to read the recommendations.

---

### Turn 70: Implement the Remaining UI, Business and Data Layers (20 October 2026)
- **User Prompts**:
  > *"go with your recommendations"*
  > *"continue where you last left off"*
- **Instructions and scope**: read the project history, preserved the uncommitted instruction/review updates and created local branch `codex/clean-layers`. The replacement AGENTS instructions retain normal completion summaries and history updates; the saved instructions already match them. Implemented the six recommended boundaries without adding a framework or changing deployment/configuration.
- **Implementation**:
  - Replaced mixed place-search and network service modules with plain models, pure rules/index/query functions, injected data adapters and application hooks. Moved geographic validation into shared geometry. Retained local stop/postal classification, OneMap ordering, debounce/cancellation, result/source distinctions and retryable shared network loading.
  - Recent-place commands now calculate the next state independently and persist outside React state updaters. The all-buses view receives names from the app's already-loaded network rather than starting its own request/cache.
  - Split saved-bus identity/default/toggle rules from validated storage and React coordination. Missing/corrupt data recovers safely, valid empty lists remain empty, and failed persistence does not break the current visit. Preserved storage keys, service/stop identity and the seeded Bus 72; clock-dependent creation is injectable.
  - Extracted the four-am Singapore service-day policy with an explicit clock input and reused the existing walking threshold in the trip view. Formatting, expansion and renderer behavior remain presentation concerns.
  - Extracted server arrival/incident provider services and deterministic simulation/normalization. HTTP adapters now map queries, result variants, statuses and cache headers. Preserved public wire formats, live/simulated labels, incident errors and redacted logging.
  - Updated README and `MODULARITY_REVIEW.md` to describe implemented boundaries and optional later JSX extractions. Added dependency guards for pure domain/models, direct data access in UI and provider requests in HTTP adapters.
- **Validation**:
  - TypeScript including unused-local checking passes. All 96 tests pass: the previous 78 plus 18 focused regression/boundary checks. Production Vite build passes; CSS and React filenames remain unchanged and Leaflet stays in its separate lazy chunk. The full route-download build was not needed or run for this change.
  - Local controlled providers verify all five API endpoints, configured URLs/headers, health timeout, live arrival cache headers, invalid-setting failures and absence of secret sentinels/server schema in browser assets.
  - Production-build browser checks pass at 375 px and 1280 px for normal trips/maps, swaps/clear, stale route responses, saved buses/location persistence, late-GPS protection and repeated map cleanup.
  - Additional checks at both widths pass corrupt-favorite recovery, empty favorites after reload, denied writes preserving in-memory state, OneMap failure with local-stop results, stale address-response rejection, exactly one recent-place write per selection, persistence and one shared network request. No page exceptions or horizontal overflow.
  - Gitleaks 8.30.1 reports zero findings in 2,125 working-tree/build/metadata inputs and 61 locally reachable commits; no remote fetch was performed for this batch. Documentation whitespace and all 80 local README/review links pass validation.
- **Delivery**: complete locally and uncommitted on `codex/clean-layers`, preserving the existing history/instruction changes. No commit, push, PR, production deployment or provider-credential change was performed. Smaller JSX/view-model extractions remain optional, outside the six completed boundaries. No confirmation is required for this implementation.

---

### Turn 71: Document and Validate Bus-Arrival JSON (20 October 2026)
- **User Prompt**:
  > *"Show me the JSON shape this API returns, and add validation so a malformed response is caught early."*
- **Scope**: the user selected bus arrivals when asked which API. Read current history and both response boundaries, preserving all existing local layer-refactor changes. Checked LTA's official API User Guide version 6.10 (1 October 2026) for the arrival fields and legitimate blank subsequent-bus data; no live LTA credentials or production responses were requested.
- **Implementation**:
  - Added a shared arrival wire contract/runtime validator in `shared/transit/arrivals.ts`, re-exported by the server type module. The server checks provider JSON and the requested stop before assigning the live source; the browser independently checks the public source/shape before mapping records or computing ETAs.
  - Validates service identities/operators, nested bus objects, timestamp calendar/timezone correctness, enums, decimal GPS strings/ranges, codes and monitoring flags. Missing/null/empty slots and blank estimated-arrival placeholders remain legitimate no-estimate data; `Services: []` remains distinct from an unavailable feed.
  - A malformed snapshot is rejected as a whole. Unknown additive fields are discarded. Server diagnostics contain at most eight field paths/constraints and omit payload values, raw bodies and parser snippets. Existing labelled simulation fallback remains; its warning now distinguishes invalid/unavailable upstream data from missing credentials. Simulations are never treated as live client data.
  - Stop/service query types and formats return field-only HTTP 400 errors before a provider call. Added `docs/api/bus-arrival.md` with an illustrative complete JSON example, field rules, errors and fallback behavior; linked it from README and the review.
- **Validation**:
  - TypeScript with unused-local checks, the production Vite build and all 107 tests pass (96 preceding tests plus 11 validation/contract regressions). The documented example is parsed by the runtime validator in a test.
  - Tests cover corrupt envelopes/nested fields, wrong stops/sources, legitimate empty slots, malformed dates/types/GPS, capped value-free diagnostics, invalid provider JSON/media types, fallback provenance, removal of unknown fields and invalid queries before network access. The old invalid-timestamp client expectation was updated to reject the entire snapshot rather than only its bus entry.
  - Controlled local provider/API checks and production-build browser flows pass at 375 px and 1280 px: normal arrivals/trips/maps, route races, saved buses/location persistence, late-GPS protection and map cleanup. No page exceptions or horizontal overflow. Browser checks used valid fixture data; malformed-data rejection was tested directly at shared, provider, client and HTTP-query boundaries.
  - Secret scan reports zero findings in the working tree/build and 61 locally reachable commits; no remote fetch was performed. Documentation and source whitespace checks pass.
- **Delivery**: local and uncommitted on `codex/clean-layers`; no commit, push, deployment or production-setting change. No confirmation is required.

---

### Turn 72: Check Whether the Project Has a SQL Database (20 October 2026)
- **User Prompts**:
  > *"write the SQL to get what i want from my database, and explain the query and any indexes it needs."*
  > *"i am not sure, can you check?"*
- **Investigation**: read the project instructions/history and inspected dependencies, configuration definitions, API/provider services, network loading/indexing, browser persistence and repository file names. No SQL database integration, SQL schema/migrations, local database file or database driver was found in the repository. `config/schema.ts` defines environment configuration, not database tables. This finding covers repository code/configuration; no external account inventory or unrelated database was inspected.
- **Findings**: arrivals are fetched from LTA, weather from NEA/data.gov.sg, routes/stops from generated JSON and temporary in-memory caches. Favorites, recent places, last location and last bus search use browser localStorage. Arrival snapshots are not saved as queryable history. The network already builds in-memory stop-code, stop-to-route and geographic-grid lookups, rather than SQL indexes.
- **Guidance**: for the bus-arrival use case discussed in the preceding turn, the existing GET `/api/bus-arrival?BusStopCode=55329&ServiceNo=72` requests Bus 72 at stop 55329; omitting `ServiceNo` requests all services. SQL and database indexes are not applicable to that current path. Recommend retaining this path for current arrivals; historical reporting or cross-device account data would first require an explicit persistence feature and schema. No speculative SQL tables or database infrastructure were added.
- **Validation and delivery**: read-only source inspection completed; only this history entry was changed. No SQL was executed, credentials inspected, tests/build rerun, commit, push or deployment performed. Existing local implementation changes were preserved. A concrete SQL query remains dependent on an actual schema and desired result if the user intends a separate database or a new persistence feature.

---

### Turn 73: Review Data-Model Duplication and Relationships (20 October 2026)
- **User Prompt**:
  > *"review my data model for duplication, missing relationships, and fields that will hurt me later."*
- **Scope and actions**: read the project instructions/history and reviewed current wire/domain/view types, provider mappings, route/network builders and loaders, favorite/location storage and consumers. Added a dated data-model review to the existing `MODULARITY_REVIEW.md`, with prioritized findings, source links, conceptual relationships and a migration order. Preserved all existing uncommitted implementation work; no application behavior was changed.
- **Findings**: physical stops are conflated with route stop occurrences and timetable fields; selection loses later visits to the same stop. Arrival decoding loses absolute timestamps and per-bus origin/destination/visit metadata, while omitted monitoring becomes false. Network loaders do not enforce referenced-stop integrity. Favorite equality ignores its stored direction and can retain stale labels; versioned migrations/uniqueness rules are missing. Location `isSimulated` conflates actual selected places with defaults and loses place references/GPS capture time. Identified useful wire/view duplication to retain and enum/category/unit duplication to reduce. The existing favorite identity behavior is covered intentionally by a test; its semantics must be resolved before any migration.
- **Validation**: audited the ignored local generated snapshot dated 10 October: 5,208 stops, 798 patterns, 225 patterns with repeated stops, 602 route files and 26,823 embedded stop occurrences. Actual stop references and stop/hop array lengths are valid in that snapshot. Three direct controlled checks reproduce an accepted invalid network reference causing a nearby-query exception, another-direction favorite toggle removing the original, and arrival timestamp/visit/destination loss with unknown monitoring converted to false. All 27 selected architecture/layer/arrival-validation tests pass; these are baseline checks, not fixes for the identified gaps. Checked review links and documentation whitespace.
- **Delivery and limits**: review/history updates are local and uncommitted. No application fixes, new regression tests, full build, browser checks, live-provider calls, database creation/queries, secret scan, commit, push or deployment occurred. Recommendations can be implemented incrementally without introducing a SQL database; generated-snapshot counts are not claims about today's production data.

---

### Turn 74: Implement Data-Model Integrity and Saved-Record Migrations (20 October 2026)
- **User Prompt**:
  > *"proceed with your recommendations"*
- **Scope**: read the project instructions/history and implemented the data-model review on the existing local branch, preserving all preceding uncommitted layer/arrival-validation changes. Applied the React best-practices and full-flow verification skills. Kept APIs/generated JSON backward-compatible, avoided new database infrastructure and selected direction/occurrence-specific favorite semantics because favorites already reopen a chosen direction.
- **Implementation**:
  - Added shared network/route/shape parsers with identity, coordinate, timetable, generation/version and relationship checks. Invalid references, mismatched stop/hop arrays and duplicate stop/pattern keys cannot enter the network cache; invalid loads remain retryable. Kept legitimate repeated stops and normalized case after the real local files revealed lowercase service suffixes. New route/network/index builds carry one schema/generation identifier; planned-leg route/geometry loads refuse incompatible generations.
  - Separated physical stop attributes from the flattened route-stop view and introduced canonical normalized stop calls with pattern, sequence, stop code, occurrence and dataset references. Route selection, trip legs, road slicing, list/map selection and alarm segments preserve later loop visits. Provider sequences survive mapping; saved references rebase by stop/occurrence rather than stale array indexes. Provider visit numbers are retained independently, without claiming an unambiguous route/vehicle match.
  - Decoded arrivals retain absolute instants, each bus's origin/destination/visit, paired usable coordinates and live/scheduled/unknown monitoring. Added an explicit available/unavailable snapshot contract with stop, receipt time, source and failure reason. Polling owners derive countdowns from an explicit clock between fetches, preserving references when displayed values are unchanged. Unknown tracking no longer gets a timetable label. Existing legitimate empty responses and clearly labelled sample fallback remain supported.
  - Favorites now distinguish canonical service/stop/direction/occurrence, keep unique legacy IDs where possible, deduplicate logical records and repair duplicate IDs. Current stop/terminus labels resolve from the network. New storage writes use a version-2 envelope with one offline label snapshot rather than duplicating flat labels; readers migrate old arrays and retain intentional empty lists. Recent-place/location writes are also versioned while reading legacy records without initialization-time writes.
  - Replaced active `isSimulated` location usage with explicit GPS/selected-place/default origins. Retained GPS capture time/accuracy, selection time and explicit provider/stop/postal references when available. Legacy GPS timestamps remain unknown rather than fabricated. Restoring the last location, late-GPS protection, denied storage and browser-local operation remain intact.
  - Reused shared physical-stop/transit enum types and preserved raw provider category values, with `Other` for unknown display categories. Added `docs/data-model.md`, linked it from README and appended an implementation follow-up to the original review. Optional wire fields remain readable during normalization; the guide documents compatibility fields and limits.
- **Validation**:
  - TypeScript with unused-local checks and all 123 tests pass: the prior 107 plus 16 meaningful model/boundary/migration regressions. Tests cover invalid cache references/recovery, route/shape identity and generation mismatches, loop selection/rebasing/geometry/alarm slices, per-bus metadata and aging, direction-aware favorites/uniqueness/label resolution, and legacy/versioned/invalid location and recent-place records. Updated earlier assertions only for the intentional identity/storage/source changes.
  - Validated the existing local generated network, all 602 route files and all 673 shape files against the new readers. The production Vite build passes with CSS/React chunks unchanged and Leaflet still lazy. Ran the actual route-build CLI against a controlled provider in an isolated temporary project; route/index/network and nested call generation identifiers match. The root route-download build was not run and ignored local route data was not replaced.
  - Controlled providers verify all five API endpoints, configured URLs/headers, health timeout, live-arrival cache headers, invalid-setting failures and absence of secret sentinels/server schema in browser assets. Normal production-build browser journeys pass at 375 px and 1280 px, including trip/maps, swap/clear, stale route requests, saved/location persistence, late-GPS protection and map cleanup.
  - Storage/search recovery flows pass at both widths: corrupt favorites, intentional empty lists/reload, denied writes, local stop fallback, stale address responses, one recent write per selection and one shared network fetch. Additional model flows pass at both widths: live countdown aging without another request, legacy migration on save, independently selecting/saving both loop-stop occurrences, reopening the later visit and refreshed labels. Repeated the model flows after final storage adjustments. No page exceptions or horizontal overflow; visually inspected the phone loop-selection screenshot.
  - Gitleaks reports zero working-tree/history findings across 2,144 inputs and 61 locally reachable commits; no remote fetch was performed. All 99 local README/review/model-guide links and tracked documentation/source whitespace checks pass.
- **Delivery**: complete locally and uncommitted on `codex/clean-layers`. No commit, push, PR, deployment, production-setting change or real-provider credential use. Provider-to-route matching remains explicitly uncertain where the feed cannot identify a visit; no stable vehicle identity or account/history database is invented. No user confirmation is required for the completed local implementation.

---

### Turn 75: Confirm Outstanding Decisions and Delivery Status (21 October 2026)
- **User Prompt**:
  > *"anything else i need to confirm?"*
- **Actions and findings**: read the project instructions and latest history, then checked the current branch, working-tree status and last commit. No unresolved user decision or confirmation is required for the completed implementation. The direction/occurrence-specific favorite behavior and backward-compatible storage readers were already implemented and verified in Turn 74.
- **Validation**: read-only Git/status inspection plus whitespace checking of this history entry. The 123-test, TypeScript, build, browser and secret-scan results are from Turn 74; no application checks were rerun for this status question.
- **Delivery**: changes remain local and uncommitted on `codex/clean-layers`, with HEAD still `845f33e`. Commit, push and deployment remain outstanding delivery actions; none were performed in this turn. Updated this history only.

---

### Turn 76: Profile Lookups and Recommend Applicable Indexes (21 October 2026)
- **User Prompt**:
  > *"find my slowest or most frequent queries and tell me exactly which indexes to add."*
- **Investigation**: read project instructions/history and traced network lookups, trip planning, saved-label resolution, place-search triggers and all three arrival polling owners. The repository still has no SQL database/driver/workload or SQL query log, so no SQL index DDL is applicable. Inspected configured scheduling, not production traffic or external account logs.
- **Measurements**: profiled the actual local network (5,208 stops, 798 patterns, generated 10 October) on Node 24.19.0. Eight origin/destination scenarios over 120 warmed individual calls put `planTrips` at 3.581 ms median / 4.872 ms p95; a second baseline was 3.578 ms median. Batched per-call medians were 0.172 ms for nearest stops, 0.189 ms for mixed searches, 0.0106 ms for exact-code scanning and 0.0604 ms for labels across 20 spread-out favorites. These are local CPU measurements, not production/browser/HTTP latency; batched p95 values are not individual-call tail percentiles.
- **Candidate indexes and recommendations**:
  - Tested an isolated temporary planner variant retaining the existing fixed-200-m transfer-neighbor lists per immutable network. Warm plans measured 0.859 ms median / 1.320 ms p95, with 1,929 stop keys / 5,362 neighbor entries across the scenarios. Fresh-network first use measured 4.229 ms median, so the benefit requires reuse. Recommend a lazy network-owned `(radiusM, stopIndex)` neighbor index if optimizing repeated replanning, with network-identity invalidation.
  - Tested `byServiceDirection`, keyed by canonical service and direction, in an equivalent saved-label selector: 0.00108 ms median for 20 favorites versus 0.0604 ms. This 798-entry map is optional; the current absolute cost is small. Reuse existing `byCode` for exact five-digit stop queries. Retain existing spatial/stop-to-pattern indexes; do not add an unnecessary SQL/full-text index.
  - Arrival polling is the shortest recurring source schedule: nominally about four tracked-stop requests/minute plus two per distinct enabled favorite/trip stop, subject to request duration, initial/manual refreshes and caching. Separate owners deduplicate within their own lists but do not coalesce requests across owners. Recommend shared in-flight/fresh-snapshot handling keyed by stop code before treating frequency as an indexing problem. No observed production counts or provider-origin request counts were inferred from those schedules.
- **Artifacts and validation**: added `scripts/profile-lookups.ts` and `npm run profile:lookups`, a recorded JSON result and a dated section in `docs/data-model.md`; linked the findings from README. The reusable profiler runs candidate code only in a temporary module, cleans it afterward and performs no network requests. Candidate label results matched exactly; all eight warm and 24 fresh-network candidate trip outputs matched the current planner. TypeScript including unused-local checks and all six architecture tests pass. Checked documentation links and whitespace. No full application test/build/browser/secret-scan rerun was needed or claimed for this diagnostic-only change; Turn 74 retains the preceding 123-test release baseline.
- **Delivery**: profiling artifacts/documentation/package command are local and uncommitted. No candidate index or polling optimization was installed in application code. No database was created or queried; no provider/production telemetry calls, commit, push or deployment were performed.

---

### Turn 77: Apply Lookup Indexes and Shared Arrival Requests (21 October 2026)
- **User Prompt**:
  > *"go with your proposals."*
- **Scope**: read the project instructions/history and implemented all four Turn 76 proposals on the existing local branch, preserving prior uncommitted work. No database, deployment configuration or provider credential was changed. Used the React data-fetching/timer guidance and full-flow verification approach already applied in this conversation.
- **Implementation**:
  - Added a lazy transfer-neighbor index owned by each immutable loaded network, keyed by radius and stop index. Trip planning reuses its neighbor lists across plans/access-radius passes; rebuilding a network starts empty caches. Added the canonical service/direction map and switched saved-label resolution to it. Exact five-digit searches now use the existing stop-code map; prefix/name/road behavior and loop visits are preserved.
  - Added an injected arrival repository shared by tracked-stop, favorite and trip polling. It coalesces pending requests by normalized five-digit stop code and reuses only validated live snapshots for the configured tracked-arrival interval. Reads preserve original receipt times and do not extend expiry. Live empty responses remain distinct from failures; simulated/malformed/network failures are not retained as settled success. Wrong-stop results fail safely. LRU live caching is bounded to 128 stops by internal policy; pending work is separate and not evicted.
  - Explicit refresh bypasses fresh settled data and browser HTTP caching, while joining an already-running request rather than overlapping it. The force flag applies only to that action, not later polls/stop changes. Failed refreshes remove earlier settled cache entries so other consumers can retry. Per-owner cancellation remains local and does not abort another consumer's shared request. Favorites now schedule after completion to avoid overlapping slow refresh rounds. The repository is a shared read cache rather than a push/subscription store; consumers obtain new snapshots on their next poll/read.
  - Updated the reusable profiler to compare the installed indexes against the preceding uncached lookup algorithm in a temporary module, with cleanup and output-equivalence assertions. Preserved the earlier profile JSON and added the post-change measurements. Updated README, the data-model guide and the review with implementation details, cache behavior and measurement limits.
- **Validation**:
  - TypeScript including unused-local checks and all 137 tests pass (123 previous plus 13 cache/index regressions and one architecture guard requiring all three polling owners to use the shared repository). Coverage includes radius/network isolation, unchanged loop/prefix/search behavior, direction lookup, in-flight sharing, expiry boundaries/clock rollback, explicit refresh, failure recovery, empty/simulated responses, absolute-time aging, LRU/pending isolation and HTTP cache bypass.
  - On the same 5,208-stop / 798-pattern local snapshot, warm planner median/p95 measured 0.882/1.338 ms versus 3.539/5.092 ms for the uncached comparison; a second baseline was 3.580 ms median. Fresh-network first use was 4.112 ms median, so the speedup depends on reuse. All eight warm and 24 fresh-network comparison outputs match exactly. Saved-label resolution for 20 spread favorites measured 0.00118 ms versus 0.0594 ms. Timings are local CPU microbenchmarks, not production or phone latency claims.
  - Controlled API/provider checks and standard production-build browser flows pass at 375 px and 1280 px for all five endpoints, configured URLs/headers/timeouts/cache labels, trip/map flows, swaps/clear, stale route requests, saved/location persistence, late-GPS protection and repeated map cleanup. Invalid settings still fail before startup/build, and browser assets omit server schema/secret sentinels.
  - New browser flows at both widths verify tracking + favorite + trip boarding all using one request for the same stop, joining an in-flight manual refresh, explicit refresh bypassing fresh data, malformed-data sample fallback without cache poisoning, immediate retry and returning to a cached stop after a manual refresh without unnecessarily forcing another request. No page exceptions or horizontal overflow. These request counts are fixture evidence, not production/provider-origin statistics.
  - Production Vite build passes; CSS/React chunks are unchanged and Leaflet stays lazy. The root route-download build was not run. Gitleaks reports zero findings across 2,149 working-tree/build/metadata inputs and 61 locally reachable commits; no remote fetch was performed. All 104 local documentation links, tracked/untracked whitespace checks and the recorded profile-equivalence flag pass.
- **Delivery**: complete locally and uncommitted on `codex/clean-layers`, alongside the preceding completed changes. No commit, push, PR, deployment, real-provider request or production-setting change was performed. No user confirmation is required for this local implementation.

---

### Turn 78: Review N+1 Patterns and Show Batching Options (21 October 2026)
- **User Prompt**:
  > *"Scan my code for N+1 query patterns and show me how to batch or eager-load them."*
- **Investigation and findings**: read project instructions/history and traced browser fetch callers, server dataset/provider access, local joins and generation loops. No SQL/ORM N+1 exists in this repository. The main remaining opportunity is bounded route/shape duplication: selected-trip geometry loads each leg, while tracked-bus loading independently requests the same resources for a leg. Geometry also waits for route data before requesting independent shapes. Trips currently have one or two legs; successful static loads can make `2L + 2` fetch calls across these consumers. Arrival polling already deduplicates stops and shares pending/fresh results through the Turn 77 repository. Server route building already joins eagerly loaded Maps; provider pagination is bounded and necessary, not a child lookup per row.
- **Artifacts and recommendations**: added `docs/n-plus-one-review.md` and linked it from `MODULARITY_REVIEW.md`. Included proposed pending-sharing loaders keyed by canonical service and route dataset generation, parallel selected-leg loading, success-cache/failure/cancellation requirements and progressive tracking behavior. Explained that a future arrivals batch endpoint could reduce browser requests while retaining one upstream request per distinct uncached stop with the current adapter; it is conditional on measurement. In-memory favorites scans are lower priority. Application code was not changed and no proposed batching endpoint/cache was installed.
- **Validation**: all 20 selected architecture and lookup/cache tests pass. A temporary fixture check invoked actual route/shape repositories for tracking Bus 72 plus geometry legs 72 and 45: current calls made six fetches, versus four with a temporary pending-sharing/parallel-loading prototype, with deeply equal parsed outputs. Local JSON/mocked fetch only; this is not a production/React timing or provider-origin count. Checked new review links and whitespace. No full suite, build, browser run, live provider request, production telemetry or secret-scan rerun was performed.
- **Delivery**: review/examples completed locally; documentation and preceding implementation remain uncommitted on `codex/clean-layers`. No commit, push, PR or deployment was performed. Proposed route/shape optimizations remain implementation work; no user confirmation is required to read or use this review.

---

### Turn 79: Share Route Assets and Parallelize Geometry Loads (21 October 2026)
- **User Prompt**:
  > *"go with your proposals"*
- **Implementation**: read project instructions/history and applied the Turn 78 route/shape recommendations while preserving earlier local changes. Both existing repositories now share pending requests and bounded LRU caches of validated successes (64 retained entries per route/shape store, pending work separate). Route keys include canonical service and requested dataset generation; shape keys use trimmed uppercase service. An internal shape result distinguishes validated empty geometry from transient/malformed failures. Failed/unknown routes and failed shapes remain retryable. The route-index cache now expires and retries failed/invalid indexes instead of retaining null indefinitely. Injectable request/clock dependencies support isolated checks.
- **Loading and configuration**: selected-leg geometry and tracking start independent route/shape requests together. Tracking publishes stops before optional shapes and keeps request-ID guards; journey results retain order, occurrence/direction references, active-effect guards and now include dataset generation in the effect key. One consumer cannot abort another's shared work. Added validated public `VITE_ROUTE_ASSETS_CACHE_SECONDS` (300 default, range 0–3600; zero shares pending requests only) and regenerated `.env.example` from the schema. Successful expiry starts at completion and is not extended by reads; clock rollback invalidates settled data. Cache memory clears on page reload and no persistence/manual invalidation UI was added. Parallel loading can fetch unused optional geometry on route failure.
- **Validation**: all 147 tests pass, including ten new route-asset regressions covering actual cross-consumer request reduction, canonical/version keys, success reuse, route/index failures and recovery, valid empty shapes versus invalid/HTTP/network responses, fixed expiry/clock rollback, bounded LRU/pending isolation and pending-only mode. After adding config assertions, all six config tests and TypeScript including unused-local checks pass again. The generated example still reproduces all defaults; zero/custom lifetime and the upper bound are checked. Production Vite build passes; CSS/React chunks remain unchanged and Leaflet remains lazy.
- **Browser evidence**: controlled production-build fixtures pass at 375 px and 1280 px. Selected-trip tracking/geometry requests each resource once. Independent shape/route requests both start before the held route responds; arrivals render while shapes are still held. Revisiting a service reuses settled assets, and delayed old routes cannot overwrite newer selection. Trip maps, swaps/clear, saved/location behavior and repeated map cleanup pass with no page exceptions or horizontal overflow. The actual repositories make four fetch calls for the controlled tracking-plus-two-distinct-leg pattern that needed six before, with equal shared results. These are local mocked/provider-fixture counts, not production/provider-origin measurements. Controlled five-endpoint, configured URL/header/timeout/cache, invalid-startup/build and browser secret-allowlist checks also pass using local fixtures. All 117 local documentation links resolve and new implementation/example/documentation lines pass whitespace checks. No new secret scan or real-provider/production telemetry request was run.
- **Documentation and delivery**: updated README, the N+1 review implementation follow-up and modularity review. The conditional arrivals batch endpoint and low-priority favorites projection index were not added: arrivals already share requests and no measured browser overhead justifies an endpoint. Implementation is complete locally and uncommitted on `codex/clean-layers`, alongside preceding work; HEAD remains `845f33e`. No commit, push, PR, deployment or production-setting change was performed. No user confirmation is required for the completed local work.

---

### Turn 80: Commit and Deploy the Completed Transit Refactor (21 October 2026)
- **User Prompt**:
  > *"commit and deploy"*
- **Scope**: read project instructions/history and prepared all completed local work from Turns 68–79 for release, including clean layers, arrival/artifact validation, occurrence-aware data/storage, lookup indexes, shared arrival requests and route/shape caching/parallel loading. Used the Vercel deployment workflow and the user's explicit commit/deploy authorization. Refreshed origin and confirmed local HEAD and `origin/main` both at `845f33e`, with no divergence. Verified the existing production project `nypbus-tracker` under `carbon-bc04`, linked to this GitHub repository and previously deployed from `main`. The connected Vercel app can access the intended project; no credentials or project settings were changed.
- **Pre-release validation**: all 147 tests, TypeScript including unused-local checks and the production Vite build pass again. The Turn 79 fixture/browser checks remain the end-to-end baseline. Fresh Gitleaks scan reports zero findings across 2,152 working-tree/build/metadata inputs and 61 locally reachable commits. Tracked changes pass Git whitespace checking; generated route data, virtualenv, dependencies, build output and environment secrets remain ignored.
- **Delivery**: committed all completed changes as `099d4a87981cb4df3ec2e886634f5bd15c952fc3` (`refactor: validate transit data and share route requests`) and pushed a fast-forward update to GitHub `main`. Explicitly created the production deployment from that exact Git commit in the existing Vercel project. Deployment `dpl_J2rGyJUjmyxa8L9BkhapkFwQVdrn` is READY with `nypbus-tracker.vercel.app` assigned and matching commit metadata. No project environment/credential setting was changed.
- **Live verification**: all five production endpoints return 200; health is `ok`, arrivals are real `LTA_DATAMALL_V3` and pass the shared runtime validator, Bus 72 has operator GAS, incidents report LTA data and weather reports NEA data. Missing-stop and unknown-service requests return JSON 400/404. Static route, network and shapes return 200 and pass the actual artifact parsers, including route/network generation consistency. The new network has 5,209 stops / 797 patterns. Weather initially lacked two datasets and returned all 12 on the follow-up. The production app asset matches the local release build and linked assets return 200.
- **Live browser verification**: both 375 px and 1280 px pass real arrivals, automatic trip selection, journey geometry, OneMap tiles, saving a bus, manual location persistence/reload, remembered bus search and repeated map cleanup. No page exceptions, duplicate map containers or horizontal overflow. The harness was updated for the versioned favorites envelope; no application changes were needed during release verification.
- **Final status**: application release is committed, pushed and verified live. This documentation-only follow-up records delivery results without changing application code. No confirmation or outstanding application release work is required.

---

### Turn 81: Enforce HTTPS and Audit Mixed Content/Cookies (21 October 2026)
- **User Prompt**:
  > *"Make sure my app enforces https everywhere, with HSTS, redirects, and secure cookies, and flag any mixed content."*
- **Audit**: read project instructions/history and traced deployment/Express responses, provider/browser URLs, configuration and cookie writes. The existing live release already returns HTTP 308 redirects preserving path/query and HTTPS HSTS (`max-age=63072000; includeSubDomains; preload`). No CSP is currently deployed. No app cookie setters or insecure browser resource URLs were found; the HTTP SVG namespace strings are identifiers, and API handler HTTP base strings parse incoming URLs rather than fetching resources. Live Chrome flows at 375 px and 1280 px reported zero mixed-content issues, zero HTTP/WS requests and zero first-party app cookies. No TLS-verification bypass exists in application code.
- **Implementation**: used Vercel routing/header guidance and primary Vercel/MDN references. Added explicit all-path HSTS (two years/includeSubDomains, no preload enrollment) and transport CSP to `vercel.json`, retaining immutable asset caching. Added production Express middleware before parsing/APIs/static delivery: 308 redirects use validated HTTPS `APP_ORIGIN`, preserve encoded paths/queries without reflecting untrusted Host, and apply headers only after secure transport. Forwarded protocol is trusted only for configured proxy peers (`TRUST_PROXY_CIDRS`, default loopback; `none` disables trust). Development retains HTTP/HMR without sticky HSTS or upgrading CSP. Regenerated `.env.example` from the schema.
- **URL/provider protection**: production/Vercel configuration rejects all HTTP provider/public origins including loopback, and every client build enforces HTTPS independently of custom mode/NODE_ENV. Development loopback fixtures remain permitted. Credentialed LTA/NEA requests, health probes and the Overpass builder reject redirects rather than forwarding credentials to another host/protocol; existing retry/fallback behavior remains. No certificate verification was disabled.
- **Cookies and mixed-content regression checks**: the app still sets no cookies. Added a shared Node/Vercel/Express-compatible secure-cookie helper with fixed Secure/HttpOnly/SameSite=Lax/Path=/, `__Host-` naming, no Domain, percent-encoded values, separate preserved Set-Cookie fields and validated optional lifetimes/deletion. Tests forbid application cookie-write bypasses. Added `npm run security:https` and a production-build check flagging browser HTTP/WS literals by location/scheme without printing URLs or values. Current scan: 121 files, zero findings; runtime/config safeguards supplement the best-effort literal scan.
- **Validation**: all 157 tests pass (147 previous plus ten transport/cookie/mixed-content regressions), including canonical redirects, trusted-versus-spoofed proxy protocol, secure/dev header behavior, Vercel/Express policy parity, production URL/build constraints, cookie flags/encoding/deletion/header preservation, source scanning and provider redirect options. After making cookie serialization portable, all ten transport tests and TypeScript with unused-local checks pass again. The default production Vite build passes with the same application/CSS/React assets and lazy map. An actual build with development NODE_ENV/custom mode still rejected an HTTP loopback public URL. Gitleaks reports zero findings across 2,157 working-tree/build/metadata inputs and 63 locally reachable commits; no remote fetch was performed this turn.
- **Browser/network evidence**: isolated production HTTPS proxy/provider fixtures pass at both 375 px and 1280 px: all five APIs, configured URLs/credentials/timeouts/cache/source, HTTPS headers, trip/map flows, persistence, route races and repeated map cleanup, without normal mixed-content/page exceptions/overflow. A deliberate insecure loopback fetch is blocked by CSP before network transmission; the fixture was corrected from an upgrade assumption to checking actual CSP blocking. A separate real HTTPS provider redirect to an HTTP trap produced one credentialed HTTPS request and zero plaintext requests, with Node certificate verification enabled using a temporary fixture CA. An isolated browser also verified the helper's Secure/HttpOnly/SameSite/host flags, inability to read the cookie in JavaScript, and deletion. Temporary certificates/cookies were fixture-only, not added to the app or production.
- **Documentation and delivery**: added `docs/https-security.md` and a README link with policy, proxy/cookie usage, findings and limits. This implementation is local and uncommitted on `main`; the live site remains the prior `631e51f` release with its existing HTTPS/HSTS behavior. No commit, push, deployment, production setting, real credential or HSTS enrollment was changed. New CSP/config/helper safeguards require a deployment to become live; no confirmation was required for the completed local work.

---

### Turn 82: Finish the HTTPS Hardening Task (21 October 2026)
- **User Prompt**:
  > *"continue last task"*
- **Actions and findings**: read project instructions/history and reviewed the final transport/cookie helpers, delivery guide, working-tree status and validation output. The Turn 81 HTTPS implementation and documentation are complete: explicit HSTS/CSP, trusted-proxy-aware production redirects, HTTPS-only production/build settings, provider redirect rejection, portable secure-cookie helper and browser-source mixed-content check. No additional application change was needed. Targeted implementation work does not require a separate analytical canvas.
- **Validation**: the saved full-suite output confirms 157 passing tests; Turn 81 also records the successful TypeScript/build, ten post-cookie-change transport tests, HTTPS fixture/browser/cookie checks, real redirect-trap test, live mixed-content audit and zero-finding secret scan. This continuation checked the current diff for whitespace and reviewed those results; it did not rerun application tests, browser flows, network requests or scans.
- **Delivery**: complete locally and uncommitted on `main`, with HEAD still `631e51f`. The live release already has HTTPS redirects/HSTS and had no observed mixed content or app cookies; the new CSP/config/provider/cookie-helper safeguards are not yet deployed. No commit, push, deployment or production-setting change was performed in this continuation. No unresolved implementation decision requires user confirmation.

---

### Turn 83: Commit and Deploy HTTPS Safeguards (21 October 2026)
- **User Prompt**:
  > *"commit and deploy"*
- **Scope**: read project instructions/history and prepared the completed Turn 81–82 HTTPS safeguards for release: explicit HSTS/CSP, trusted-proxy-aware standalone redirects, production/build HTTPS validation, provider redirect rejection, secure-cookie helper, source check and documentation. Used the existing Vercel deployment workflow. Refreshed origin and verified no divergence from GitHub `main`; confirmed the existing `nypbus-tracker` project under `carbon-bc04`, with the previous production release at `631e51f`. No credentials or environment settings were changed.
- **Pre-release validation**: all 157 tests, TypeScript including unused-local checks, the HTTPS source check (121 files/no findings), Git whitespace checks and the production Vite build pass again. Fresh Gitleaks scan reports zero findings across 2,157 working-tree/build/metadata inputs and 63 locally reachable commits after refreshing origin. Turn 81 retains the successful HTTPS fixture/browser/cookie/redirect-trap evidence; current production headers and full browser flows will be rechecked after release.
- **Delivery**: committed the HTTPS safeguards as `cb5e131acde381f68d72847add9c9c2a9ef19c64` (`security: enforce HTTPS and secure cookie defaults`) and pushed to GitHub `main`. Used the previous release's Git author identity for this commit because the current checkout had none configured; no global identity setting changed. Production deployment `dpl_6JVMnDbUZiUgatjiCtpWaJtSwGVL` is READY, with the live domain assigned and metadata matching that exact commit. No project credentials/environment or HSTS preload enrollment changed.
- **Live security verification**: HTTP requests return 308 to HTTPS, preserving encoded query/path. Pages, linked immutable assets, static artifacts, all five APIs and expected JSON 400/404 responses carry the configured HSTS and exact transport CSP, with no app Set-Cookie headers. Health is `ok`, arrivals are real `LTA_DATAMALL_V3` and pass runtime validation, route/network/shapes pass artifact validation and share the generated dataset version, and Bus 72 reports GAS. Weather initially lacked two datasets and returned all 12 on follow-up. The generated network contains 5,209 stops / 797 patterns.
- **Live browser verification**: at both 375 px and 1280 px, real arrivals, automatic trip selection, journey geometry/OneMap tiles, saved buses, location persistence/reload and repeated map cleanup pass. Chrome audits and page violation listeners report zero mixed-content issues, zero HTTP/WS requests, zero CSP violations and zero app cookies, with no page exceptions or horizontal overflow. No application fix was needed during release verification; the secure-cookie helper remains available for future cookie use rather than adding a cookie to the current app.
- **Final status**: security code is committed, pushed and verified live. This documentation-only follow-up records delivery results without changing application behavior. No confirmation or outstanding application release work remains.

---

### Turn 84: Validate Application Input Boundaries (21 October 2026)
- **User Prompt**:
  > *"Add schema validation to every input boundary so malformed requests are rejected before my logic runs."*
- **Implementation**: read project instructions/history and added pinned Zod 4.6.7 schemas through one shared entry point configured with `jitless: true` before schema construction. This preserves the deployed CSP without eval probes or policy relaxation; an architecture guard prevents bypass imports. Existing valid handwritten environment, transit-artifact, arrival and storage parsers remain in use rather than duplicating their contracts.
- **HTTP boundaries**: all five API handlers now apply the same schema gate before service/cache/provider logic. Only body-free GET/HEAD requests are accepted. Unsupported methods return 405 with Allow; malformed bodies/queries return 400, with no-store and bounded safe field diagnostics that omit supplied values and unknown field names. Rejects unknown/repeated/array/nested/conflicting parameters, raw/adapter query disagreements and oversized request targets. Canonical stop/service aliases, leading-zero stop codes, normalized services and blank optional arrival filters remain supported. Removed unused Express JSON parsing so malformed payloads are rejected before parsing/service work. Strict unknown-key rejection and the common error shape are intentional API contract changes.
- **Other boundaries**: validate LTA page envelopes and stop/route/service rows before indexing/joins; incidents before mapping; all twelve raw NEA dataset families and normalized weather/snapshot data before caching/UI use; OneMap rows before text/ranking operations; route indexes and Overpass fetched/saved inputs before generation/output. Provider responses must be JSON. Browser search, location candidates, recent-place writes and GPS/alarm coordinates now validate before state/calculation/request work. Invalid provider data remains unavailable/retryable or retains prior validated stale weather under existing fallback rules. Generic validation errors do not print received values. No generated public route/shape files or production settings were changed.
- **Validation**: all 176 tests pass (157 previous, 18 new boundary regressions and one CSP-safe import guard), including invalid requests rejected before provider calls, broken provider envelopes/rows and recovery, weather consistency, search/GPS/storage checks and the actual Overpass CLI rejecting malformed saved input before output. TypeScript including unused-local checks, the default production Vite client build, documentation links and whitespace checks pass. HTTPS source scan covers 127 files with zero findings. Fresh Gitleaks scans report zero findings across 2,169 working-tree/build/metadata inputs and 65 locally reachable commits; no remote fetch was performed. Dependency installation reported zero vulnerabilities. Ten actual public NEA payload families were fetched and accepted by their schemas; no real provider credentials were used.
- **HTTP/browser evidence**: isolated production-build HTTPS fixtures pass at 375 px and 1280 px, covering all five APIs, configured provider/cache/source behavior, valid HEAD/legacy aliases, malformed JSON method/body/query rejection without additional provider calls, trip/map flows, saved/location persistence, late GPS, route races and repeated map cleanup. Malformed browser weather/incident payloads recover through validation/fallback; invalid bus input makes no request. After configuring Zod without JIT, Chrome audits and policy listeners show zero normal CSP/mixed-content violations, insecure requests, app cookies, page exceptions or horizontal overflow. Deliberate insecure fixture fetches remain blocked before network transmission. Temporary fixture certificates are not app files; Node provider certificate verification remained enabled.
- **Tradeoff and delivery**: application JS is now 345.93 kB / 99.29 kB gzip versus the preceding 250.71 kB / 72.09 kB gzip; React/CSS stay separate and Leaflet stays lazy. These sizes do not establish phone latency. Added `docs/input-validation.md`, updated README and the arrival API contract. Complete locally and uncommitted on `main`, HEAD `b0d9598`; no commit, push, deployment or production setting change was performed. The root download/build command was not run; the client production build was. The live site remains the prior HTTPS release until separately released. No user confirmation is required for the completed local implementation.

---

### Turn 85: Commit and Deploy Input Validation (21 October 2026)
- **User Prompt**:
  > *"commit and deploy"*
- **Scope**: read project instructions/history and prepared the completed Turn 84 validation changes for the existing Vercel production project `nypbus-tracker` under `carbon-bc04`. Used the Vercel deployment skill and explicit release authorization. Refreshed origin and verified local HEAD and GitHub main both at `b0d9598`, with no divergence. No project credentials or environment settings changed.
- **Pre-release validation**: all 176 tests, TypeScript including unused-local checks, the default production Vite client build, Git whitespace checks and HTTPS source scan (127 files/no findings) pass again. Fresh Gitleaks scans report zero findings across 2,169 working-tree/build/metadata inputs and 65 locally reachable commits after refreshing origin. The initial sandbox test-runner invocation could not open its IPC socket; rerunning with the required local process/socket permissions passed. Turn 84 records the successful isolated HTTP/browser fixtures. Production delivery and live validation are pending below.
- **Release status**: preparing the commit/push and exact-commit production deployment; this entry does not yet assert delivery or live verification.
- **Release correction**: commit `b93f07103b5ffb3f0af8edacd7ef15251fbd72f3` was pushed and deployed, but live API checks caught function startup failures: new extensionless imports were resolved by local tooling but rejected by production Node ESM. Runtime logs confirmed ERR_MODULE_NOT_FOUND. Corrected relative imports throughout API/server/shared code to explicit `.ts` paths and added an architecture regression. All 177 tests, TypeScript, client build and direct native Node imports of all five handlers now pass. Vercel denied restoring the earlier verified deployment with a plan-limit 402 because Git integration had also built the same failing commit, making the known-good release older than the previous production deployment. No rollback or billing/settings change occurred; proceeding with the verified import correction. Git integration is active, so subsequent pushes will use its deployment instead of creating duplicate releases.
- **Live follow-up**: corrected deployment `dpl_DBypUXZVqZhg7BWbgZ2n8GxCGSvr` from `2fd0739073c7eeefd14cea0681596393f49daf38` is READY. All five live APIs return 200, actual arrival/route/network/shape/weather/incident validators pass, and malformed query/POST/duplicate/alias-conflict rejection and HEAD pass. Weather initially lacks two datasets. An additional parity check found the existing standalone `/api/BusArrival` path was not routed to a function on Vercel (it returned the SPA HTML); adding an explicit rewrite to the same validated arrival handler and a regression before final browser verification.
- **Verified delivery**: application commits `b93f071` (validation), `2fd0739` (explicit ESM imports) and `fe8a857197d51c890233398a7322bccd603e88b6` (legacy arrival routing) are pushed to GitHub main. Git-triggered production deployment `dpl_EMW4r2stWzFupRDRLoQm2rwQe9Z9` is READY, with the live domain assigned and metadata matching `fe8a857`. All 178 tests and TypeScript pass after both corrections. The client bundle remains identical to the Turn 84 build. Fresh secret scanning after the ESM correction reported zero findings across 2,169 inputs and 67 reachable commits; no later application secret/config changes were made.
- **Final live evidence**: the complete live verification passes against `fe8a857`: all five APIs return 200, health is ok, actual arrivals and provider/public snapshots pass runtime validators, and route/network/shapes parse with matching generation (5,209 stops / 797 patterns). All five endpoints reject three malformed/unknown/repeated/array query cases and malformed JSON POSTs with safe 400/405 diagnostics and no-store; HEAD succeeds without a response body. Duplicate stop/service aliases fail, while `/api/BusArrival` and lower-camel parameters return valid arrivals. HTTP 308 preserves path/query; HTTPS HSTS/CSP and immutable asset responses remain correct. Weather initially missed two datasets and returned all twelve on follow-up.
- **Final browser/observability evidence**: both 375 px and 1280 px pass real arrivals, automatic trip selection, geometry/OneMap tiles, saved buses, location persistence/reload and repeated map cleanup, with zero page errors, CSP/mixed-content issues, insecure requests, app cookies or horizontal overflow. The corrected ESM deployment has no ERR_MODULE_NOT_FOUND log matches. The final application deployment's nine error-level log records are all Node DEP0169 `url.parse()` deprecation warnings; they are not clean-error-log claims or application invocation failures. No monitoring/drain configuration was changed. This documentation-only follow-up records the verified release; no user confirmation remains necessary.

---

### Turn 86: Audit XSS Data Flows and Rendering (21 October 2026)
- **User Prompt**:
  > *"audit my app for XSS: where does user input reach the page unescaped, and how do i fix it?"*
- **Review**: read project instructions/history and traced saved location/place/search data, LTA route/network/arrival/incident fields, weather strings, configuration URLs and HTTP output through React and Leaflet rendering at release `e904c64`. Inspected the installed Leaflet string sinks and DOM title assignment, current validators/normalization and fixed SVG artwork; consulted primary OWASP and React guidance. No confirmed exploitable XSS path was found in the reviewed application flows. This is a targeted review/payload exercise, not an exhaustive proof or dependency vulnerability audit.
- **Findings and recommendations**: names/roads/messages in Leaflet strings are escaped, ordinary React text is encoded, and JSON responses are not embedded into HTML. Direct HTML interpolation remains for ETA/index numbers and stop IDs, currently constrained by validation/internal generation, plus fixed enum labels/colors/SVG shapes. The configured attribution image URL is interpolated without a dedicated attribute encoder but is build-controlled, normalized and protocol-validated; no attribute breakout was demonstrated. The only dangerouslySetInnerHTML uses fixed source-defined bus SVG, not external markup. Recommend DOM-created popup nodes with textContent and scoped button listeners first, attribute encoding after URL validation for attribution, and optional declarative SVG JSX. These are hardening proposals rather than reported current exploits; application rendering code was not changed.
- **Tests**: added six XSS regressions covering actual Header/nearest-stop output, saved/provider text, map text/quote encoding, route identifier constraints, arrival numeric/enum injection rejection, static SVG and script/data URL rejection. All 184 tests and TypeScript including unused-local checks pass; whitespace and new documentation links pass.
- **Browser evidence**: an isolated bundle of the actual Header/LiveBusMap components, all map layer hooks and current schemas was exercised at 375 px and 1280 px with hostile image/SVG event handlers and javascript-link text in structurally valid location, stop, destination and incident strings. All seven popup families, including both transfer boarding popups, render payloads as text. Final runs report zero injected elements, executed payloads or page errors; the stop-selection callback still works. CSP was absent in this fixture, so it did not mask an encoding defect. All resource requests were intercepted locally; no real provider or live production payload request occurred. Initial harness attempts required popup fade/hit-target handling and complete journey fixture fields; no application correction was needed.
- **Artifacts and delivery**: added `docs/xss-audit.md` with source locations, existing defenses, risk limits and an example DOM popup replacement; linked it from README. Tests/report/history are local and uncommitted on main, HEAD `e904c64`; no application behavior, settings, CSP, credentials, commit, push or deployment changed. No new production build, secret scan or live-header check was needed or claimed. Recommended rendering refactors remain optional follow-up work; no confirmation is required for this completed audit.

---

### Turn 87: Implement DOM-Based Map Rendering (21 October 2026)
- **User Prompts**:
  > *"go with your recommendation"*
  > *"Continue last action"*
- **Scope**: read project instructions/history and implemented the Turn 86 XSS hardening recommendations, retaining the prior local audit/report/tests. Continued the same implementation after the user's continuation prompt. No agent delegation, commit, push, deployment, production setting or credential change was performed.
- **Implementation**: replaced the removed `markerHtml.ts` string renderers with `dom.ts`, `markerElements.ts`, `popupElements.ts` and `svg.ts`. All seven popup families, bus/stop/user/incident/journey icons and ETA tooltips now give Leaflet DOM nodes; external text uses textContent/text-node insertion. Stop buttons use local listeners and explicit button type, eliminating generated IDs/global document lookup and popup-open listener registration. Repeated visits/reopened popups retain their own callbacks. Nonfinite/wrong-type ETA values display an em dash, enum lookups require own keys, and SVG dimensions are bounded. Existing valid presentation, classes, geometry, validation and data/cache behavior remain supported.
- **SVG and attribution**: shared fixed shape descriptors in `src/graphics/busArtwork.ts` feed normal React SVG children and namespace-created map SVG. Removed the React dangerouslySetInnerHTML and string SVG renderer. Applied the React best-practices guidance to the icon/integration: stable fixed artwork, no new data effects or global listeners, existing lazy Leaflet graph preserved and button/ARIA behavior retained. Leaflet's attribution string API remains an explicit exception: the OneMap logo URL is normalized/protocol-validated, then encoded for its quoted attribute; links/OSM credit remain fixed source markup. No sanitizer, pre-escaped persistence or CSP relaxation was introduced.
- **Tests and build**: all 188 tests and TypeScript including unused-local checks pass. Expanded the six audit regressions to ten, using pinned development-only LinkeDOM 0.18.14; actual DOM tests cover all popup/marker factories, duplicate/rebuilt stop buttons, hostile numeric/enum values, fixed artwork and quoted URL entities. Added a source guard against raw HTML APIs/literal popup strings and migrated the preceding journey/GPS/ETA regression to DOM nodes. The install audited 152 packages with zero vulnerabilities. The first full run correctly flagged the newly explicit SVG namespace constant as an HTTP literal; the scanner now narrowly exempts the exact SVG namespace in createElementNS's first argument, with tests retaining insecure-fetch/other-namespace detection. HTTPS scan passes across 132 files with no findings.
- **Browser evidence**: isolated actual Header/LiveBusMap component payload fixtures pass at 375 px and 1280 px with CSP absent: all seven popup families and transfer boarding popups preserve hostile text, with zero injected elements, executed payloads or page errors. Extra checks pass for wrong runtime numeric/enum props and duplicate-code stop occurrences/reopening. The harness required popup-scoped selectors to account for closing animations; no application correction was needed for that test adjustment. Production HTTPS fixtures also pass at both widths for all five APIs, invalid method/body/query gates, configured providers/headers/timeouts/cache, invalid startup/build configuration, trip selection/maps, swap/clear, route races, saved buses, late GPS, reload and map cleanup. Normal flows have no CSP/mixed-content issues, insecure requests, app cookies, page errors or horizontal overflow; deliberate insecure fetches remain blocked before transmission. All provider traffic/certificates in these checks are isolated fixtures, not real credentials or production requests.
- **Final validation and delivery**: restored and passed the default production Vite client build after the custom fixture build. Application JS is 345.82 kB / 99.20 kB gzip; lazy map is 170.21 kB / 50.25 kB gzip; CSS and React chunks remain unchanged. LinkeDOM is absent from browser assets. Gitleaks reports zero findings across 2,177 working-tree/build/metadata inputs and 69 locally reachable commits, with no remote fetch. Tracked/new-file whitespace and documentation references pass; no generated public route/shape files changed. Updated README and `docs/xss-audit.md` with the implemented boundaries, retained attribution exception, test dependency and results. Complete locally and uncommitted on main, HEAD `e904c64`; no user confirmation is required. These safeguards require a future commit/deployment to become live; the root route-download build was not run locally.

---

### Turn 88: Commit and Deploy DOM Rendering Hardening (21 October 2026)
- **User Prompt**:
  > *"Commit and deploy"*
- **Scope**: read project instructions/history and prepared the completed Turn 86–87 audit and DOM rendering changes for the existing Vercel production project `nypbus-tracker` under `carbon-bc04`. Used the Vercel deployment skill and explicit commit/deploy authorization. Refreshed origin and confirmed local HEAD and GitHub main both at `e904c64`, with no divergence. The existing Git integration will create the production deployment; no duplicate manual deployment or environment/credential change is planned.
- **Pre-release validation**: all 188 tests, TypeScript including unused-local checks, the default production Vite client build, HTTPS source scan (132 files/no findings) and Git whitespace checks pass again. Fresh Gitleaks scans after refreshing origin report zero findings across 2,177 working-tree/build/metadata inputs and 69 locally reachable commits. No generated public route/shape files changed locally; the root route-download build was not run locally. Turn 87 retains the successful actual-component payload checks without CSP and isolated production HTTPS browser/API evidence.
- **Release status**: preparing the commit/push. Production build, exact-commit/domain readiness, live API/browser checks and final delivery are pending below; this entry does not yet assert a successful release.
- **Delivery**: committed the audit/tests and DOM rendering hardening as `1025ec110c6283af522864616552b1b8db12ce4b` (`security: render map content with safe DOM nodes`) and pushed to GitHub main. Reused the prior repository author identity for this scoped commit without changing global Git settings. Git-triggered deployment `dpl_4onwsmpfsABa4cZ8bCAgii4vfbPS` is READY, with the live domain assigned and matching exact commit metadata. Its Vercel build took about 31 seconds. No duplicate manual deployment, credential, environment or CSP change occurred.
- **Live API/security verification**: all five endpoints return 200; health is ok, arrivals are actual LTA_DATAMALL_V3 and pass runtime validation, and route/network/shapes, weather and incident snapshots pass their current parsers. Generated data contains 5,209 stops / 797 patterns with matching generation. All endpoints reject malformed/unknown/repeated/array queries and unsupported malformed-JSON POSTs with safe diagnostics/no-store; HEAD, lower-camel aliases and the legacy arrival URL work. HTTP 308 preserves path/query; HSTS/CSP and immutable asset behavior remain correct. The live application asset matches the tested DOM release. Weather initially missed two datasets and returned all twelve without stale values on follow-up.
- **Live browser/observability verification**: 375 px and 1280 px both pass actual arrivals, automatic trip selection, journey geometry/OneMap tiles, the real DOM boarding popup, saved buses, location persistence/reload and repeated map cleanup. No page errors, CSP/mixed-content issues, insecure requests, app cookies or horizontal overflow were observed. Runtime error/fatal inspection returned nine records, all Node DEP0169 url.parse deprecation warnings, rather than application invocation errors. The project has no configured external drains; monitoring/drain settings were not changed and continuous error monitoring is not asserted. Turn 87 retains the isolated hostile-payload checks; no hostile payload was sent to production during this release.
- **Final status**: application hardening is committed, pushed and verified live. This documentation-only follow-up records delivery and updates the audit guide; no additional application correction or user confirmation remains necessary.

---

### Turn 89: Check Cookie-Authenticated CSRF Surface (21 October 2026)
- **User Prompt**:
  > *"Check my CSRF protection on cookie-authenticated routes and fix any gaps."*
- **Findings**: read project instructions/history and traced every API/server registration, request gate, cookie helper, browser persistence, provider header construction and installed authentication dependencies. The repository has zero cookie-authenticated routes, no login/logout/session middleware, and no server user-data write endpoint. All five APIs and the arrivals alias are public data reads gated to body-free GET/HEAD. Saved buses/places/location/search are browser localStorage state. The secure-cookie utility has no application callers. No exploitable cookie-authenticated CSRF gap was found; provider cache refresh/budget activity does not represent an authenticated account mutation. Consulted primary OWASP CSRF guidance.
- **Changes**: clarified in the cookie helper and HTTPS/cookie guide that HttpOnly/SameSite flags are not a complete CSRF design. Added `docs/csrf-protection.md` and a README link explaining the actual current scope and requirements before future cookie-session writes: framework/session-bound CSRF checks, exact trusted-origin verification, fail-closed handling of missing/untrusted metadata, Fetch Metadata defense in depth, and safe GET/HEAD semantics including login/logout design. No unused token middleware, session state, cookie, new endpoint, restrictive public-read Origin policy, dependency or runtime behavior was introduced.
- **Validation**: added five regressions in `tests/csrf-surface.test.ts`. An isolated Express listener using actual handlers rejects 35 cookie-bearing cross-origin/sibling-site/opaque-origin form-shaped POST or PUT/PATCH/DELETE/OPTIONS requests with 405/Allow/no-store and zero provider calls; URL-encoded/text/plain/multipart shapes are covered. Separate checks cover method/action override rejection, unchanged public GET/HEAD gate behavior, the five-file route inventory, and configured synthetic provider credentials without visitor Cookie/Authorization/Origin forwarding. These are explicit-header server-side probes, not real authenticated sessions or a browser SameSite delivery test. All 193 tests, TypeScript including unused-local checks, whitespace and new document references pass.
- **Delivery**: complete locally and uncommitted on main, HEAD `65d48f2`. Only tests/documentation and explanatory helper comments changed; current read-only protections remain intact. No commit, push, deployment, production cookie/settings change, real provider/live attack request, new production build, browser flow, secret scan or monitoring change was performed or claimed. A real session/CSRF token lifecycle cannot be exercised until authentication exists. No user confirmation is required for this completed check; future authentication integration must include its own protection and end-to-end tests.

---

### Turn 90: Configure an Exact-Origin API CORS Allowlist (21 October 2026)
- **User Prompt**:
  > *"Configure CORS for my API and frontend origins without opening it up to everyone."*
- **Scope and configuration**: read project instructions/history and traced current frontend/API URLs, shared request gates, serverless/Express responses, cookie/CSRF scope and CDN cache behavior using primary MDN/Vercel references. The current frontend/API share the canonical APP_ORIGIN, whose default is `https://nypbus-tracker.vercel.app`. Added validated server-only `CORS_ALLOWED_ORIGINS` for up to 20 additional exact frontend origins, with APP_ORIGIN always trusted. Blank leaves only the canonical origin. Normalizes root slash/host casing/default ports and deduplicates; rejects wildcards, null, paths, credentials, query/fragment markers, internal whitespace and empty entries. Explicit HTTP loopback entries work only in development; production/Vercel/build validation requires HTTPS. Regenerated `.env.example` from the schema without reading local secrets. No automatic preview/sibling/domain-suffix trust or client-side allowlist injection was introduced.
- **Implementation**: added `server/http/cors.ts` to the common request boundary and passed each handler's validated security settings, including injected health settings. Exact approved origins receive a single Access-Control-Allow-Origin; untrusted/noncanonical Origin-bearing requests return generic 403, malformed header representations 400, and no-Origin public clients remain usable. Credentialed CORS reads remain disabled by omitting Allow-Credentials. Approved body-free read preflights return empty 204 for GET/HEAD and only Accept/Content-Type/Cache-Control/Pragma request headers, without query/service/provider work. Write methods, Authorization/API-key/custom headers, wildcard lists and private-network grants are denied. Ordinary OPTIONS stays 405. Existing schema/method/body validation and successful data cache lifetimes remain in place; allowed clients can read validation/method errors.
- **Caching**: all normal API variants, including no-Origin responses, vary on Origin while preserving existing Vary tokens. Preflights also vary on requested method/header names. Preflights/denials use no-store and browser preflight permission lasts at most 300 seconds. No wildcard CORS header was added to vercel.json. CORS is browser sharing policy, not authentication or a replacement for future cookie-session CSRF protection; non-browser clients can omit/forge Origin. Production CDN variants have not been tested because this change is not deployed.
- **Tests and browser evidence**: all 200 tests and TypeScript including unused-local checks pass, with seven new CORS regressions covering configuration/exact matching, safe defaults, Vary merging, errors/preflights and all real handlers rejecting before provider calls. Updated the earlier CSRF probes to distinguish untrusted-origin 403 from allowed-origin method 405; no-origin/approved reads still do not treat cookies as authorization. A separate actual HTTPS browser fixture with API, approved and denied frontend origins verifies allowed reads and OPTIONS-then-GET, readable 400 errors, denied-origin reads/preflights with no provider calls, blocked Authorization/JSON-write preflights, simple write 405, blocked credentialed reads and recovery when returning to the approved origin.
- **Full-flow validation**: isolated production HTTPS fixtures pass at 375 px and 1280 px for all five APIs plus the legacy alias, including approved preflights/denied origins before provider requests, configured providers/headers/timeouts/cache, invalid startup/build settings, trip/map flows, swap/clear, route races, saved/location state, late GPS, reload and repeated map cleanup. Normal flows have no page exceptions/overflow/CSP or mixed-content issues/insecure requests/app cookies; deliberate insecure fetches remain blocked before network. The CORS allowlist sentinel is absent from browser assets. All providers/credentials/certificates in these checks are fixtures; Node TLS verification was not disabled, and only the isolated browser accepted its temporary certificates.
- **Final checks and delivery**: restored and passed the default production Vite client build; browser asset hashes/sizes are unchanged. HTTPS source scan passes across 132 files with zero findings. Gitleaks initially flagged one long synthetic credential literal from the earlier CSRF test; replaced it with clearly nonsecret short test labels without weakening scanner rules. All 12 affected CORS/CSRF tests pass again; repeat working-tree/history scans report zero findings across 2,182 inputs and 71 locally reachable commits, with no remote fetch. Documentation references and tracked/new-file whitespace pass; no generated public artifacts changed. Added `docs/cors.md`, updated README, API/input/CSRF guides and retained the prior uncommitted CSRF work. Complete locally and uncommitted on main, HEAD `65d48f2`; no production environment, real credentials, commit, push, deployment or monitoring change occurred. No user confirmation is required for the completed local configuration; additional frontend origins can be explicitly listed and released later.

---

### Turn 91: Commit and Deploy the CORS Policy (21 October 2026)
- **User Prompt**:
  > *"Commit and deploy"*
- **Scope**: read project instructions/history and prepared the completed Turn 89–90 CSRF review/tests/documentation and exact-origin CORS policy for the existing Vercel production project `nypbus-tracker` under `carbon-bc04`. Used the Vercel deployment skill. Refreshed origin and confirmed no divergence from GitHub main at `65d48f2`. The existing Git integration will build the pushed commit; no duplicate manual deployment, credentials, environment settings or monitoring changes are planned.
- **Pre-release validation**: all 200 tests, TypeScript including unused-local checks, the default Vite client production build, HTTPS scan (132 files/no findings) and whitespace checks pass again. The initial restricted test run could not bind its isolated local API listener; the complete rerun with socket permission passed. Fresh Gitleaks scans after refreshing origin report zero findings across 2,182 inputs and 71 locally reachable commits, with no embedded remote credentials and a complete checkout. Browser assets remain unchanged; no generated public route/shape files changed or root provider-download build was run locally. Turn 90 retains the isolated HTTPS CORS/browser and full-flow fixture evidence.
- **Release status**: preparing commit/push; exact-commit production readiness and live CORS/API/browser verification are pending. This entry does not yet assert deployment success.
- **Delivery**: application commit `5a83319d2894fe4bb9dee2a622d309c67d16cda9` (`security: restrict API CORS to configured origins`) is pushed to GitHub main. Git-triggered deployment `dpl_2LDG5ZZLXj8FycDq4YDdseHgskur` is READY with the live domain assigned and exact matching SHA; the build took about 27 seconds. Reused the existing repository author's scoped identity without changing global Git configuration. No duplicate manual deployment, environment or credential change occurred.
- **Live CORS/cache evidence**: all 58 explicit HTTP checks pass across the five APIs and legacy alias: exact live-origin grants, no-Origin public reads without grants, generic unapproved/null/lookalike/preview-origin 403, approved read preflight 204 with the fixed method/header set, rejected write/Authorization preflights, readable allowed-origin 400 and no Allow-Credentials. Origin/preflight Vary and denial/preflight no-store are present. Alternating approved/no-Origin/denied requests preserves distinct grants, including CDN HITs on repeated data reads; health remains MISS/no-store. Chrome on an intercepted unapproved frontend origin cannot read the live health response. These checks verify this deployment and request location, not all possible external proxies.
- **Live API/browser evidence**: all five APIs return 200, health is ok, actual LTA arrivals pass runtime validation, route/network/shapes share their generated dataset (5,209 stops / 797 patterns), and incident/weather responses validate; initial weather has two missing datasets. Existing safe malformed-query/method rejection, HEAD, lower-camel and legacy aliases, HTTPS redirects preserving queries, HSTS/CSP and immutable assets pass. At 375 px and 1280 px, real arrivals, trip selection, journey geometry/OneMap tiles, DOM boarding popup, saved buses, location persistence/reload and repeated map cleanup pass with no page errors, CSP/mixed-content issues, insecure requests, app cookies or horizontal overflow. No hostile text payload was sent to production.
- **Observability and final status**: the initial one-hour log query exceeded the plan's retained window; a successful 30-minute deployment-specific query returned ten error-level records, all Node DEP0169 url.parse deprecation warnings rather than invocation failures. No external drains are configured and no monitoring setting changed; continuous error monitoring is not asserted. Application changes are committed, pushed and verified live. This documentation-only follow-up records actual release results and updates the guides; no application correction or user confirmation remains necessary.

---

### Turn 92: Add DNS-Aware SSRF Protection (22 October 2026)
- **User Prompts**:
  > *"I fetch user-supplied URLs. Add an SSRF guard that blocks private IPs and unsafe schemes, re-checked when the address resolves."*
  > *"Continue where last left off"*
- **Scope and findings**: read project instructions/history and traced outbound calls. The current API schemas accept stop/service identifiers, not arbitrary visitor URLs. Existing server fetches use configured LTA/NEA destinations; the route downloader shares the LTA client, and the offline shape builder fetches configured Overpass URLs. Added one shared server-only guarded fetch for these paths and future URL inputs without introducing a URL proxy endpoint. Browser-only map/place/static requests remain browser requests. Consulted primary OWASP, Node, Undici, ipaddr.js and Microsoft platform-address references; no agent delegation was used.
- **Implementation**: `security/ssrf.ts` accepts absolute HTTP/HTTPS URLs, canonicalizes literal addresses and rejects credentials, fragments, controls/whitespace/backslashes, malformed/local hostnames and oversized URLs. Allows ordinary public IPv4 and IPv6 global unicast only; rejects private/loopback/link-local/metadata, CGNAT, reserved/documentation/benchmark/multicast ranges, mapped/transition IPv6 forms and Azure's platform virtual IP. The actual socket lookup validates every returned A/AAAA address and fails closed on mixed unsafe answers or failed/empty/malformed lookup results. Only validated addresses enter the socket callback; every new connection repeats this check without a second unguarded DNS lookup. Existing connections retain their checked peer. Literal addresses are checked before fetch because they bypass DNS.
- **Transport integration**: arrivals, incidents, LTA pagination, weather, health probes and Overpass use the shared default transport. It fixes its own direct dispatcher, rejects Host/proxy/upgrade overrides, forces redirect error behavior and rejects returned 3xx responses. Caller dispatcher/follow/manual options cannot weaken it; TLS certificate/hostname verification remains enabled. Errors omit received URLs, DNS/IP values, credentials and native causes. Existing service fallback/retry/cache logic and explicit provider-header construction remain. Private provider destinations are refused in development too; configuration parsing's localhost allowance does not bypass the outbound guard. There is no environment disable switch. Existing mock transport/resolver injection is a trusted in-process test seam rather than request data.
- **Dependencies and corrections**: pinned ipaddr.js 2.5.0 and maintained Undici 7.30.1; package installation/audit reports zero vulnerabilities. Real socket/native redirect tests exposed incompatibility between initially tried Undici 8 and Node 24's built-in Undici 7 fetch; corrected to the maintained matching major and stopped the stalled fixture process. Updated a health mock to read normalized Headers through its standard API. An initial strip-only native import probe rejected the pre-existing TypeScript parameter property in config validation; all five handlers subsequently import successfully using native Node ESM with TypeScript transformation. Production still uses its existing TypeScript build path; no unrelated config-source change was needed.
- **Validation**: all 210 tests pass (200 previous plus nine SSRF regressions and one outbound-architecture guard). Coverage includes numeric-IP encodings and IPv4/IPv6 boundaries, public callback outputs, changed DNS answers, mixed-family private answers, native socket lookup refusing a resolved loopback address with zero trap sockets/requests, forced dispatcher/redirect policy, native redirect refusal, safe errors and every provider/health default refusing literal private settings before fetch. TypeScript including unused-local checks, default Vite production client build, HTTPS scan (132 files/zero findings), documentation references and tracked/new-file whitespace pass. Client asset hashes/sizes are unchanged; no generated public artifacts changed and the provider-download root build was not run locally.
- **External verification and limits**: configured LTA/NEA and all three Overpass hosts pass the guarded public DNS lookup. One real credential-free NEA HTTPS request passes its current response schema with normal TLS verification; a real public HTTP-to-HTTPS redirect is refused. These are bounded external checks, not a new production deployment or exhaustive network audit. Fresh Gitleaks scans report zero findings across 2,185 working-tree/build/metadata inputs and 73 locally reachable commits; no remote fetch occurred. No real credential, live attack payload, firewall, Vercel environment or monitoring setting changed. Custom infrastructure routes/proxies/NAT still require network egress policy; a public destination also needs appropriate response validation and must not receive forwarded visitor/provider credentials.
- **Delivery**: added `docs/ssrf-protection.md`, README and HTTPS-guide updates. Complete locally and uncommitted on main, HEAD `6cb7f50`; no commit, push or deployment performed. The live site remains the verified CORS release. No user confirmation is required for this completed local implementation.

---

### Turn 93: Commit and Deploy the SSRF Guard (22 October 2026)
- **User Prompt**:
  > *"Commit and deploy"*
- **Scope**: read project instructions/history and prepared Turn 92's guarded outbound transport, pinned dependencies, regression tests and guides for the existing `nypbus-tracker` Vercel production project under `carbon-bc04`. Used the Vercel deployment skill. Refreshed origin and confirmed no divergence from GitHub main at `6cb7f50`. The existing Git integration will deploy the pushed commit; no duplicate manual release, credential/environment or monitoring change is planned.
- **Pre-release checks**: all 210 tests, TypeScript including unused-local checks, the default Vite client production build, HTTPS scan (132 files/zero findings) and whitespace checks pass again. Client asset hashes remain unchanged and no generated public route/shape files changed; the root provider-download build was not run locally. Fresh Gitleaks scans after refreshing origin report zero findings across 2,185 inputs and 73 locally reachable commits, with a complete checkout and no embedded remote credentials. Turn 92 retains real socket-trap, native redirect and credential-free public HTTPS/provider DNS evidence.
- **Release status**: preparing commit/push; exact-commit deployment, generated provider artifacts and live API/browser verification remain pending. No successful production delivery is asserted yet.
- **Delivery**: application commit `ecb4daaff53beb11ddaeb1f625540570b33f7d64` (`security: guard outbound URLs and resolved addresses`) is pushed to GitHub main. Git-triggered production deployment `dpl_DYf3m2rtUSS3bcSvWF5DrAnxsteC` is READY, matches the exact commit and owns the live domain; build-to-ready took about 29 seconds. Reused the repository author's scoped identity without changing global Git configuration. The build's guarded LTA downloader generated 601 services and a network with 5,209 stops / 797 directions; no route fallback/download failure was logged. No duplicate manual deployment or credential/environment change occurred.
- **Live API/security verification**: all five APIs return 200, health is ok and real LTA_DATAMALL_V3 arrivals pass runtime validation. Route, network, shapes, incidents and weather pass their parsers with matching route/network generation. Initial weather lacked seven datasets; follow-up lacks windSpeed/outlook4d with no stale values. Safe malformed-query/unsupported-method rejection, HEAD, lower-camel and legacy arrival aliases, HTTP 308 preserving path/query, HSTS/CSP and immutable assets pass. All 58 CORS checks pass, including exact grants, denied origins/write/Authorization preflights, read preflight 204, distinct cached grants and a real Chrome denial from an unapproved frontend origin. Private/DNS-rebinding/redirect attack cases remain controlled local fixtures; no URL proxy or live private-network probe was introduced.
- **Live browser/observability evidence**: both 375 px and 1280 px pass real arrivals, automatic trip selection, journey map/OneMap tiles, the DOM boarding popup, saved buses, location persistence/reload and repeated map cleanup. No page exceptions, horizontal overflow, CSP/mixed-content issues, insecure requests or app cookies were observed. Deployment-specific error/fatal logs over 30 minutes return thirteen records, all existing Node DEP0169 url.parse deprecation warnings, rather than application invocation failures. The project has no external drains; no monitoring/drain setting changed and continuous error monitoring is not asserted.
- **Final status**: the SSRF implementation is committed, pushed and verified live. This documentation-only follow-up records delivery results and updates the SSRF guide; no application correction or user confirmation remains necessary. The earlier local socket-trap evidence establishes blocked destinations without contacting real private services.

---

### Turn 94: Review Password Hashing and Authentication Storage (22 October 2026)
- **User Prompt**:
  > *"Am I hashing passwords correctly (algorithm, salt, work factor)? Review my auth storage."*
- **Review and conclusion**: read project instructions/history and inspected the current server/API registrations, request gates, dependencies/lockfile, configuration/public build boundary, browser storage adapters and cookie utility at HEAD `fb885be`. No login/signup/logout/session implementation, user-account database/schema, password ingestion/storage/verification or password-hashing library/call exists in this repository. Algorithm, salt generation and work-factor settings are therefore not applicable; no password-hashing defect was identified in the reviewed scope, and this does not certify an external identity service or database that is not represented here. No authentication feature or speculative password helper was added.
- **Actual storage**: browser localStorage contains validated saved bus records, recent places, the last searched bus and saved/GPS location, stored as readable JSON/text. No password/session-token storage was found. Persisted location/place data is a privacy consideration on shared browsers or with same-origin script access. LTA/data.gov.sg API credentials come from server environment configuration and are excluded from the explicit public build branch; these are usable upstream credentials, not user password verifiers, and one-way hashing them would prevent provider authentication. The secure-cookie utility remains unused by application flows; its flags alone do not establish a session or password store. No local credential values or production secret settings were read or changed.
- **Future guidance**: checked the current primary OWASP Password Storage Cheat Sheet. If password accounts are later introduced, use a maintained Argon2id implementation with independently generated random salts per password and its encoded hash format (algorithm/version/parameters/salt/hash). OWASP's current minimum is 19 MiB memory, two iterations and parallelism one; benchmark and raise cost within the deployment's latency/memory/concurrency budget, and rehash successfully verified older hashes when policy changes. This is future guidance, not an implemented or benchmarked project setting. Never use plain SHA/MD5, reversible encryption or browser storage as a password verifier.
- **Validation and delivery**: all 19 existing configuration, secret/redaction and CSRF route-surface regressions pass, including provider credential/header isolation and absence of cookie-based user identity on public reads. Source/dependency/storage searches and whitespace checks complete. No new application tests, production build, full-suite rerun, historical secret scan, live request, auth benchmark or deployment was performed or claimed. This concise review is delivered in chat; only this local, uncommitted history entry changed. No code/configuration fix, commit/push or user confirmation is required for the current account-free app.

---

### Turn 95: Review Credential Verification and Session/Token Issuance (22 October 2026)
- **User Prompt**:
  > *"Review my authentication: am I verifying credentials and issuing sessions or tokens securely?"*
- **Scope and findings**: read project instructions/history and re-traced current Express/serverless routes, shared request/CORS gates, upstream credential headers, cookie helper, storage/dependencies and signing/verification/session API references at HEAD `fb885be`. The application has no visitor credential verification, login/signup/logout, session creation/storage/rotation/revocation, JWT/OIDC issuance/verification or authenticated-user middleware. Its five transit/weather/health APIs and legacy arrivals alias are public reads. No authentication implementation exists here whose correctness, expiry/revocation or fixation resistance can be certified; this review does not assess a separate external identity service.
- **Boundaries**: the CORS allowlist controls browser response sharing and is not visitor authentication. Approved/no-Origin reads do not require identity, Cookie or Authorization. Provider LTA/data.gov.sg keys authenticate server requests to upstream providers only; explicit constructed headers do not forward visitor cookies/authorization. Browser persistence holds preferences/place/location data, without session tokens. `setSecureCookie` has Secure/HttpOnly/SameSite and host-only defaults but no application caller, token generator, session record or validation lifecycle. If private/account-specific routes are intended later, server-side identity/authorization must be added before exposing them; the current code supplies none.
- **Guidance**: consulted primary OWASP authentication/session-management guidance. Future account support should use a maintained authentication/session implementation, safe credential verification and throttling, session renewal after login/privilege changes, server-enforced idle/absolute expiry and logout revocation, secure cookie delivery and CSRF protection for cookie-authenticated writes. This is conditional design guidance, not an implemented feature, selected vendor or a claim that the current public API must require login. No speculative authentication middleware or token endpoint was added.
- **Validation and delivery**: inspected source and existing route/header-isolation regression assertions; the immediately preceding Turn 94 ran all 19 relevant config/security/CSRF tests successfully on the same unchanged application code. Tests were not rerun for this static-only review. Whitespace checks pass. No code/configuration change, new test, build, live login/probe, production identity-setting inspection, secret read, commit/push or deployment occurred. Preserved Turn 94's uncommitted history entry and appended this review locally. No confirmation is required for the completed review.

---

### Turn 96: Locate the Login for Brute-Force Lockout (22 October 2026)
- **User Prompt**:
  > *"Add brute-force lockout to my login with sensible thresholds and a cooldown."*
- **Findings and clarification**: read project instructions/history, checked the working tree and rechecked routes/source/dependencies. No login, credential verifier, user identity or session/account store has been added; only the existing public transit APIs are present. Asked explicitly whether login lives in another repository/authentication service or whether account sign-in should be introduced here. This missing integration target is required to implement effective protection; the question remains pending. Did not invent a login, attach account lockout to public bus reads or add an unused counter that would imply protection without enforcement.
- **Preparatory policy**: consulted primary OWASP login-throttling/account-lockout guidance. Proposed starting settings, subject to the actual authentication flow: five failed attempts per account in 15 minutes, followed by a fixed 15-minute cooldown, complemented by per-IP throttling, generic account-safe responses and atomic shared persistent counters across Vercel instances. These numeric thresholds are a proposed application policy, not an OWASP-mandated value or enabled configuration. Actual integration must address unknown-account parity, concurrent attempts, successful-login reset and cooldown expiry; blocked retries should not indefinitely extend account lockout.
- **Validation and status**: source/route/configuration inspection and whitespace checks only. No application code, dependency, environment, database, login/provider setting, test, build, live attack request, commit/push or deployment changed. Preserved prior uncommitted history entries. Lockout is not implemented or tested; awaiting the login location or the user's decision to add account sign-in before dependent work can proceed.

---

### Turn 97: Put Login Lockout Work on Hold (22 October 2026)
- **User Prompt**:
  > *"Can put it on hold first as I have no login now"*
- **Decision**: the user confirmed there is currently no login and explicitly deferred brute-force lockout. Turn 96's clarification is resolved by this deferral; no login implementation or lockout work should continue unless the user resumes it. Retain the proposed policy as future guidance only.
- **Actions and validation**: read the current project history/status and appended this decision while preserving earlier uncommitted entries. Whitespace check passes; no application tests or build were run because only the history changed.
- **Delivery**: login lockout is on hold and remains unimplemented. Only COMMENTS.md is modified locally; no application/configuration change, commit, push, deployment or scheduled follow-up was performed.

---

### Turn 98: Bound Outbound Calls and Image Loads (22 October 2026)
- **User Prompt**:
  > *"Find every outbound call in my code without a timeout and add sensible ones."*
- **Inventory**: read project instructions/history and traced direct/delegated browser/server fetches, provider build scripts, Leaflet images, the external stylesheet and workflow network calls. Existing arrivals (5 s), generic/static/weather/incident (10 s), network (20 s), cold route (30 s), browser OneMap/direct NEA (8 s), server LTA (8 s/pages 15 s), NEA (6 s), health (5 s) and Overpass (330 s within its rebuild deadline) already supplied finite signals. GPS operations already have timeout options; ongoing GPS watches and wake-lock requests are browser capabilities rather than outbound HTTP calls. Login lockout remains on hold.
- **Fixed shared transport gaps**: `safeFetch` previously omitted its default deadline for native Request inputs (whose inert signal always exists) or ordinary caller cancellation signals. It now combines a deadline with those signals through body consumption and preserves earlier cancellation/shorter provider budgets. Added validated server-only OUTBOUND_TIMEOUT_MS (30 s) and OUTBOUND_CONNECT_TIMEOUT_MS (10 s) to central config; a validated finite per-call timeoutMs allows deliberate long operations. Overpass explicitly passes the smaller of its configured request budget and remaining overall deadline so the new 30-second default does not truncate its 300-second query allowance. Request-specific timeout metadata is not forwarded to native fetch; SSRF/direct-dispatch/redirect/TLS controls remain intact.
- **Other outbound gaps**: added 15-second VITE_MAP_IMAGE_TIMEOUT_MS for a focused Leaflet tile layer and OneMap attribution-logo image handlers, with success/error cleanup, one-time failed completion, local blank-image replacement on timeout and cancellation on tile/map removal. Attribution text remains available and ordinary image requests keep browser image behavior without new CORS requirements. Bundled Leaflet CSS from the installed package with the lazy map, removing the unbounded external unpkg stylesheet request. The refresh workflow deploy-hook POST now has 10-second connection and 30-second total limits without automatic POST retries. Regenerated the complete .env.example; no dependency added or production setting changed.
- **Tests**: all 216 tests pass (210 existing plus six timeout regressions). Coverage includes Request and plain-signal defaults, user cancellation, explicit long/invalid budgets, an actual native HTTP response whose headers arrive but body stalls (timeout rejects body read and closes the fixture connection), image success/error/timeout/removal cleanup, config/default/CI budget guards and source scanning of direct fetch/request boundaries. The source guard recognizes current literal/delegated call syntax rather than claiming arbitrary-alias static analysis. TypeScript including unused-local checks, HTTPS scan (134 files/zero findings), default production Vite client build, generated environment checks, new-file whitespace and documentation references pass. No provider-download root build or generated public artifact change occurred.
- **Browser evidence**: an isolated bundle of the actual map hook/new tile layer was exercised against a local image server at 375 px and 1280 px with a one-second test override. Stalled images were replaced and 10/16 respective connections closed; a direct tile completion reported timeout, normal tile/logo loading recovered, lazy/local Leaflet styling worked, and repeated mount/removal passed with zero page errors/overflow. The initial fixture's layer-event observation missed completion; corrected it to observe cancellation and the tile's actual completion callback. No application fix was needed after the initial implementation. This is a controlled map/component exercise, not a new full live-app verification or a claim about every browser's image cancellation internals.
- **Final validation and delivery**: fresh Gitleaks scans report zero findings across 2,190 working-tree/build/metadata inputs and 75 locally reachable commits, with a complete checkout and no embedded remote credentials; no remote fetch occurred. Browser build now includes a lazy map stylesheet (15.09 kB / 6.36 kB gzip) and the map JS is 171.73 kB / 50.75 kB gzip; no phone-latency claim is made. Added docs/outbound-timeouts.md and updated README/SSRF timeout guidance. Preserved the prior uncommitted history entries. Complete locally and uncommitted on main, HEAD fb885be; no commit, push, deployment, real credential, production environment or monitoring change occurred. No user confirmation is required for this implementation.

---

### Turn 99: Commit and Deploy Outbound Timeouts (22 October 2026)
- **User Prompt**:
  > *"commit and deploy"*
- **Scope**: read project instructions/history and prepared the completed Turn 98 timeout implementation and retained Turn 94–97 review/deferral history for the existing Vercel production project nypbus-tracker. Used the Vercel deployment skill; fetched origin and confirmed main has no divergence at fb885be. Login lockout remains on hold. The Git integration will deploy the pushed commit without a duplicate manual deployment.
- **Pre-release validation**: all 216 tests, TypeScript including unused-local checks, HTTPS scan (134 files/zero findings), default Vite client production build and whitespace checks pass again. Fresh Gitleaks scans after fetching origin report zero findings across 2,190 inputs and 75 locally reachable commits; complete checkout, no embedded remote credentials. Regenerated .env.example from defaults only. No generated public artifacts changed and no provider-download root build was run locally. Turn 98 retains controlled stalled-response/image timeout browser evidence.
- **Delivery status**: preparing the application commit and push; exact-commit production readiness and live API/CORS/phone/desktop verification remain pending. No production environment, credential or monitoring setting changed.
- **Application delivery**: commit e785c6580eeefa370eee5d9f96bca2877e91797b (`fix: enforce outbound request and map image timeouts`) is pushed to GitHub main. Git-triggered production deployment dpl_ATe5jnjnJRgXHuHeeHjVAAqs8GJM is READY with the exact SHA and live nypbus-tracker.vercel.app alias, about 29 seconds of build time. Scoped the existing repository author identity to the commit; no global Git setting changed. The guarded production downloader generated 601 services / 5,209 stops / 797 directions.
- **Live verification**: all five APIs plus the legacy arrivals alias pass, health is ok and real LTA arrivals validate. Static route/network/shapes match their generated dataset. HTTPS redirects preserve path/query; HSTS/CSP, immutable assets, malformed-query/method rejection, HEAD and aliases pass. Weather initially had seven missing datasets and returned zero missing on follow-up. All 58 CORS checks pass, including exact grants, denied origins/preflights, allowed readable errors and distinct CDN variants; a real browser blocks an unapproved origin.
- **Browser evidence**: normal production flows pass at 375 px and 1280 px for real arrivals, trip selection, journey geometry/boarding popup, OneMap tiles and attribution logo, saving buses, location persistence/reload and repeated map cleanup. The lazy Leaflet stylesheet is served locally with immutable caching and applies correctly; no unpkg request occurs. Screenshots inspected. No page exceptions, horizontal overflow, CSP/mixed-content issues, insecure requests or app cookies were observed. Timeout failure cases remain the controlled local fixtures from Turn 98; no hostile/private-network probe was sent to production.
- **Observability and final status**: the deployment-specific 30-minute error/fatal log query returned 14 records, all existing Node DEP0169 url.parse deprecation warnings, with no other returned failures. No external drains are configured; continuous monitoring is not asserted. No environment, credential, firewall or monitoring setting changed. Application changes are committed, pushed and verified live. This documentation-only follow-up records results and updates timeout/SSRF guides; its automatic Git deployment will receive a final readiness/API/asset smoke check. No application correction or user confirmation is required; login lockout remains on hold.


---

### Turn 100: Prepare Cloud Chat Handoff (22 October 2026)
- **User Prompt**:
  > *"I want to move this project into a cloud environment. Write me a handoff note when I open the new cloud environment chat."*
- **Actions**: read project instructions/current history, README, runtime/configuration and deployment files, architecture/data-model guides and Git status. Created CLOUD_HANDOFF.md as a self-contained paste-ready note covering repository/release identifiers, cloud Node 24 setup, secrets/configuration, generated-data build behavior, architecture/security boundaries, login-lockout deferral, verification and nonportable local fixtures. Treats the request as cloud development setup; production remains on the existing Vercel project unless a later hosting migration is requested.
- **Prior release clarification**: the preceding turn's documentation deployment f662c341a022e22735eac0472402648027e439dd / dpl_AxjJeKbQ6Fc9aXrFpn37MfX1C3tp reached READY with the live alias. Its final API/asset/CORS smoke passed; weather had two missing datasets, and the log query returned eight existing DEP0169 warnings only. These are prior-turn results, not fresh live checks in this documentation turn.
- **Validation and delivery**: checked handoff commands against package scripts, referenced project paths and tracked/new-file whitespace. No application tests, build, secret scan, live checks or cloud setup were run for this documentation-only change. Handoff and this history entry are local/uncommitted; no commit, push, deployment, credential transfer or infrastructure provisioning occurred. The note must be pasted/transferred to the new cloud chat unless separately committed later. No user confirmation is required to write the handoff.


---

### Turn 101: Retry Safe Reads with Bounded Backoff (23 October 2026)
- **User Prompt**:
  > *"Add retry-with-backoff to my flaky external calls, but only where it's safe to retry."*
- **Scope and policy**: read project instructions/history and inventoried provider/browser/build/CI calls. Added an explicit shared GET/HEAD retry helper with exponential equal jitter, attempt/wait caps, Retry-After seconds/HTTP dates (including GMT legacy forms), failed-body cancellation and one unchanged caller deadline through attempts/waits/body reading. Mutations/body-bearing requests make one attempt. Selected transient statuses (408/429/500/502/503/504) and recognized server socket failures can retry; bad credentials, permanent statuses, SSRF/DNS/TLS refusals, expired/cancelled operations and malformed/invalid successful responses do not. Browser TypeError cannot distinguish network/CORS/TLS failures, so an opaque read failure can receive one default retry without bypassing browser security.
- **Integration**: live server LTA arrivals/incidents default to two total attempts within the existing eight-second budget; LTA pages retain three attempts with a shared total 15-second page deadline instead of restarting it per attempt. Browser OneMap and static route/index/network/shape reads retry within their existing budgets and retain coalescing/success caches. Browser API polling/cold route fallback gain no nested retry. NEA remains on its existing reserved request-window budget and delayed partial-data refresh; health/images/deploy-hook POST gain no retry loop. Extracted the existing read-only Overpass POST owner to server/overpassClient.ts; it keeps mirror/round/overall limits, adds jitter and per-origin Retry-After cooldowns, and disables permanently failing endpoints. No generic retryable-POST switch or global fetch retry was introduced.
- **Configuration and documentation**: added validated server/public retry settings and LTA page wait cap, regenerated .env.example and documented changed page/backoff semantics. Added docs/outbound-retries.md with decisions/limitations and primary HTTP/Fetch/Overpass references; updated README, timeout guide and the existing local cloud handoff. Preserved Turn 100's uncommitted handoff/history. No dependency, real credential, generated public artifact or production setting changed; no provider-download root build or actual deploy-hook invocation ran.
- **Validation**: all 231 tests pass (216 existing plus 15 retry regressions), TypeScript including unused-local checks, HTTPS scan (135 files/zero findings), default production Vite client build and documentation/new-file whitespace checks pass. Initial existing shape-cache fixture counts assumed single attempts; updated the fixture to exhaust both transient attempts while retaining failure-cache/recovery assertions. Corrected a deterministic Retry-After fixture to use its injected clock and handled legacy HTTP asctime dates as GMT. Final checks pass after those corrections. Chrome fixtures at 375/1280 px bundle the actual adapters against controlled local endpoints: one 503 recovers in exactly two wire requests for search/network/routes/shapes; concurrent network consumers coalesce; cancelled searches, long Retry-After and browser arrival-API failures make one request, with zero page errors. This is adapter verification, not a new full production UI run.
- **Security scan and delivery**: Gitleaks reports zero working-tree/history findings across 2,195 inputs and 77 locally reachable commits; complete checkout, no embedded remote credentials and no remote fetch this turn. No live application/provider request, commit, push, deployment, cloud migration or monitoring change occurred. Complete locally and uncommitted on main at f662c34; production remains the previously verified release. Login lockout remains on hold. No user confirmation is required for these local changes.


---

### Turn 102: Commit and Deploy Safe Read Retries (23 October 2026)
- **User Prompt**:
  > *"Commit and deploy"*
- **Scope**: read project instructions/history and prepared Turn 101's retry implementation/configuration/tests/guides plus Turn 100's cloud handoff for the existing nypbus-tracker Vercel production project under carbon-bc04. Used the Vercel deployment skill. Fetched origin and confirmed no divergence from main at f662c34. The existing Git integration will deploy the push; no duplicate manual deployment or cloud hosting migration is planned. Login lockout remains on hold.
- **Pre-release validation**: all 231 tests, TypeScript including unused-local checks, HTTPS scan (135 files/zero findings), default Vite production client build and changed-line/new-file whitespace pass. Fresh Gitleaks scans after refreshing origin report zero findings across 2,195 inputs and 77 locally reachable commits, with a complete checkout and no embedded remote credentials. Turn 101 retains the controlled retry/browser fixture evidence. No generated public artifacts changed or local provider-download root build ran. No production environment, credential, firewall or monitoring setting changed.
- **Delivery status**: preparing the application commit/push; exact-commit production readiness and live API/CORS/phone/desktop verification are pending. The handoff now points to this release entry rather than promising that an earlier local file was already present remotely.
- **Application delivery**: application commit b050a890ca05df235db34be8a50873cc0d4e020b (`fix: retry safe external reads with bounded backoff`) is pushed to GitHub main. Git-triggered production deployment dpl_FVWY1QwaCxPP89mtFDGPk9SNCWnb is READY, matches the exact SHA and owns the live domain; build-to-ready took about 39 seconds. Used the existing repository author's scoped identity without changing global Git configuration. Production's guarded downloader generated 601 services / 5,209 stops / 797 directions with no logged route fallback/download failure. The cloud handoff is now committed remotely alongside the implementation.
- **Live verification**: all five APIs plus the legacy arrivals alias pass, health is ok and actual LTA arrivals validate. Route/network/shapes share their generated dataset. HTTP redirects preserve path/query; HSTS/CSP, immutable assets, malformed-query/method rejection, HEAD and aliases pass. All 58 CORS policy/cache checks and the real-browser unapproved-origin denial pass. Weather initially missed seven datasets and returned zero missing on follow-up. No fault injection, arbitrary URL/private-network probe or actual deploy-hook test was sent to production; controlled retry failure evidence remains Turn 101.
- **Browser and observability evidence**: normal live flows pass at 375 px and 1280 px for arrivals, automatic trip selection, journey geometry/boarding popup, OneMap tiles/logo, local lazy CSS, saved buses, location persistence/reload and repeated map cleanup. Screenshots inspected; no page errors, horizontal overflow, CSP/mixed-content issues, insecure requests, unpkg requests or app cookies were observed. The deployment-specific 30-minute error/fatal query returned thirteen records, all existing Node DEP0169 url.parse warnings and no other returned failures. No external drains are configured; continuous monitoring is not asserted.
- **Final status**: application changes and the cloud handoff are committed, pushed and verified live. This documentation-only follow-up updates release results and the handoff baseline; its Git-triggered deployment will receive a final readiness/API/asset check. No application correction, credential/environment/firewall/monitoring change, cloud migration or user confirmation is required. Login lockout remains on hold.


---

### Turn 103: Protect Repeated Provider Calls with Circuit Breakers (23 October 2026)
- **User Prompt**:
  > *"Find the outbound calls that need a circuit breaker and implement one with sensible thresholds."*
- **Selection and policy**: read project instructions/history and inspected provider/browser/build calls, retries, caches and polling. Added breakers for live LTA arrivals/incidents, each LTA dataset collection, each of twelve NEA datasets and the browser OneMap search client. Defaults are three counted failed operations within 60 seconds, 30 seconds open and one recovery operation; a validated success resets failures. Retry attempts count as one operation, and recovery probes disable retries. LTA collection probes serialize pagination and validate all rows before closing. Static CDN reads/images, direct browser NEA fallback, diagnostic health probes, bounded offline Overpass jobs and the deploy-hook POST retain their existing policies without a duplicate breaker.
- **Implementation details**: shared state machine has synchronous probe admission, bounded failure history, generation tokens preventing late requests from closing a newer circuit, cancellation/deadline handling and clock-rollback recovery. Invalid JSON/content types/schemas and transient HTTP/socket failures/timeouts count; ordinary client/authentication errors, security refusals and user cancellations do not. Open calls retain explicit simulated/unavailable/stale/local-stop fallbacks. NEA filters open/busy datasets before reserving quota, allowing other datasets to fill. Row parsing now occurs inside collection recovery before indexing. Error diagnostics emit fixed redacted kinds, without provider messages/causes or credentials; repeated skipped live calls do not log an error per poll.
- **Configuration and limits**: added validated LTA_CIRCUIT_*, NEA_CIRCUIT_* and public VITE_ONEMAP_CIRCUIT_* fields through config/circuit.ts and regenerated .env.example. State belongs to each warm service/client instance; Vercel cold starts/functions/regions and browser clients do not share counters. No distributed store, new dependency/credential, reset endpoint, rate-limit replacement or monitoring service was added. Existing in-flight work is not forcibly cancelled. Added docs/circuit-breakers.md and updated README, retry guidance and cloud handoff; consulted primary Microsoft circuit-breaker guidance. Login lockout remains on hold.
- **Validation**: all 249 tests pass (231 existing plus 18 circuit regressions), TypeScript including unused-local checks, default production Vite client build, HTTPS scan (136 files/zero findings), documentation links and tracked/new-file whitespace pass. Tests cover failure windows/resets, fail-fast/single probes, failed/cancelled recovery, late completion races, clock rollback, timeout/security classification, validated bodies/rows, retry counting, independent owners, speculative end pages, NEA stale data/quota and redaction. Updated one existing exact-error-name assertion for the new typed validation error while preserving its fixed message/no-cause checks. Controlled Chrome fixtures at 375/1280 px bundle actual OneMap/search/local-network code and verify exactly fourteen requests per scenario, open-state suppression, single held probe, local-stop fallback, malformed JSON reopening and real browser timeouts tripping, with zero page errors. No full live UI run or provider outage injection occurred.
- **Scan and delivery**: Gitleaks reports zero working-tree/history findings across 2,199 inputs and 79 locally reachable commits; complete checkout, no embedded remote credentials and no remote fetch this turn. No generated public artifacts changed or provider-download root build ran locally. Complete locally and uncommitted on main at 708b050; no commit, push, deployment, cloud migration, production setting or monitoring change occurred. No user confirmation is required for the implementation.
- **Prior release clarification**: Turn 102's documentation deployment 708b05094f3bda5ef57a72058cc810f25da4a51a / dpl_8tqpGiTV3TKMogq4pHmERbdBbH7K reached READY with the live alias and passed final API/asset/CORS smoke checks. Weather then had two missing datasets and six returned log records were existing DEP0169 warnings only. These are the preceding turn's results; no new live verification was performed in this circuit-breaker turn.


---

### Turn 104: Commit and Deploy Circuit Breakers (23 October 2026)
- **User Prompt**:
  > *"Commit and deploy"*
- **Scope**: read project instructions/history and prepared Turn 103's circuit breakers, validated settings, tests and documentation for the existing nypbus-tracker Vercel production project under carbon-bc04. Used the Vercel deployment skill; refreshed origin and confirmed no divergence from main at 708b050. The Git integration will deploy the pushed commit, without a duplicate manual deployment. The cloud handoff is included; no cloud hosting migration or login/lockout work is part of this release.
- **Pre-release validation**: all 249 tests, TypeScript including unused-local checks, HTTPS scan (136 files/zero findings), default Vite client production build and changed-line/new-file whitespace pass again. Fresh Gitleaks scans after fetching origin report zero findings across 2,199 inputs and 79 locally reachable commits, with a complete checkout and no embedded remote credentials. Turn 103 retains controlled breaker/Chrome failure and recovery evidence. No generated public artifacts changed or local provider-download root build ran. No real credential, production environment, firewall or monitoring setting changed.
- **Delivery status**: preparing the application commit and push; exact-commit production readiness and live API/CORS/phone/desktop verification remain pending. In-memory breakers retain their documented per-instance scope; no fleet-wide protection is asserted.
- **Application delivery**: application commit 63c82b3497b3e8feadbfe089149d7dc76e633afd (`fix: circuit-break repeated provider failures`) is pushed to GitHub main. Git-triggered production deployment dpl_3ZNTssFxH2jUQUhBWC9MWpVfm95S is READY at the exact SHA with the live domain assigned; build-to-ready took about 39 seconds. Used the existing repository author's scoped identity without changing global Git configuration. Production's guarded downloader generated 601 services / 5,209 stops / 797 directions with no logged route fallback/download failure. No duplicate manual deployment occurred.
- **Live API/security evidence**: all five APIs plus the legacy arrivals alias pass, health is ok and real LTA arrivals validate. Route/network/shapes match their generated dataset. HTTP redirects preserve path/query; HSTS/CSP, immutable assets, malformed-query/method rejection, HEAD and aliases pass. All 58 CORS policy/cache checks and actual browser denial from an unapproved origin pass. Weather initially missed seven datasets and returned zero missing on follow-up. Controlled circuit-opening/recovery evidence remains Turn 103; no intentional upstream outage, arbitrary URL/private-network probe or deploy-hook invocation was sent to production.
- **Browser/observability evidence**: normal live flows pass at 375 px/1280 px for arrivals, trip selection, journey geometry/boarding popup, OneMap tiles/logo/local lazy CSS, saved buses, location persistence/reload and repeated map cleanup. Screenshots inspected; no page exceptions, horizontal overflow, CSP/mixed-content issues, insecure requests, unpkg requests or app cookies were observed. The deployment-specific 30-minute warning/error/fatal query returned eleven records, all existing Node DEP0169 url.parse warnings and no other returned failures. No external drains are configured; continuous monitoring is not asserted.
- **Final status**: circuit breakers are committed, pushed and verified live with their documented per-warm-instance scope. This documentation-only follow-up records results and updates the cloud handoff baseline; its Git-triggered deployment will receive a final readiness/API/asset smoke check. No application correction, credential/environment/firewall/monitoring change, cloud migration or user confirmation is required. Login lockout remains on hold.


---

### Turn 105: Review Error Handling and Information Exposure (23 October 2026)
- **User Prompt**:
  > *"Review my error handling: where am I swallowing errors or leaking internal details to users?"*
- **Scope**: read project instructions/history and traced provider services, API error responses, redacted logging, browser repositories/hooks, persistence, weather/incident UI and alarm capabilities. Review only: no application behavior, dependency, configuration or production setting changed. Existing explicit simulated-arrival, approximate-route, address-search and network-unavailable states are useful fallbacks; best-effort cleanup failures do not need user-facing errors.
- **Findings**: (1) useWeatherSnapshot retains the old snapshot after both API/direct fallback fail, but NEAWeatherWidget/WeatherStrip hide the error whenever weather already exists and retain the snapshot's original stale flags. Existing reading timestamps remain visible in the detailed widget. (2) Incident client drops fetchedAt and returns null on failure; useRouteIncidents retains old items indefinitely or starts with an indistinguishable empty list, with no feed availability/age state. (3) Favorites persistence catches write failures and returns void while the hook updates its saved state; location/recent-place persistence has the same unreported session-only fallback. (4) Alarm audio resume and wake-lock acquisition failures are ignored while the alarm remains enabled, despite introductory text promising beeps and that the screen stays on; AudioContext construction also lacks a catch. (5) safeError intentionally strips raw errors, but also collapses typed HTTP 401/429/503 failures to request_failed in incident/weather logs, discarding safe diagnostic status. Recommend typed unavailable/stale/persistence/capability outcomes, visible neutral degradation notices and allowlisted log status/stage codes without raw messages, bodies, stacks or credentials.
- **Exposure assessment**: no raw credential or stack-trace disclosure was found in the reviewed user-response paths. Public health responses do expose nonsecret deployment/configuration diagnostics (runtime mode/platform, uptime, key-presence booleans, provider endpoints/budget); missing-key route/incident responses name the setting. This is limited information disclosure, not a leaked key. Recommend a minimal public health/status payload and keeping detailed configuration diagnostics in restricted operational access/logs.
- **Validation**: all 27 focused existing security, health, clean-layer/persistence and alarm tests pass. A temporary Chrome fixture bundles the actual hooks/components against controlled loopback endpoints: two weather API requests, two incident requests and one direct-forecast request reproduce retained weather with hidden refresh error/empty stale flags, retained incidents without availability, a favorite displayed as saved after a denied write while persisted items remain empty, and enabled alarm state after both mocked audio and wake-lock rejections; zero browser page exceptions. A logger probe confirms typed 401/429/503 errors produce identical request_failed records. Corrected temporary fixture React resolution/runtime and UTF-8 serving before the successful run; these were harness issues, with no application edits. AudioContext-constructor handling is a source-review finding, not a separate runtime probe.
- **Delivery status**: this history entry is local/uncommitted; recommendations are not implemented, committed, pushed or deployed. No fresh full-suite run, production/provider request, secret/history scan, cloud migration or monitoring change occurred. No confirmation is needed for this review; login lockout remains on hold.
- **Prior release clarification**: Turn 104's documentation commit 2b3a8a501870b380557dafdce2c6b2d633541a03 / deployment dpl_MkkecBTYXx6YzgjcSoi6aBKXLmru reached READY at the exact SHA with the live alias. Its final API/asset/CORS smoke passed; weather had two missing datasets, and eight returned log records were existing DEP0169 warnings only. These are prior-turn results, not live checks performed in this review.


---

### Turn 106: Commit and Deploy Error-Handling Review Notes (23 October 2026)
- **User Prompt**:
  > *"commit and deploy"*
- **Scope**: read project instructions/history and inspected the pending diff. Only COMMENTS.md changed in Turn 105; this release commits and publishes the review history, not the recommended application fixes. Used Vercel deployment guidance for the existing nypbus-tracker production project under carbon-bc04. Refreshed origin and confirmed main is synchronized at 2b3a8a5. No production setting or credential change, duplicate manual deployment, cloud migration or login-lockout work is included.
- **Validation and delivery status**: pending documentation passes git diff --check. Turn 105's 27 focused tests and controlled browser probes are prior-turn evidence, not rerun results. No new application tests/build or secret/history scan is necessary for this documentation-only diff. Preparing the commit/push; exact-commit Vercel readiness, live API/asset/CORS smoke and deployment log inspection remain pending. The review findings remain outstanding and unimplemented.
