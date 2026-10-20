// Builds every LTA bus route into public/bus-routes/<SERVICE>.json (+ index.json, network.json) at build time.
//
// Runs before `vite build` on every Vercel deploy (LTA_ACCOUNT_KEY is available there), so the app can
// load routes instantly from the CDN instead of waiting ~10 s for /api/bus-route to page through
// LTA DataMall on a cold start. Without a key, or if LTA is down, it skips and the app falls back to the API.
import { config } from '../config/server.ts';
import { logger } from '../security/logger.ts';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildRoute } from '../server/lta/buildRoute.ts';
import { buildNetwork } from '../server/lta/buildNetwork.ts';
import { createDatasetStore } from '../server/lta/datasets.ts';

const { loadDatasets } = createDatasetStore(config.lta);

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/bus-routes');

async function main() {
  // Always start clean so a skipped run can't ship stale files from an earlier local build
  await rm(OUT_DIR, { recursive: true, force: true });

  const accountKey = config.lta.accountKey;
  if (!accountKey) {
    console.warn('[bus-routes] LTA_ACCOUNT_KEY not set; skipping. The app will use /api/bus-route instead.');
    return;
  }

  let data;
  try {
    data = await loadDatasets(accountKey);
  } catch (err) {
    logger.warn('build.routes_unavailable_using_api_fallback', { error: err });
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

  // Every stop and service direction in one compact file: stop names for the "all buses at this stop" board,
  // plus nearest bus stops, stop search and trip planning in the browser
  const network = buildNetwork(data, generatedAt);
  const networkBody = JSON.stringify(network);
  await writeFile(path.join(OUT_DIR, 'network.json'), networkBody);
  console.log(
    `[bus-routes] Wrote ${services.length} services (${(totalBytes / 1024 / 1024).toFixed(1)} MB) and network.json ` +
      `(${network.stops.length} stops, ${network.patterns.length} service directions, ${(networkBody.length / 1024).toFixed(0)} KB) ` +
      `to ${path.relative(process.cwd(), OUT_DIR)}`
  );
}

main().catch((err) => {
  // Never fail the deploy over this; the API fallback still works
  logger.warn('build.routes_failed_using_api_fallback', { error: err });
});
