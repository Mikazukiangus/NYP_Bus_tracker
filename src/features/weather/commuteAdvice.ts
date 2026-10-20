import type { WeatherSnapshot, WeatherSummary } from '../../types/weather';
import type { AlightHint, BusServiceArrivals, TripView, UserLocation } from '../../types/bus';
import type { NearbyStop } from '../../services/busNetwork';
import type { PlaceResult } from '../../services/placeSearch';
import type { TripOption } from '../../services/tripPlanner';
import { rainNowcast } from '../../services/rainNowcast';
import { rainAdvice, type RainAdviceInput } from '../../services/rainAdvice';
import { firstCatchable, walkMinutes } from '../../services/leaveWithin';
import { forecastAt } from './summary';
import { calculateDistanceMeters } from '../../../shared/geo/distance';
export const WALKABLE_STOP_M = 1500;
interface CommuteInput {
  weatherSnapshot: WeatherSnapshot | null;
  weather: WeatherSummary | null;
  walkToStopM: number;
  nearbyStops: NearbyStop[] | null | undefined;
  arrivals: BusServiceArrivals;
  destination: PlaceResult | null;
  alightHint: AlightHint | null;
  selectedTrip: TripOption | null;
  tripView: TripView | null;
  userLocation: UserLocation;
}

export function buildCommuteAdvice({ weatherSnapshot, weather, walkToStopM, nearbyStops, arrivals, destination, alightHint, selectedTrip, tripView, userLocation }: CommuteInput) {
  if (!weatherSnapshot || !weather) return null;
  // The walk to the tracked bus's stop; if that stop is too far from where the trip starts to walk to (a bus
  // tracked elsewhere), the walk to the nearest stop there, without bus times
  const walkable = walkToStopM <= WALKABLE_STOP_M;
  const nearest = nearbyStops?.[0];
  const walkM = walkable ? walkToStopM : nearest && nearest.distanceM <= WALKABLE_STOP_M ? nearest.distanceM : undefined;
  // Within 50 m you're at the stop; otherwise at least a minute's walk (the same walk as "Leave within")
  const walkMin = walkM === undefined ? undefined : walkMinutes(walkM);
  const busMin = walkable
    ? [arrivals.nextBus, arrivals.nextBus2, arrivals.nextBus3].flatMap((b) => (b ? [Math.max(0, b.estimatedMinutes)] : []))
    : [];
  const caught = firstCatchable(walkMin ?? 0, busMin.map((m) => ({ estimatedMinutes: m })));
  const boardIn = Math.max(walkMin ?? 0, caught?.estimatedMinutes ?? 0);

  // When the bus gets to the stop for the destination, and the walk from there
  let end: { arriveInMin: number; walkMin: number } | null = null;
  if (destination && alightHint?.status === 'alight') {
    if (selectedTrip && tripView?.legIndex === 0) {
      end = {
        arriveInMin: boardIn + selectedTrip.travelMin - selectedTrip.walkStartMin - selectedTrip.walkEndMin,
        walkMin: selectedTrip.walkEndMin,
      };
    } else if (walkable && (!alightHint.trip || alightHint.trip.legIndex === alightHint.trip.legs.length - 1)) {
      end = { arriveInMin: boardIn + alightHint.rideMin, walkMin: alightHint.walkMin };
    }
  }
  // A destination this close shares the rain gauges around the user, so it would only repeat what's said here
  const farEnough = destination && calculateDistanceMeters(userLocation.lat, userLocation.lng, destination.lat, destination.lng) > 3000;
  const atDestination: RainAdviceInput['destination'] =
    destination && end && farEnough
      ? {
          name: destination.name,
          nowcast: rainNowcast(weatherSnapshot.rainfall?.history, destination.lat, destination.lng),
          forecast: forecastAt(weatherSnapshot, destination.lat, destination.lng),
          arriveInMin: Math.round(end.arriveInMin),
          walkMin: Math.round(end.walkMin),
        }
      : undefined;

  return rainAdvice({
    here: weather.nowcast ?? { status: 'unknown' },
    area: weather.area,
    forecast: weather.forecast2h?.text,
    lightning: weather.lightning,
    walkMin,
    stopName: walkable ? arrivals.stopName : nearest?.stop.name,
    busServiceNo: walkable ? arrivals.serviceNo : undefined,
    busMin,
    destination: atDestination,
  });
}
