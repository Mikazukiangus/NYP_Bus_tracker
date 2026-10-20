import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { MapRef } from '../model';
import type { RouteDirection } from '../../../types/bus';

export const OSM_ROUTE_ATTRIBUTION =
  'Route lines &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export function useRouteLayer(mapInstanceRef: MapRef, routeDir: RouteDirection, followsRoads: boolean, hasJourney: boolean) {
  const routeLayerRef = useRef<L.Polyline | null>(null);
  // Update Route Polyline (road-following when OSM geometry matched, otherwise stop-to-stop)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (routeDir.path.length > 0) {
      routeLayerRef.current = L.polyline(routeDir.path, {
        color: 'var(--color-helvetia)',
        weight: 5,
        // Fade the full route behind a planned trip
        opacity: hasJourney ? 0.3 : 0.85,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: followsRoads ? undefined : '1 9',
      }).addTo(map);
    }

    if (followsRoads) map.attributionControl.addAttribution(OSM_ROUTE_ATTRIBUTION);
    return () => {
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
      if (followsRoads) map.attributionControl.removeAttribution(OSM_ROUTE_ATTRIBUTION);
    };
  }, [routeDir, followsRoads, hasJourney]);
}
