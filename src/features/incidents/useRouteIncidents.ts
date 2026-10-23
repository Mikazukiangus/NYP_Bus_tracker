import { useEffect, useMemo, useState } from 'react';
import type { IncidentFeed } from './model';
import { config } from '../../config';
import { fetchTrafficIncidents } from './client';
import { distanceToPathMeters } from '../../services/routeShape';
const INCIDENT_ROUTE_DISTANCE_M = 150;

export function useRouteIncidents(path: [number, number][]) {
  // LTA traffic incidents (accidents, roadworks, breakdowns...) near the route being viewed
  const [feed, setFeed] = useState<IncidentFeed>({ status: 'loading', incidents: [], fetchedAt: null });

  useEffect(() => {
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      const maxAgeMs = config.polling.incidentsSeconds * 1000;
      setFeed(previous => previous.fetchedAt && Date.now() - Date.parse(previous.fetchedAt) >= maxAgeMs
        ? { ...previous, status: 'stale' } : previous);
      const result = await fetchTrafficIncidents();
      pending = false;
      if (!active) return;
      setFeed(previous => result
        ? { ...result, status: Date.now() - Date.parse(result.fetchedAt) >= maxAgeMs ? 'stale' : 'ready' }
        : { ...previous, status: previous.fetchedAt ? 'stale' : 'unavailable' });
    };
    load();
    const timer = setInterval(load, config.polling.incidentsSeconds * 1000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const incidentsOnRoute = useMemo(
    () => feed.incidents.filter((i) => distanceToPathMeters([i.lat, i.lng], path) <= INCIDENT_ROUTE_DISTANCE_M),
    [feed.incidents, path]
  );

  return { ...feed, incidents: incidentsOnRoute };
}
