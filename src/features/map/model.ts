import type { RefObject } from 'react';
import type L from 'leaflet';
import type { AlightHint, BusRoute, BusStop, IncomingBus, JourneyOverlay, TrafficIncident, UserLocation } from '../../types/bus';

export interface LiveBusMapProps {
  route: BusRoute;
  direction: number;
  nearestStop: BusStop;
  selectedStop: BusStop;
  onSelectStop: (stop: BusStop) => void;
  userLocation: UserLocation;
  incomingBuses: IncomingBus[];
  incidents: TrafficIncident[]; // LTA traffic incidents near this route
  journey?: JourneyOverlay | null; // a planned trip to draw over the route
  alight?: AlightHint | null; // where to get off the tracked bus for the destination
  etas?: { serviceNo: string; minutes: number[]; live: boolean } | null; // the tracked bus's next times at its stop
}

export type StopEtas = NonNullable<LiveBusMapProps['etas']>;
export type MapRef = RefObject<L.Map | null>;
