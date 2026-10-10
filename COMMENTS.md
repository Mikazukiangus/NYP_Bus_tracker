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
- **National Environment Agency (NEA) 2-Hour Weather Integration**: Live weather forecast and rain probability for the commuter's local region (e.g., Ang Mo Kio for NYP).
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

## 3. Architecture & API Endpoints Summary

### Serverless & Proxy Endpoints
| Endpoint | Method | Description | Data Source |
|---|---|---|---|
| `/api/health` | GET | System and API health monitor | Self-test + Environment check |
| `/api/bus-arrival` | GET | Live bus arrival times, load, and telemetry | Singapore LTA DataMall v3 |
| `/api/weather` | GET | Live 2-hour regional weather forecast | Singapore NEA Open Data v2 |

### Query Parameters for `/api/bus-arrival`
- `BusStopCode` (Required): 5-digit bus stop code (e.g. `83139`, `55189`, `09037`).
- `ServiceNo` (Optional): Specific service number (e.g. `15`, `72`, `14`).

---

## 4. Environment Variables Reference

| Variable | Description | Required Location |
|---|---|---|
| `LTA_ACCOUNT_KEY` | Land Transport Authority DataMall API Key | Vercel Project Environment Variables |
| `PORT` | Local server port (Default: 3000) | Development environment |
