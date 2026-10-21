export type BusOperator = 'SBST' | 'SMRT' | 'TTS' | 'GAS';

// First and last bus of a service at a stop as "HHmm" (LTA BusRoutes); null when it doesn't run that day
export type FirstLastTimes = [string, string] | null;

export type Direction = 1 | 2;
export interface ArtifactVersion { schemaVersion?: 1; datasetVersion?: string; generatedAt?: string }
export interface StopCallRef { patternId: string; sequence: number; occurrence: number; stopCode: string; datasetVersion?: string }

export interface PhysicalStop {
  code: string; // e.g. "09037"
  name: string; // e.g. "Opp Mandarin Orchard"
  road: string; // e.g. "Orchard Rd"
  lat: number;
  lng: number;
}

// Flattened stop-call view retained for existing JSON consumers; physical identity is separate.
export interface BusStop extends PhysicalStop {
  call?: StopCallRef; // old public JSON is normalized to this at the boundary
  distanceM?: number; // cumulative distance on this service direction
  distanceMeters?: number; // user-relative presentation distance
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

export interface BusRoute extends ArtifactVersion {
  serviceNo: string;
  operator: BusOperator;
  category: 'Trunk' | 'Feeder' | 'Express' | 'Other';
  rawCategory?: string;
  source?: 'LTA_DATAMALL' | 'OFFLINE';
  direction1: RouteDirection;
  direction2?: RouteDirection;
}

// Canonical runtime routes always have visit references; legacy JSON may omit them.
export interface RouteStopCall extends BusStop { call: StopCallRef }
export interface NormalizedRouteDirection extends RouteDirection { stops: RouteStopCall[] }
export interface NormalizedBusRoute extends BusRoute { direction1: NormalizedRouteDirection; direction2?: NormalizedRouteDirection }
