import { config, apiUrl, dataUrl } from '../../config';
import { parseRoute, parseRouteIndex } from '../../../shared/transit/parsers';
import type { BusRoute } from '../../types/bus';
import { createAssetCache, type AssetCacheSettings } from './assetCache';
import { serviceNoSchema } from '../../../shared/input/primitives';

export type BusRouteLookup =
  | { status: 'ok'; route: BusRoute }
  | { status: 'not_found' }
  | { status: 'unavailable' };

export function createRouteRepository(settings: AssetCacheSettings, dependencies: { request?: typeof fetch; now?: () => number } = {}) {
  const request = dependencies.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const getRoute = createAssetCache<BusRouteLookup>(settings, result => result.status === 'ok', dependencies.now);
  const getIndex = createAssetCache<string[] | null>({ ...settings, maxEntries: 1 }, value => value !== null, dependencies.now);

  // SPA fallback serves HTML for missing JSON; never treat that as an artifact.
  async function fetchStaticJson(url: string): Promise<unknown> {
    try {
      const res = await request(dataUrl(url), { signal: AbortSignal.timeout(config.timeouts.requestMs) });
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
      return await res.json();
    } catch { return null; }
  }

  async function load(serviceNo: string, expectedVersion?: string): Promise<BusRouteLookup> {
    const staticRoute = await fetchStaticJson(`/bus-routes/${encodeURIComponent(serviceNo)}.json`);
    const parsedStatic = parseRoute(staticRoute, serviceNo, expectedVersion);
    if (parsedStatic) return { status: 'ok', route: parsedStatic };

    const index = await getIndex('index', async () => {
      const raw = await fetchStaticJson('/bus-routes/index.json');
      return parseRouteIndex(raw);
    });
    if (index && !index.includes(serviceNo)) return { status: 'not_found' };

    try {
      // A cold serverless instance may page through all LTA route data.
      const res = await request(apiUrl(`/api/bus-route?ServiceNo=${encodeURIComponent(serviceNo)}`), {
        signal: AbortSignal.timeout(config.timeouts.routeMs),
      });
      if (res.status === 404) return { status: 'not_found' };
      if (!res.ok) return { status: 'unavailable' };
      const route = parseRoute(await res.json(), serviceNo, expectedVersion);
      return route ? { status: 'ok', route } : { status: 'unavailable' };
    } catch { return { status: 'unavailable' }; }
  }

  function fetchBusRoute(serviceNo: string, expectedVersion?: string): Promise<BusRouteLookup> {
    const parsed = serviceNoSchema.safeParse(serviceNo);
    if (!parsed.success) return Promise.resolve({ status: 'unavailable' });
    const code = parsed.data;
    // Unversioned tracking must not reuse an incompatible planned-leg result.
    return getRoute(JSON.stringify([code, expectedVersion ?? null]), () => load(code, expectedVersion));
  }
  return { fetchBusRoute };
}

export const { fetchBusRoute } = createRouteRepository({ freshnessMs: config.cache.routeAssetsSeconds * 1000 });
