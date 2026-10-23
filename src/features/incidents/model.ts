import type { TrafficIncident } from '../../types/bus';

export interface IncidentFeed {
  status: 'loading' | 'ready' | 'stale' | 'unavailable';
  incidents: TrafficIncident[];
  fetchedAt: string | null;
}
