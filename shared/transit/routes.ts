export type BusOperator = 'SBST' | 'SMRT' | 'TTS' | 'GAS';

// First and last bus of a service at a stop as "HHmm" (LTA BusRoutes); null when it doesn't run that day
export type FirstLastTimes = [string, string] | null;

export interface BusStop {
  code: string; // e.g. "09037"
  name: string; // e.g. "Opp Mandarin Orchard"
  road: string; // e.g. "Orchard Rd"
  lat: number;
  lng: number;
  distanceMeters?: number;
  // Only on LTA route data, for the service being viewed
  firstLastBus?: { weekday: FirstLastTimes; saturday: FirstLastTimes; sunday: FirstLastTimes };
}

export interface RouteDirection {
  origin: string;
  destination: string;
  stops: BusStop[];
  path: [number, number][];
  pathSource?: 'OPENSTREETMAP'; // set when path follows real roads; otherwise straight stop-to-stop lines
}

export interface BusRoute {
  serviceNo: string;
  operator: BusOperator;
  category: 'Trunk' | 'Feeder' | 'Express';
  source?: 'LTA_DATAMALL' | 'OFFLINE';
  direction1: RouteDirection;
  direction2?: RouteDirection;
}
