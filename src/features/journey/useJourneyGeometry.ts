import { useEffect, useState } from 'react';
import type { TripOption } from '../../services/tripPlanner';
import { fetchBusRoute } from '../tracking/routeRepository';
import { applyRouteShapes, legPath } from '../../services/routeShape';
import { fetchRouteShapes } from '../tracking/shapeRepository';
import type { TripRoadPaths } from './model';

export function useJourneyGeometry(selectedTrip: TripOption | null) {
  // Road-following lines for the chosen trip's bus legs (straight stop-to-stop lines until they load)
  const [tripRoadPaths, setTripRoadPaths] = useState<TripRoadPaths | null>(null);
  const tripPathKey = selectedTrip ? JSON.stringify([selectedTrip.id,
    selectedTrip.legs.map(l => [l.serviceNo.trim().toUpperCase(), l.board.call?.datasetVersion ?? null])]) : '';

  useEffect(() => {
    if (!selectedTrip) return;
    let active = true;
    const key = tripPathKey;
    Promise.all(
      selectedTrip.legs.map(async (leg) => {
        const [result, shapes] = await Promise.all([
          fetchBusRoute(leg.serviceNo, leg.board.call?.datasetVersion),
          fetchRouteShapes(leg.serviceNo),
        ]);
        if (result.status !== 'ok') return null;
        const shaped = applyRouteShapes(result.route, shapes);
        const dir = leg.direction === 2 && shaped.direction2 ? shaped.direction2 : shaped.direction1;
        return legPath(dir, leg.board.code, leg.alight.code, leg.board.call, leg.alight.call);
      })
    ).then((legs) => {
      if (active) setTripRoadPaths({ key, legs });
    });
    return () => {
      active = false;
    };
    // Only when the trip or the buses chosen for it change, not on every new trip object
  }, [tripPathKey]);

  return { tripRoadPaths, tripPathKey };
}
