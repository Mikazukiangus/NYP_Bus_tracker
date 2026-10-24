import type { AppConfig } from '../../config/schema.ts';
import { createLtaClient } from './client.ts';
import type { Datasets, LTABusStop, LTABusRouteRow, LTABusServiceRow } from './types.ts';
import { parseStopRows, parseRouteRows, parseServiceRows } from './schemas.ts';

export function createDatasetStore(settings: AppConfig['lta'], request?: typeof fetch, now = Date.now) {
  const { fetchAll } = createLtaClient(settings, request, now);
  let cached: Datasets | null = null;
  let pending: Promise<Datasets> | null = null;
  async function loadDatasets(accountKey: string): Promise<Datasets> {
    const [stopRows, routeRows, serviceRows] = await Promise.all([
      fetchAll<LTABusStop>('BusStops', accountKey, undefined, parseStopRows),
      fetchAll<LTABusRouteRow>('BusRoutes', accountKey, undefined, parseRouteRows),
      fetchAll<LTABusServiceRow>('BusServices', accountKey, undefined, parseServiceRows),
    ]);
    // Row validation is inside each collection's circuit, before recovery/indexing.

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
    // Claim pending work synchronously; expiry applies to a completed snapshot, never its loader.
    if (pending) return pending;
    const age = cached ? now() - cached.loadedAt : Infinity;
    if (cached && age >= 0 && age < settings.datasetTtlMs) return Promise.resolve(cached);
    const task = Promise.resolve().then(() => loadDatasets(accountKey)).then(data => {
      cached = data; // Publish all three validated collections and their completion timestamp together.
      return data;
    }).finally(() => { if (pending === task) pending = null; });
    pending = task;
    return task;
  }

  return { loadDatasets, getDatasets };
}
