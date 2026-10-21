import { callIndex } from '../../../shared/transit/stopCalls';
import { patternCall } from '../../services/tripPlanner';
import type { AlightHint, BusRoute, BusStop, JourneyOverlay, RouteDirection, TripView, UserLocation } from '../../types/bus';
import type { BusNetwork } from '../network/model';
import { alightFor, legServiceNos, type TripLeg, type TripOption, type TripPlan } from '../../services/tripPlanner';
import { walkMinutes } from '../../services/leaveWithin';
import type { AlarmRide } from '../alarm/model';
import type { PlaceResult } from '../places/model';
import type { TripRoadPaths } from './model';
const stopRef = ({ code, name, road, lat, lng, call }: BusStop) => ({ code, name, road, lat, lng, ...(call ? { call } : {}) });

interface PresentationContext {
  network: BusNetwork | null;
  destination: PlaceResult | null;
  userLocation: UserLocation;
  selectedTrip: TripOption | null;
  trackedLeg: number;
  tripPlan: TripPlan | null;
  tripRoadPaths: TripRoadPaths | null;
  tripPathKey: string;
  notDueAt: (leg: TripLeg) => string[];
  currentRoute: BusRoute;
  direction: number;
  routeDir: RouteDirection;
  selectedStop: BusStop;
  tripView: TripView | null;
  alightHint: AlightHint | null;
}

export function buildJourney({ network, destination, userLocation, selectedTrip, trackedLeg, tripPlan, tripRoadPaths, tripPathKey }: Pick<PresentationContext, 'network' | 'destination' | 'userLocation' | 'selectedTrip' | 'trackedLeg' | 'tripPlan' | 'tripRoadPaths' | 'tripPathKey'>): JourneyOverlay | null {
  if (!network || !destination) return null;
  const from = { lat: userLocation.lat, lng: userLocation.lng, name: userLocation.name };
  const to = { lat: destination.lat, lng: destination.lng, name: destination.name };
  // Close enough to walk: show just the destination and the walk
  if (tripPlan && tripPlan.options.length === 0) {
    return { id: `walk@${from.lat},${from.lng}>${destination.id}`, from, to, legs: [] };
  }
  if (!selectedTrip) return null;
  const road = tripRoadPaths?.key === tripPathKey ? tripRoadPaths.legs : [];
  const pick = ({ code, name, lat, lng }: TripLeg['board']) => ({ code, name, lat, lng });
  return {
    id: `${selectedTrip.id}@${from.lat},${from.lng}>${destination.id}`,
    from,
    to,
    legs: selectedTrip.legs.map((leg, i) => {
      const stops = network.patterns[leg.patternIndex].stops.slice(leg.boardPos, leg.alightPos + 1);
      return {
        serviceNo: leg.serviceNo,
        otherServiceNos: leg.alsoServiceNos,
        board: pick(leg.board),
        alight: pick(leg.alight),
        path: road[i]?.path ?? stops.map((s): [number, number] => [network.stops[s].lat, network.stops[s].lng]),
        followsRoads: road[i]?.followsRoads ?? false,
      };
    }),
    ...(trackedLeg >= 0 ? { activeLeg: trackedLeg } : {}),
  };
}

export function buildTripView({ network, destination, selectedTrip, trackedLeg, notDueAt }: Pick<PresentationContext, 'network' | 'destination' | 'selectedTrip' | 'trackedLeg' | 'notDueAt'>): TripView | null {
  if (!network || !destination || !selectedTrip || trackedLeg < 0) return null;
  return {
    id: selectedTrip.id,
    destinationName: destination.name,
    legIndex: trackedLeg,
    legs: selectedTrip.legs.map((leg) => ({
      serviceNo: leg.serviceNo,
      serviceNos: legServiceNos(leg),
      notDueServiceNos: notDueAt(leg),
      towards: leg.towards,
      board: stopRef(leg.board),
      alight: stopRef(leg.alight),
      stops: network.patterns[leg.patternIndex].stops.slice(leg.boardPos, leg.alightPos + 1).map((i, offset) => stopRef({ ...network.stops[i], call: patternCall(network, network.patterns[leg.patternIndex], leg.boardPos + offset) })),
      rideMin: leg.rideMin,
    })),
    transferWalkM: selectedTrip.transferWalkM,
    transferWalkMin: selectedTrip.transferWalkMin,
    walkEndM: selectedTrip.walkEndM,
    walkEndMin: selectedTrip.walkEndMin,
  };
}

export function buildAlightHint({ network, destination, selectedTrip, tripView, routeDir, selectedStop, currentRoute, direction }: Pick<PresentationContext, 'network' | 'destination' | 'selectedTrip' | 'tripView' | 'routeDir' | 'selectedStop' | 'currentRoute' | 'direction'>): AlightHint | null {
  if (!network || !destination) return null;
  if (network.datasetVersion && currentRoute.datasetVersion && network.datasetVersion !== currentRoute.datasetVersion) return null;

  // Part of the shown trip: get off where that trip says, which is the change stop on the first bus of a trip with a change
  if (selectedTrip && tripView) {
    const leg = selectedTrip.legs[tripView.legIndex];
    const isLast = tripView.legIndex === selectedTrip.legs.length - 1;
    return {
      status: 'alight',
      stop: stopRef(leg.alight),
      stopCount: leg.stopCount,
      rideMin: leg.rideMin,
      walkM: isLast ? selectedTrip.walkEndM : selectedTrip.transferWalkM,
      walkMin: isLast ? selectedTrip.walkEndMin : selectedTrip.transferWalkMin,
      destinationName: destination.name,
      trip: tripView,
    };
  }

  // Otherwise the stop on this bus that gets closest to the destination
  const boardIndex = callIndex(routeDir.stops, selectedStop);
  const isLaterStop = (code: string) => routeDir.stops.some((s, i) => i > boardIndex && s.code === code);
  const advice = alightFor(network, currentRoute.serviceNo, direction, selectedStop.code, destination, selectedStop.call);
  if (advice?.status === 'alight' && isLaterStop(advice.leg.alight.code)) {
    return {
      status: 'alight',
      stop: stopRef(advice.leg.alight),
      stopCount: advice.leg.stopCount,
      rideMin: advice.leg.rideMin,
      walkM: advice.walkEndM,
      walkMin: advice.walkEndMin,
      destinationName: destination.name,
    };
  }
  if (advice?.status === 'not-near') {
    return { status: 'not-near', stop: stopRef(advice.closest), distanceM: advice.distanceM, destinationName: destination.name };
  }
  return null;
}

export function buildAlarmRide({ alightHint, routeDir, selectedStop, currentRoute }: Pick<PresentationContext, 'alightHint' | 'routeDir' | 'selectedStop' | 'currentRoute'>): AlarmRide | null {
  if (alightHint?.status !== 'alight') return null;
  let stops = alightHint.trip?.legs[alightHint.trip.legIndex].stops;
  if (!stops) {
    const from = callIndex(routeDir.stops, selectedStop);
    const to = alightHint.stop.call ? callIndex(routeDir.stops, alightHint.stop) : routeDir.stops.findIndex((s, i) => i > from && s.code === alightHint.stop.code);
    if (from < 0 || to <= from) return null;
    stops = routeDir.stops.slice(from, to + 1).map(stopRef);
  }
  if (stops.length < 2) return null;
  const svc = currentRoute.serviceNo;
  return { key: `${svc}|${stops[0].call?.patternId ?? ''}|${stops[0].call?.datasetVersion ?? ''}|${stops.map(s => `${s.code}@${s.call?.occurrence ?? 1}`).join('>')}`, serviceNo: svc, stops };
}

export function buildAfterGetOff({ alightHint }: Pick<PresentationContext, 'alightHint'>): string | undefined {
  if (alightHint?.status !== 'alight') return undefined;
  const next = alightHint.trip?.legs[alightHint.trip.legIndex + 1];
  if (next) return `then Bus ${next.serviceNo} from ${alightHint.walkM > 0 ? next.board.name : 'the same stop'}`;
  // The destination is the stop itself: nothing more to say
  if (walkMinutes(alightHint.walkM) === 0) return undefined;
  return `then ~${Math.max(1, Math.round(alightHint.walkMin))} min walk to ${alightHint.destinationName}`;
}
