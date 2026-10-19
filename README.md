# BusTrackerSG

Live Singapore bus arrivals, live bus positions on a map, trip planning and NEA weather, built around Nanyang Polytechnic.

Live site: https://nypbus-tracker.vercel.app

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

   `.env` is ignored by git, so the key stays on your machine. Two settings are optional:
   - `DATA_GOV_SG_API_KEY`: a data.gov.sg key for the weather. Without one the weather still works, but its first load takes a few seconds longer.
   - `PORT`: the local port, 3000 by default.

## Run it

```bash
npm run dev
```

Then open http://localhost:3000. `server.ts` serves the app with Vite (it reloads as you edit) and the same `/api/*` functions Vercel runs. To check your key, open http://localhost:3000/api/health: `ltaAccountKeyConfigured` should be `true`, and `status` is `"ok"` once LTA DataMall and NEA both answer (`"degraded"` means one didn't, for example because the key was refused).

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the tests in `tests/` |
| `npm run lint` | Type-checks the project (`tsc --noEmit`) |
| `npm run routes` | Downloads LTA's bus routes and stops into `public/bus-routes/` (needs the key) |
| `npm run build` | Runs `npm run routes`, then builds the site into `dist/` |
| `npx vite build` | Builds the site only, keeping the route files you already have |
| `npm run shapes` | Rebuilds the road-following route lines in `public/route-shapes/` from OpenStreetMap |

`npm run build` empties `public/bus-routes/` before downloading, so without a key, or if LTA DataMall is down, it leaves none. The app still works (it asks `/api/bus-route` instead), just more slowly. To see the production build locally, run `npm run build`, then:

```bash
NODE_ENV=production npm start
```

## Deploying

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

To check a change, run `npx vite build` before and after it: the file names that stay the same are the ones browsers will keep.
