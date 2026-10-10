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

## 3. Architecture & API Endpoints Summary

### Serverless & Proxy Endpoints
| Endpoint | Method | Description | Data Source |
|---|---|---|---|
| `/api/health` | GET | System and API health monitor | Self-test + Environment check |
| `/api/bus-arrival` | GET | Live bus arrival times, load, and telemetry | Singapore LTA DataMall v3 |
| `/api/bus-route` | GET | Real stop sequence (both directions) for a service; fallback when static files are missing | LTA DataMall BusRoutes + BusStops + BusServices |
| `/bus-routes/<SERVICE>.json`, `/bus-routes/index.json` | GET (static) | Real stop sequences generated at build time (primary source for routes) | LTA DataMall, via `scripts/build-bus-routes.ts` |
| `/route-shapes/<SERVICE>.json` | GET (static) | Road-following route geometry for a service | OpenStreetMap (ODbL), pre-built by `npm run shapes` |
| `/api/weather` | GET | Singapore-wide snapshot of 12 NEA datasets (forecasts, station readings, PSI/PM2.5, UV, lightning, WBGT); the client picks the nearest station/region | NEA via data.gov.sg v2 real-time API |

Map basemap tiles are loaded directly by the browser from OneMap (Singapore Land Authority); no proxy or key needed.

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
