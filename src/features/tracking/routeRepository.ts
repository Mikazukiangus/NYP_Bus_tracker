import { config, apiUrl, dataUrl } from '../../config';
import type { BusRoute } from '../../types/bus';

export type BusRouteLookup =
  | { status: 'ok'; route: BusRoute }
  | { status: 'not_found' }
  | { status: 'unavailable' };

// Fetch a static JSON file built at deploy time; null if it isn't there (the SPA rewrite serves index.html)
async function fetchStaticJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(dataUrl(url), { signal: AbortSignal.timeout(config.timeouts.requestMs) });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

let staticRouteIndex: Promise<{ services: string[] } | null> | null = null;

// Fetch the real stop sequence for a service (LTA DataMall BusRoutes + BusStops):
// first from the static copy generated at build time (scripts/build-bus-routes.ts), else from /api/bus-route
export async function fetchBusRoute(serviceNo: string): Promise<BusRouteLookup> {
  const fileName = encodeURIComponent(serviceNo.trim().toUpperCase());
  const staticRoute = await fetchStaticJson<BusRoute>(`/bus-routes/${fileName}.json`);
  if (staticRoute?.direction1?.stops?.length) return { status: 'ok', route: staticRoute };

  // If the build produced an index and the service isn't in it, it isn't an LTA service: answer instantly
  staticRouteIndex ??= fetchStaticJson<{ services: string[] }>('/bus-routes/index.json');
  const index = await staticRouteIndex;
  if (index?.services?.length && !index.services.includes(serviceNo.trim().toUpperCase())) {
    return { status: 'not_found' };
  }

  try {
    // A cold serverless instance has to page through all LTA route data, so allow extra time
    const res = await fetch(apiUrl(`/api/bus-route?ServiceNo=${encodeURIComponent(serviceNo)}`), {
      signal: AbortSignal.timeout(config.timeouts.routeMs),
    });

    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'unavailable' };

    const data = await res.json();
    if (!data?.direction1?.stops?.length) return { status: 'unavailable' };
    return { status: 'ok', route: data as BusRoute };
  } catch {
    return { status: 'unavailable' };
  }
}
