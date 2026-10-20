import type { LiveDeparture, TripOption, TripPlan } from '../../services/tripPlanner';

export interface RankedTrip {
  option: TripOption;
  live: LiveDeparture;
}

export type TripPlannerState =
  | { status: 'loading' } // bus network still downloading
  | { status: 'unavailable' }
  | { status: 'ready'; plan: TripPlan; trips: RankedTrip[] };

export interface TripRoadPaths {
  key: string;
  legs: ({ path: [number, number][]; followsRoads: boolean } | null)[];
}
