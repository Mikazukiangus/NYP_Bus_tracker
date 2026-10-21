import type { AppConfig } from '../../config/schema.ts';
import { createLtaClient } from './client.ts';
import type { Datasets, LTABusStop, LTABusRouteRow, LTABusServiceRow } from './types.ts';
import { parseStopRows, parseRouteRows, parseServiceRows } from './schemas.ts';

export function createDatasetStore(settings: AppConfig['lta'], request?: typeof fetch, now = Date.now) {
  const { fetchAll } = createLtaClient(settings, request);
  let datasetsPromise: Promise<Datasets> | null = null;
  let datasetsLoadedAt = 0;
  async function loadDatasets(accountKey: string): Promise<Datasets> {
    const [rawStops, rawRoutes, rawServices] = await Promise.all([
      fetchAll<LTABusStop>('BusStops', accountKey),
      fetchAll<LTABusRouteRow>('BusRoutes', accountKey),
      fetchAll<LTABusServiceRow>('BusServices', accountKey),
    ]);
    // Validate all rows before creating indexes or joining provider datasets.
    const stopRows = parseStopRows(rawStops);
    const routeRows = parseRouteRows(rawRoutes);
    const serviceRows = parseServiceRows(rawServices);

    const stops = new Map(stopRows.map((s) => [s.BusStopCode, s]));

    const routes = new Map<string, LTABusRouteRow[]>();
    for (const row of routeRows) {
      const key = row.ServiceNo.toUpperCase();
      const list = routes.get(key);
      if (list) list.push(row);
      else routes.set(key, [row]);
    }

    const services = new Map<string, LTABusServiceRow>();
    for (const row of serviceRows) {
      const key = row.ServiceNo.toUpperCase();
      if (!services.has(key)) services.set(key, row);
    }

    return { stops, routes, services, loadedAt: now() };
  }

  function getDatasets(accountKey: string): Promise<Datasets> {
    if (!datasetsPromise || now() - datasetsLoadedAt > settings.datasetTtlMs) {
      datasetsLoadedAt = now();
      datasetsPromise = loadDatasets(accountKey).catch((err) => {
        // Don't cache failures
        datasetsPromise = null;
        throw err;
      });
    }
    return datasetsPromise;
  }

  return { loadDatasets, getDatasets };
}
