import type { ArrivalDataSource, RouteDirection, StopServiceArrivals } from '../../types/bus';
import { liveDeparture, tripScore, type TripOption, type TripPlan } from '../../services/tripPlanner';
import type { RankedTrip } from './model';
interface RankInputs {
  tripPlan: TripPlan | null;
  selectedStop: { code: string };
  dataSource: ArrivalDataSource;
  stopServices: StopServiceArrivals[] | null;
  tripArrivals: Record<string, StopServiceArrivals[] | null | undefined>;
}
export function rankTrips({ tripPlan, selectedStop: { code: stopCode }, dataSource, stopServices, tripArrivals }: RankInputs): RankedTrip[] {
  if (!tripPlan) return [];
  const arrivalsAt = (code: string) =>
    code === stopCode && dataSource === 'LTA_DATAMALL_V3' && stopServices ? stopServices : tripArrivals[code];
  const ranked = tripPlan.options.map((option) => ({
    option,
    live: liveDeparture(option, arrivalsAt(option.legs[0].board.code)),
  }));
  return ranked.sort((a, b) => {
    const diff = tripScore(a.option, a.live) - tripScore(b.option, b.live);
    return Number.isNaN(diff) ? 0 : diff;
  });
}

export function trackedLegIndex(option: TripOption, serviceNo: string, routeDir: RouteDirection, stopCode: string): number {
  const svc = serviceNo.toUpperCase();
  const boardIndex = routeDir.stops.findIndex((s) => s.code === stopCode);
  return option.legs.findIndex(
    (leg) =>
      leg.board.code === stopCode &&
      [leg.serviceNo, ...leg.alsoServiceNos].some((s) => s.toUpperCase() === svc) &&
      routeDir.stops.some((s, i) => i > boardIndex && s.code === leg.alight.code)
  );
}
