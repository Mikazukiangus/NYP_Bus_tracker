export type BusLoad = 'SEA' | 'SDA' | 'LSD'; // Seats Available, Standing Available, Limited Standing
export type BusType = 'SD' | 'DD' | 'BD'; // Single Deck, Double Deck, Bendy
export type BusOperator = 'SBST' | 'SMRT' | 'TTS' | 'GAS';
export type ArrivalDataSource = 'LOADING' | 'LTA_DATAMALL_V3' | 'FALLBACK_SIMULATED';

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

export interface BusArrivalInfo {
  estimatedMinutes: number; // 0 means "Arr"
  load: BusLoad;
  type: BusType;
  feature: 'WAB' | '';
  lat?: number;
  lng?: number;
  monitored?: boolean; // true when LTA has a live GPS fix (position is real), false when schedule-based
}

// One service's next three buses at a stop, from LTA BusArrival for the whole stop
export interface StopServiceArrivals {
  serviceNo: string;
  operator: string;
  destinationCode?: string;
  nextBus: BusArrivalInfo | null;
  nextBus2: BusArrivalInfo | null;
  nextBus3: BusArrivalInfo | null;
}

// LTA DataMall TrafficIncidents entry (from /api/traffic-incidents)
export interface TrafficIncident {
  type: string;
  lat: number;
  lng: number;
  message: string;
}

export interface BusServiceArrivals {
  serviceNo: string;
  operator: BusOperator;
  stopCode: string;
  stopName: string;
  roadName: string;
  destination: string;
  direction: number;
  nextBus: BusArrivalInfo | null;
  nextBus2: BusArrivalInfo | null;
  nextBus3: BusArrivalInfo | null;
  lastUpdated: Date | null;
}

// A real bus approaching the selected stop, positioned from LTA BusArrival GPS data
export interface IncomingBus {
  id: string;
  serviceNo: string;
  ordinal: 1 | 2 | 3; // 1st, 2nd or 3rd bus due at the stop
  lat: number;
  lng: number;
  etaMinutes: number;
  load: BusLoad;
  type: BusType;
  feature: 'WAB' | '';
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

export interface UserLocation {
  lat: number;
  lng: number;
  name: string;
  isSimulated: boolean; // false only for the device's own GPS position
  accuracyMeters?: number;
  kind?: 'place' | 'address' | 'postal' | 'stop'; // how a searched location was found
  address?: string;
}

// A planned trip drawn on the map: walk to the first stop, one or two bus legs, walk to the destination
export interface JourneyOverlay {
  id: string;
  from: { lat: number; lng: number; name: string };
  to: { lat: number; lng: number; name: string };
  legs: {
    serviceNo: string;
    board: { code: string; name: string; lat: number; lng: number };
    alight: { code: string; name: string; lat: number; lng: number };
    path: [number, number][];
    followsRoads: boolean;
  }[];
  activeLeg?: number; // the leg on the bus being tracked; the others are drawn fainter
}

export type StopRef = Pick<BusStop, 'code' | 'name' | 'road' | 'lat' | 'lng'>;

// A suggested trip that the tracked bus is part of, so the other leg of a trip with a change can be shown with it
export interface TripView {
  id: string;
  destinationName: string;
  legIndex: number; // the leg on the bus being tracked
  legs: {
    serviceNo: string;
    alsoServiceNos: string[];
    towards: string;
    board: StopRef;
    alight: StopRef;
    stops: StopRef[]; // board to alight, in order
    rideMin: number;
  }[];
  transferWalkM: number; // between the two buses; 0 when changing at the same stop
  transferWalkMin: number;
  walkEndM: number;
  walkEndMin: number;
}

// Where to get off the tracked bus for the destination set in "Where to?"
export type AlightHint =
  | {
      status: 'alight';
      stop: StopRef;
      stopCount: number;
      rideMin: number;
      walkM: number; // straight line from the stop to the destination, or to the next bus
      walkMin: number;
      destinationName: string;
      trip?: TripView; // when the bus is part of a suggested trip (with the next bus if there is a change)
    }
  | {
      // The bus never comes within walking distance of the destination after this stop
      status: 'not-near';
      stop: StopRef; // its closest stop
      distanceM: number;
      destinationName: string;
    };

export interface FavoriteItem {
  id: string;
  serviceNo: string;
  stopCode: string;
  stopName: string;
  roadName: string;
  direction: number;
  destination: string;
  savedAt: number;
}
