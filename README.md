# BusTrackerSG

Live Singapore bus arrivals, live bus positions on a map, trip planning and NEA weather, built around Nanyang Polytechnic.

Live site: https://nypbus-tracker.vercel.app

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
