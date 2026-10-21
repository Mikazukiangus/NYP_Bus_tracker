import type { BusOperator, BusStop } from '../../shared/transit/routes';
export type { BusOperator, BusStop, FirstLastTimes, RouteDirection, BusRoute } from '../../shared/transit/routes';
import type { BusLoad, BusType } from '../../shared/transit/arrivals';
export type { BusLoad, BusType } from '../../shared/transit/arrivals';
export type ArrivalDataSource = 'LOADING' | 'LTA_DATAMALL_V3' | 'FALLBACK_SIMULATED';

export interface BusArrivalInfo {
  estimatedMinutes: number; // derived display value; 0 means arriving
  estimatedArrivalAtMs?: number; // absolute instant; absent only on legacy/injected display fixtures
  originCode?: string;
  destinationCode?: string;
  visitNumber?: number;
  position?: { lat: number; lng: number } | null; // one validated coordinate pair
  monitoring?: 'live' | 'scheduled' | 'unknown';
  load: BusLoad;
  type?: BusType; // LTA gives each bus's type; missing if it didn't
  feature: 'WAB' | '';
  lat?: number;
  lng?: number;
  monitored?: boolean; // true when LTA has a live GPS fix (position is real), false when schedule-based
}

// One service's next three buses at a stop, from LTA BusArrival for the whole stop
export interface StopServiceArrivals {
  serviceNo: string;
  operator: BusOperator;
  nextBus: BusArrivalInfo | null;
  nextBus2: BusArrivalInfo | null;
  nextBus3: BusArrivalInfo | null;
}

// LTA DataMall TrafficIncidents entry (from /api/traffic-incidents)
export type { TrafficIncident } from '../../shared/transit/incidents';

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
  type?: BusType;
  feature: 'WAB' | '';
}

export type { UserLocation } from '../../shared/geo/location';

// A planned trip drawn on the map: walk to the first stop, one or two bus legs, walk to the destination
export interface JourneyOverlay {
  id: string;
  from: { lat: number; lng: number; name: string };
  to: { lat: number; lng: number; name: string };
  legs: {
    serviceNo: string;
    otherServiceNos: string[]; // other buses between the same two stops
    board: { code: string; name: string; lat: number; lng: number };
    alight: { code: string; name: string; lat: number; lng: number };
    path: [number, number][];
    followsRoads: boolean;
  }[];
  activeLeg?: number; // the leg on the bus being tracked; the others are drawn fainter
}

export type StopRef = Pick<BusStop, 'code' | 'name' | 'road' | 'lat' | 'lng' | 'call'>;

// A suggested trip that the tracked bus is part of, so the other leg of a trip with a change can be shown with it
export interface TripView {
  id: string;
  destinationName: string;
  legIndex: number; // the leg on the bus being tracked
  legs: {
    serviceNo: string; // the bus chosen for this leg
    serviceNos: string[]; // every bus between the same two stops, in number order (including the chosen one)
    notDueServiceNos: string[]; // those with no bus due at the boarding stop now
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
  occurrence?: number; // absent in legacy records means first visit
  labelSnapshot?: { stopName: string; roadName: string; destination: string }; // offline fallback, not authoritative

}
