// Bus trip planning in the browser, from the static LTA network (public/bus-routes/network.json).
// Finds direct buses and trips with one change between stops near the start and the destination.
// Times are estimates: straight-line walking with a detour factor, and typical bus speeds.
import type { StopServiceArrivals } from '../types/bus';
import { calculateDistanceMeters } from '../data/singaporeBuses';
import { BusNetwork, NetPattern, NetStop, stopsWithin } from './busNetwork';

export const WALK_M_PER_MIN = 80; // ~4.8 km/h
export const WALK_DETOUR = 1.3; // typical walking route vs straight line
const BUS_KMH = 22; // between stops
const PER_STOP_MIN = 0.35; // dwell and slowing at each stop
const ACCESS_RADII_M = [500, 800]; // walking distance to/from stops; widened if nothing is found
const TRANSFER_RADIUS_M = 200; // changing buses may mean crossing the road
const TRANSFER_WAIT_MIN = 5; // assumed wait for the second bus
const TRANSFER_PENALTY_MIN = 6; // ranking only: people prefer one bus
const MIN_TRANSFER_GAIN_MIN = 8; // only suggest a change if it beats the best direct bus by this much
const ASSUMED_FIRST_WAIT_MIN = 5; // ranking only, until live times arrive
const MAX_DIRECT = 5;
const MAX_TRANSFER = 3;

export const walkMinutesFor = (straightM: number) => (straightM * WALK_DETOUR) / WALK_M_PER_MIN;
export const rideMinutesFor = (distanceM: number, stopCount: number) =>
  (distanceM / 1000 / BUS_KMH) * 60 + stopCount * PER_STOP_MIN;

export interface TripLeg {
  serviceNo: string;
  alsoServiceNos: string[]; // other services between the same two stops (e.g. 159 and 159A)
  direction: number;
  towards: string; // last stop of this direction
  patternIndex: number;
  boardPos: number; // positions within the pattern
  alightPos: number;
  board: NetStop;
  alight: NetStop;
  stopCount: number;
  distanceM: number;
  rideMin: number;
}

export interface TripOption {
  id: string;
  legs: TripLeg[]; // one leg (direct) or two (one change)
  walkStartM: number; // straight-line distances
  walkStartMin: number;
  transferWalkM: number;
  transferWalkMin: number;
  walkEndM: number;
  walkEndMin: number;
  // Walking + riding (+ an assumed wait for a second bus), not counting the wait for the first bus
  travelMin: number;
}

export interface TripPlan {
  options: TripOption[];
  straightDistanceM: number;
  walkOnlyMin: number;
  accessRadiusM: number;
}

interface Point {
  lat: number;
  lng: number;
}

// Ride time from the start of a pattern to position k, so ride(i -> j) = cum(j) - cum(i)
const cumRide = (p: NetPattern, k: number) => rideMinutesFor(p.distM[k], k);

function makeLeg(net: BusNetwork, p: NetPattern, boardPos: number, alightPos: number): TripLeg {
  const distanceM = p.distM[alightPos] - p.distM[boardPos];
  const stopCount = alightPos - boardPos;
  return {
    serviceNo: p.serviceNo,
    alsoServiceNos: [],
    direction: p.direction,
    towards: net.stops[p.stops[p.stops.length - 1]].name,
    patternIndex: p.index,
    boardPos,
    alightPos,
    board: net.stops[p.stops[boardPos]],
    alight: net.stops[p.stops[alightPos]],
    stopCount,
    distanceM,
    rideMin: rideMinutesFor(distanceM, stopCount),
  };
}

function makeOption(legs: TripLeg[], walkStartM: number, transferWalkM: number, walkEndM: number): TripOption {
  const walkStartMin = walkMinutesFor(walkStartM);
  const transferWalkMin = walkMinutesFor(transferWalkM);
  const walkEndMin = walkMinutesFor(walkEndM);
  const ride = legs.reduce((sum, leg) => sum + leg.rideMin, 0);
  return {
    id: legs.map((l) => `${l.serviceNo}:${l.board.code}-${l.alight.code}`).join('|'),
    legs,
    walkStartM,
    walkStartMin,
    transferWalkM,
    transferWalkMin,
    walkEndM,
    walkEndMin,
    travelMin: walkStartMin + ride + walkEndMin + (legs.length > 1 ? transferWalkMin + TRANSFER_WAIT_MIN : 0),
  };
}

const patternsAt = (net: BusNetwork, stops: Map<number, number>) => {
  const set = new Set<number>();
  for (const s of stops.keys()) for (const p of net.patternsAtStop[s]) set.add(p);
  return [...set].map((p) => net.patterns[p]);
};

function findDirect(net: BusNetwork, origin: Map<number, number>, dest: Map<number, number>): TripOption[] {
  const bestByService = new Map<string, TripOption>();
  for (const p of patternsAt(net, origin)) {
    const st = p.stops;
    for (let i = 0; i < st.length - 1; i++) {
      const walkStartM = origin.get(st[i]);
      if (walkStartM === undefined) continue;
      for (let j = i + 1; j < st.length; j++) {
        const walkEndM = dest.get(st[j]);
        if (walkEndM === undefined || st[j] === st[i]) continue;
        const option = makeOption([makeLeg(net, p, i, j)], walkStartM, 0, walkEndM);
        const key = p.serviceNo.toUpperCase();
        const best = bestByService.get(key);
        if (!best || option.travelMin < best.travelMin) bestByService.set(key, option);
      }
    }
  }
  return [...bestByService.values()].sort((a, b) => a.travelMin - b.travelMin);
}

interface FirstLegReach {
  time: number; // walk + ride to this stop
  boardPos: number;
  alightPos: number;
  walkM: number;
}

interface LastLegDepart {
  time: number; // ride from this stop + walk to the destination
  boardPos: number;
  alightPos: number;
  walkM: number;
}

function findTransfers(net: BusNetwork, origin: Map<number, number>, dest: Map<number, number>): TripOption[] {
  // Earliest arrival at every stop reachable on one bus from the start (best boarding stop per pattern)
  const firstLegs = patternsAt(net, origin).map((p) => {
    const reach = new Map<number, FirstLegReach>();
    let bestStart = Infinity;
    let boardPos = -1;
    let walkM = 0;
    for (let k = 0; k < p.stops.length; k++) {
      if (boardPos >= 0 && k > boardPos && p.stops[k] !== p.stops[boardPos]) {
        const time = bestStart + cumRide(p, k);
        const prev = reach.get(p.stops[k]);
        if (!prev || time < prev.time) reach.set(p.stops[k], { time, boardPos, alightPos: k, walkM });
      }
      const w = origin.get(p.stops[k]);
      if (w !== undefined && k < p.stops.length - 1) {
        const start = walkMinutesFor(w) - cumRide(p, k);
        if (start < bestStart) {
          bestStart = start;
          boardPos = k;
          walkM = w;
        }
      }
    }
    return { p, reach };
  });

  // Every stop from which one bus reaches the destination: stop -> [pattern, timing]
  const departAt = new Map<number, { p: NetPattern; d: LastLegDepart }[]>();
  for (const p of patternsAt(net, dest)) {
    let bestEnd = Infinity;
    let alightPos = -1;
    let walkM = 0;
    const seen = new Set<number>();
    for (let k = p.stops.length - 1; k >= 0; k--) {
      if (alightPos >= 0 && k < alightPos && !seen.has(p.stops[k]) && p.stops[k] !== p.stops[alightPos]) {
        seen.add(p.stops[k]);
        const d = { time: bestEnd - cumRide(p, k), boardPos: k, alightPos, walkM };
        const list = departAt.get(p.stops[k]);
        if (list) list.push({ p, d });
        else departAt.set(p.stops[k], [{ p, d }]);
      }
      const w = dest.get(p.stops[k]);
      if (w !== undefined && k > 0) {
        const end = walkMinutesFor(w) + cumRide(p, k);
        if (end < bestEnd) {
          bestEnd = end;
          alightPos = k;
          walkM = w;
        }
      }
    }
  }

  const neighbourCache = new Map<number, { index: number; distanceM: number }[]>();
  const neighbours = (stopIndex: number) => {
    let list = neighbourCache.get(stopIndex);
    if (!list) {
      const s = net.stops[stopIndex];
      list = stopsWithin(net, s.lat, s.lng, TRANSFER_RADIUS_M).map(({ stop, distanceM }) => ({ index: stop.index, distanceM }));
      neighbourCache.set(stopIndex, list);
    }
    return list;
  };

  const best = new Map<string, { score: number; build: () => TripOption }>();
  for (const { p: p1, reach } of firstLegs) {
    for (const [stopK, r1] of reach) {
      for (const { index: stopX, distanceM: transferM } of neighbours(stopK)) {
        const departures = departAt.get(stopX);
        if (!departures) continue;
        for (const { p: p2, d } of departures) {
          if (p2.serviceNo.toUpperCase() === p1.serviceNo.toUpperCase()) continue;
          const score = r1.time + walkMinutesFor(transferM) + d.time;
          const key = `${p1.serviceNo}>${p2.serviceNo}`;
          const prev = best.get(key);
          if (prev && prev.score <= score) continue;
          best.set(key, {
            score,
            build: () =>
              makeOption(
                [makeLeg(net, p1, r1.boardPos, r1.alightPos), makeLeg(net, p2, d.boardPos, d.alightPos)],
                r1.walkM,
                transferM,
                d.walkM
              ),
          });
        }
      }
    }
  }
  return [...best.values()].map((b) => b.build()).sort((a, b) => a.travelMin - b.travelMin);
}

const score = (o: TripOption) => o.travelMin + (o.legs.length - 1) * TRANSFER_PENALTY_MIN;

// Merge options that use the same stops on different services into one ("Bus 50, 159 or 159A");
// expects the fastest first, which becomes the main service
function mergeSameStops(options: TripOption[]): TripOption[] {
  const merged = new Map<string, TripOption>();
  for (const o of options) {
    const key = o.legs.map((l) => `${l.board.code}-${l.alight.code}`).join('|');
    const main = merged.get(key);
    if (!main) {
      merged.set(key, { ...o, legs: o.legs.map((l) => ({ ...l, alsoServiceNos: [...l.alsoServiceNos] })) });
      continue;
    }
    o.legs.forEach((leg, i) => {
      const target = main.legs[i];
      if (leg.serviceNo !== target.serviceNo && !target.alsoServiceNos.includes(leg.serviceNo)) {
        target.alsoServiceNos.push(leg.serviceNo);
      }
    });
  }
  return [...merged.values()];
}

export function planTrips(net: BusNetwork, from: Point, to: Point): TripPlan {
  const straightDistanceM = calculateDistanceMeters(from.lat, from.lng, to.lat, to.lng);
  const walkOnlyMin = walkMinutesFor(straightDistanceM);
  let accessRadiusM = ACCESS_RADII_M[0];

  for (const radius of ACCESS_RADII_M) {
    accessRadiusM = radius;
    const near = (pt: Point) =>
      new Map(stopsWithin(net, pt.lat, pt.lng, radius).map(({ stop, distanceM }) => [stop.index, distanceM]));
    const origin = near(from);
    const dest = near(to);
    if (!origin.size || !dest.size) continue;

    // A bus has to beat walking (with a typical wait) to be worth suggesting
    const worthIt = (o: TripOption) => o.travelMin + ASSUMED_FIRST_WAIT_MIN < walkOnlyMin;
    const direct = mergeSameStops(findDirect(net, origin, dest).filter(worthIt));
    const bestDirect = direct[0]?.travelMin ?? Infinity;

    const perFirstService = new Map<string, number>();
    const transfers = mergeSameStops(findTransfers(net, origin, dest).filter(worthIt))
      .filter((o) => o.travelMin <= bestDirect - MIN_TRANSFER_GAIN_MIN)
      // Keep the suggestions varied: at most two changes starting with the same bus
      .filter((o) => {
        const first = o.legs[0].serviceNo;
        const count = perFirstService.get(first) ?? 0;
        perFirstService.set(first, count + 1);
        return count < 2;
      });

    const options = [...direct.slice(0, MAX_DIRECT), ...transfers.slice(0, direct.length ? 2 : MAX_TRANSFER)];
    // Drop options far slower than the best one
    const bestScore = Math.min(...options.map(score));
    const shortlist = options.filter((o) => score(o) <= bestScore * 1.6 + 10).sort((a, b) => score(a) - score(b));
    if (shortlist.length) return { options: shortlist, straightDistanceM, walkOnlyMin, accessRadiusM };
  }
  return { options: [], straightDistanceM, walkOnlyMin, accessRadiusM };
}

export type AlightAdvice =
  | { status: 'alight'; leg: TripLeg; walkEndM: number; walkEndMin: number }
  | { status: 'not-near'; closest: NetStop; distanceM: number }; // no later stop within walking distance

// Where to get off one bus (service, direction, boarding stop) for a destination: the later stop with the
// least riding + walking, within the planner's walking reach. null when the bus or stop isn't in the
// network, or when walking from the boarding stop would be just as quick.
export function alightFor(net: BusNetwork, serviceNo: string, direction: number, boardCode: string, to: Point): AlightAdvice | null {
  const board = net.byCode.get(boardCode);
  if (!board) return null;
  const svc = serviceNo.toUpperCase();
  const served = net.patternsAtStop[board.index].map((i) => net.patterns[i]).filter((p) => p.serviceNo.toUpperCase() === svc);
  const p = served.find((x) => x.direction === direction) ?? served[0];
  const boardPos = p ? p.stops.indexOf(board.index) : -1;
  if (!p || boardPos < 0 || boardPos >= p.stops.length - 1) return null;

  const later: { pos: number; distanceM: number }[] = [];
  for (let k = boardPos + 1; k < p.stops.length; k++) {
    if (p.stops[k] === board.index) continue; // a loop back to where you got on
    const s = net.stops[p.stops[k]];
    later.push({ pos: k, distanceM: calculateDistanceMeters(s.lat, s.lng, to.lat, to.lng) });
  }
  if (!later.length) return null;

  for (const radius of ACCESS_RADII_M) {
    let best: { pos: number; distanceM: number; time: number } | null = null;
    for (const { pos, distanceM } of later) {
      if (distanceM > radius) continue;
      const time = cumRide(p, pos) - cumRide(p, boardPos) + walkMinutesFor(distanceM);
      if (!best || time < best.time) best = { pos, distanceM, time };
    }
    if (!best) continue;
    const walkFromBoard = walkMinutesFor(calculateDistanceMeters(board.lat, board.lng, to.lat, to.lng));
    if (walkFromBoard <= best.time) return null;
    return {
      status: 'alight',
      leg: makeLeg(net, p, boardPos, best.pos),
      walkEndM: best.distanceM,
      walkEndMin: walkMinutesFor(best.distanceM),
    };
  }
  const closest = later.reduce((a, b) => (b.distanceM < a.distanceM ? b : a));
  return { status: 'not-near', closest: net.stops[p.stops[closest.pos]], distanceM: closest.distanceM };
}

// Live departure for an option's first bus, from LTA BusArrival at its boarding stop
export type LiveDeparture =
  | { status: 'loading' }
  | { status: 'unavailable' } // live feed down
  | { status: 'not-running' } // LTA has no upcoming bus for this service at the stop
  | {
      status: 'live';
      catchEtaMin: number | null; // first bus you can reach after walking to the stop (null: all due too soon)
      catchServiceNo: string;
      monitored: boolean;
      waitMin: number; // at the stop, after walking there
      arriveInMin: number; // estimated arrival at the destination
      nextEtas: number[];
    };

export function liveDeparture(option: TripOption, services: StopServiceArrivals[] | null | undefined): LiveDeparture {
  if (services === undefined) return { status: 'loading' };
  if (services === null) return { status: 'unavailable' };
  const leg = option.legs[0];
  const wanted = new Set([leg.serviceNo, ...leg.alsoServiceNos].map((s) => s.toUpperCase()));
  const buses = services
    .filter((s) => wanted.has(s.serviceNo.toUpperCase()))
    .flatMap((s) =>
      [s.nextBus, s.nextBus2, s.nextBus3].flatMap((b) => (b ? [{ ...b, serviceNo: s.serviceNo }] : []))
    )
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
  if (!buses.length) return { status: 'not-running' };

  // Allow a minute's slack: buses often dwell, and people walk faster when the bus is in sight
  const walk = Math.max(0, Math.round(option.walkStartMin) - 1);
  const catchable = buses.find((b) => b.estimatedMinutes >= walk) ?? null;
  const waitMin = catchable ? Math.max(0, catchable.estimatedMinutes - option.walkStartMin) : ASSUMED_FIRST_WAIT_MIN * 2;
  return {
    status: 'live',
    catchEtaMin: catchable?.estimatedMinutes ?? null,
    catchServiceNo: catchable?.serviceNo ?? leg.serviceNo,
    monitored: !!catchable?.monitored,
    waitMin,
    arriveInMin: option.travelMin + waitMin,
    nextEtas: buses.slice(0, 3).map((b) => b.estimatedMinutes),
  };
}

// Estimated door-to-door minutes, for ranking: live wait when known, otherwise a typical wait
export function expectedTotalMin(option: TripOption, live: LiveDeparture): number {
  if (live.status === 'live') return live.arriveInMin;
  if (live.status === 'not-running') return Infinity;
  return option.travelMin + ASSUMED_FIRST_WAIT_MIN;
}

export const tripScore = (option: TripOption, live: LiveDeparture) =>
  expectedTotalMin(option, live) + (option.legs.length - 1) * TRANSFER_PENALTY_MIN;
