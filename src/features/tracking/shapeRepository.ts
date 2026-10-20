import { config, dataUrl } from '../../config';
import type { RouteShape } from '../../../shared/transit/shapes';

// Pre-built from OpenStreetMap by scripts/build-route-shapes.ts and served as static files
export async function fetchRouteShapes(serviceNo: string): Promise<RouteShape[]> {
  try {
    const res = await fetch(dataUrl(`/route-shapes/${encodeURIComponent(serviceNo.toUpperCase())}.json`), {
      signal: AbortSignal.timeout(config.timeouts.requestMs),
    });
    // Unknown services fall through to the SPA's index.html, so check it's really JSON
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return [];
    const data = await res.json();
    return Array.isArray(data?.shapes) ? data.shapes : [];
  } catch {
    return [];
  }
}
