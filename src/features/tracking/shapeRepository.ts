import { config, dataUrl } from '../../config';
import { parseShapes } from '../../../shared/transit/parsers';
import type { RouteShape } from '../../../shared/transit/shapes';
import { createAssetCache, type AssetCacheSettings } from './assetCache';
import { serviceNoSchema } from '../../../shared/input/primitives';
import { fetchReadWithBackoff } from '../../../shared/http/readRetry';

type ShapeLookup = { status: 'ok'; shapes: RouteShape[] } | { status: 'unavailable' };

export function createShapeRepository(settings: AssetCacheSettings, dependencies: { request?: typeof fetch; now?: () => number } = {}) {
  const request = dependencies.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const get = createAssetCache<ShapeLookup>(settings, result => result.status === 'ok', dependencies.now);
  async function load(serviceNo: string): Promise<ShapeLookup> {
    try {
      const res = await fetchReadWithBackoff(request, dataUrl(`/route-shapes/${encodeURIComponent(serviceNo)}.json`), {
        signal: AbortSignal.timeout(config.timeouts.requestMs),
      }, config.retry);
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return { status: 'unavailable' };
      const shapes = parseShapes(await res.json(), serviceNo);
      return shapes ? { status: 'ok', shapes } : { status: 'unavailable' };
    } catch { return { status: 'unavailable' }; }
  }
  async function fetchRouteShapes(serviceNo: string): Promise<RouteShape[]> {
    const parsed = serviceNoSchema.safeParse(serviceNo);
    if (!parsed.success) return [];
    const code = parsed.data;
    const result = await get(code, () => load(code));
    return result.status === 'ok' ? result.shapes : [];
  }
  return { fetchRouteShapes };
}

// Both tracking and selected-trip geometry share these parsed, validated assets.
export const { fetchRouteShapes } = createShapeRepository({ freshnessMs: config.cache.routeAssetsSeconds * 1000 });
