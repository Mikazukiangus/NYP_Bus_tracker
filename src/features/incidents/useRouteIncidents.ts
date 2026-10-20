import { useEffect, useMemo, useState } from 'react';
import type { TrafficIncident } from '../../types/bus';
import { config } from '../../config';
import { fetchTrafficIncidents } from './client';
import { distanceToPathMeters } from '../../services/routeShape';
const INCIDENT_ROUTE_DISTANCE_M = 150;

export function useRouteIncidents(path: [number, number][]) {
  // LTA traffic incidents (accidents, roadworks, breakdowns...) near the route being viewed
  const [trafficIncidents, setTrafficIncidents] = useState<TrafficIncident[]>([]);

  useEffect(() => {
    const load = async () => {
      const incidents = await fetchTrafficIncidents();
      if (incidents) setTrafficIncidents(incidents);
    };
    load();
    const timer = setInterval(load, config.polling.incidentsSeconds * 1000);
    return () => clearInterval(timer);
  }, []);

  const incidentsOnRoute = useMemo(
    () => trafficIncidents.filter((i) => distanceToPathMeters([i.lat, i.lng], path) <= INCIDENT_ROUTE_DISTANCE_M),
    [trafficIncidents, path]
  );

  return incidentsOnRoute;
}
