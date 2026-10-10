// Builds every LTA bus route into public/bus-routes/<SERVICE>.json (+ index.json, stops.json) at build time.
//
// Runs before `vite build` on every Vercel deploy (LTA_ACCOUNT_KEY is available there), so the app can
// load routes instantly from the CDN instead of waiting ~10 s for /api/bus-route to page through
// LTA DataMall on a cold start. Without a key, or if LTA is down, it skips and the app falls back to the API.
import 'dotenv/config';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildRoute, loadDatasets } from '../api/bus-route.ts';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/bus-routes');

async function main() {
  // Always start clean so a skipped run can't ship stale files from an earlier local build
  await rm(OUT_DIR, { recursive: true, force: true });

  const accountKey = process.env.LTA_ACCOUNT_KEY?.trim();
  if (!accountKey) {
    console.warn('[bus-routes] LTA_ACCOUNT_KEY not set; skipping. The app will use /api/bus-route instead.');
    return;
  }

  let data;
  try {
    data = await loadDatasets(accountKey);
  } catch (err) {
    console.warn('[bus-routes] Could not load LTA DataMall data; skipping. The app will use /api/bus-route.', err);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const services: string[] = [];
  let totalBytes = 0;

  for (const serviceNo of data.routes.keys()) {
    // Service numbers become file names, so only accept plain alphanumerics
    if (!/^[0-9A-Z]{1,6}$/.test(serviceNo)) continue;
    const route = buildRoute(serviceNo, data);
    if (!route) continue;
    const body = JSON.stringify({ ...route, generatedAt });
    totalBytes += body.length;
    await writeFile(path.join(OUT_DIR, `${serviceNo}.json`), body);
    services.push(serviceNo);
  }

  services.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify({ generatedAt, services }));

  // Stop code -> name, so the "all buses at this stop" board can show where each bus is heading
  const stopNames = Object.fromEntries([...data.stops].map(([code, stop]) => [code, stop.Description]));
  await writeFile(path.join(OUT_DIR, 'stops.json'), JSON.stringify({ generatedAt, stops: stopNames }));
  console.log(
    `[bus-routes] Wrote ${services.length} services (${(totalBytes / 1024 / 1024).toFixed(1)} MB) to ${path.relative(process.cwd(), OUT_DIR)}`
  );
}

main().catch((err) => {
  // Never fail the deploy over this; the API fallback still works
  console.warn('[bus-routes] Unexpected error; skipping.', err);
});
