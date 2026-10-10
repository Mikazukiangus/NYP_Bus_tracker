// Builds every LTA bus route into public/bus-routes/<SERVICE>.json (+ index.json, network.json) at build time.
//
// Runs before `vite build` on every Vercel deploy (LTA_ACCOUNT_KEY is available there), so the app can
// load routes instantly from the CDN instead of waiting ~10 s for /api/bus-route to page through
// LTA DataMall on a cold start. Without a key, or if LTA is down, it skips and the app falls back to the API.
import 'dotenv/config';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildRoute, loadDatasets, type Datasets } from '../api/bus-route.ts';
import { calculateDistanceMeters } from '../src/data/singaporeBuses.ts';
import type { NetworkFile, NetworkPatternRow, NetworkStopRow } from '../src/types/network.ts';

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

  // Every stop and service direction in one compact file: stop names for the "all buses at this stop" board,
  // plus "buses near you", stop search and trip planning in the browser
  const network = buildNetwork(data, generatedAt);
  const networkBody = JSON.stringify(network);
  await writeFile(path.join(OUT_DIR, 'network.json'), networkBody);
  console.log(
    `[bus-routes] Wrote ${services.length} services (${(totalBytes / 1024 / 1024).toFixed(1)} MB) and network.json ` +
      `(${network.stops.length} stops, ${network.patterns.length} service directions, ${(networkBody.length / 1024).toFixed(0)} KB) ` +
      `to ${path.relative(process.cwd(), OUT_DIR)}`
  );
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
// Road distance is longer than straight-line; used only where LTA's Distance is missing
const ROAD_FACTOR = 1.25;

function buildNetwork(data: Datasets, generatedAt: string): NetworkFile {
  const codes = [...data.stops.keys()];
  const stopIndex = new Map(codes.map((code, i) => [code, i]));
  const stops: NetworkStopRow[] = codes.map((code) => {
    const s = data.stops.get(code)!;
    return [code, s.Description, s.RoadName, round5(s.Latitude), round5(s.Longitude)];
  });

  const patterns: NetworkPatternRow[] = [];
  for (const [serviceNo, rows] of data.routes) {
    if (!/^[0-9A-Z]{1,6}$/.test(serviceNo)) continue;
    for (const direction of [1, 2]) {
      const ordered = rows
        .filter((r) => r.Direction === direction && stopIndex.has(r.BusStopCode))
        .sort((a, b) => a.StopSequence - b.StopSequence);
      if (ordered.length < 2) continue;

      const indexes: number[] = [];
      const hopHm: number[] = [];
      let metres = 0;
      let lastHm = 0;
      ordered.forEach((row, k) => {
        const stop = data.stops.get(row.BusStopCode)!;
        if (k > 0) {
          const ltaMetres = typeof row.Distance === 'number' && Number.isFinite(row.Distance) ? row.Distance * 1000 : NaN;
          if (ltaMetres >= metres) {
            metres = ltaMetres;
          } else {
            const prev = data.stops.get(ordered[k - 1].BusStopCode)!;
            metres += calculateDistanceMeters(prev.Latitude, prev.Longitude, stop.Latitude, stop.Longitude) * ROAD_FACTOR;
          }
        }
        indexes.push(stopIndex.get(row.BusStopCode)!);
        const hm = Math.round(metres / 100);
        hopHm.push(hm - lastHm);
        lastHm = hm;
      });
      patterns.push([ordered[0].ServiceNo, direction, indexes, hopHm]);
    }
  }
  return { generatedAt, stops, patterns };
}

main().catch((err) => {
  // Never fail the deploy over this; the API fallback still works
  console.warn('[bus-routes] Unexpected error; skipping.', err);
});
