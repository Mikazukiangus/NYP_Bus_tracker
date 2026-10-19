# BusTrackerSG - Project Instructions, Comments & History

> **Repository:** [https://github.com/Mikazukiangus/NYP_Bus_tracker](https://github.com/Mikazukiangus/NYP_Bus_tracker)  
> **Live Vercel Deployment:** [https://nypbus-tracker.vercel.app](https://nypbus-tracker.vercel.app)  
> **Brand:** BusTrackerSG – a member of NYP Bus

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
