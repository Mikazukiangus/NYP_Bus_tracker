import { useEffect } from 'react';
import L from 'leaflet';
import type { MapRef, LiveBusMapProps } from './model';
import type { AlightHint, RouteDirection, JourneyOverlay } from '../../types/bus';

// Keep a framed trip clear of the legend in the top-left corner
const TRIP_FIT: L.FitBoundsOptions = { paddingTopLeft: [40, 150], paddingBottomRight: [40, 30], maxZoom: 17 };
// The stop to get off at is a marker on its own, so give it more room from the edge
const ALIGHT_FIT: L.FitBoundsOptions = { paddingTopLeft: [50, 150], paddingBottomRight: [50, 60], maxZoom: 16 };

function fitTrip(map: L.Map, journey: JourneyOverlay) {
  const points: [number, number][] = [
    [journey.from.lat, journey.from.lng],
    [journey.to.lat, journey.to.lng],
    ...journey.legs.flatMap((leg) => leg.path),
  ];
  map.fitBounds(L.latLngBounds(points), TRIP_FIT);
}

export function useMapViewport(mapInstanceRef: MapRef, { route, direction, nearestStop, userLocation, journey, alightStop, routeDir }: Pick<LiveBusMapProps, 'route' | 'direction' | 'nearestStop' | 'userLocation'> & { journey: JourneyOverlay | null; alightStop: Extract<AlightHint, { status: 'alight' }> | null; routeDir: RouteDirection }) {
  // Frame the user and their nearest stop (and the stop to get off at, if any) whenever the route, direction
  // or location changes (a planned trip is framed by its own effect instead)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || journey) return;
    const bounds = L.latLngBounds([
      [userLocation.lat, userLocation.lng],
      [nearestStop.lat, nearestStop.lng],
      ...(alightStop ? [[alightStop.stop.lat, alightStop.stop.lng] as [number, number]] : []),
    ]);
    map.fitBounds(bounds, alightStop ? ALIGHT_FIT : { padding: [60, 60], maxZoom: 16 });
  }, [route.serviceNo, direction, nearestStop.code, userLocation.lat, userLocation.lng, journey?.id, alightStop?.stop.code]);

  // Frame the whole trip when one is chosen
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !journey) return;
    fitTrip(map, journey);
    // Only when a different trip is chosen, not when its lines are upgraded to road geometry
  }, [journey?.id]);

  const handleCenterNearest = () => {
    mapInstanceRef.current?.flyTo([nearestStop.lat, nearestStop.lng], 17, { duration: 1 });
  };

  const handleCenterUser = () => {
    mapInstanceRef.current?.flyTo([userLocation.lat, userLocation.lng], 17, { duration: 1 });
  };

  const handleFitTrip = () => {
    if (!mapInstanceRef.current || !journey) return;
    fitTrip(mapInstanceRef.current, journey);
  };

  const handleFitRoute = () => {
    if (mapInstanceRef.current && routeDir.path.length > 0) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(routeDir.path), { padding: [30, 30] });
    }
  };

  return { handleCenterNearest, handleCenterUser, handleFitTrip, handleFitRoute };
}
