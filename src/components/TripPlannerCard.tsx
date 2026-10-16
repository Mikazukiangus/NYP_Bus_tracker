import React, { useState } from 'react';
import { BusFront, Check, ChevronDown, ChevronRight, Flag, Footprints, Loader2, Map as MapIcon, Route, X } from 'lucide-react';
import type { PlaceResult } from '../services/placeSearch';
import type { LiveDeparture, TripLeg, TripOption, TripPlan, TripTimeline } from '../services/tripPlanner';
import { expectedTotalMin, legServiceNos, tripTimeline } from '../services/tripPlanner';
import { useIsPhone } from '../services/useIsPhone';
import { leaveLabel } from '../services/leaveWithin';
import { LiveSignal, Minutes } from './ArrivalBits';
import { ServiceChoice } from './ServiceChoice';
import { legStyle } from './tripLegs';

export interface RankedTrip {
  option: TripOption;
  live: LiveDeparture;
}

export type TripPlannerState =
  | { status: 'loading' } // bus network still downloading
  | { status: 'unavailable' }
  | { status: 'ready'; plan: TripPlan; trips: RankedTrip[] };

interface TripPlannerCardProps {
  destination: PlaceResult;
  fromName?: string; // left out where the "From" field is right above
  state: TripPlannerState;
  selectedId: string | null;
  canShowMap: boolean;
  onSelect: (option: TripOption) => void;
  onTrackLeg: (option: TripOption, legIndex: number) => void;
  onChooseService: (option: TripOption, legIndex: number, serviceNo: string) => void;
  notDueAt: (leg: TripLeg) => string[]; // buses between a leg's stops with none due now
  trackedServiceNo: string;
  trackedStopCode: string;
  onShowMap: () => void;
  onClear: () => void;
}

// Trips listed before "Show more" on phones (the chosen trip is always shown)
const PHONE_TRIPS = 2;
const ESTIMATES_NOTE =
  'Walking is straight-line distance +30% at 4.8 km/h; riding uses typical bus speeds. Next-bus times are live from LTA. Up to one change; MRT is not included.';

const round = (min: number) => Math.max(1, Math.round(min));
const formatMetres = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const clockIn = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  });
// "10:25", for the time axis and the steps
const clockShort = (minutes: number) => clockIn(minutes).replace(/\s*[ap]\.?m\.?$/i, '');
// Closer than this, a walk is no walk (as on the arrivals card)
const AT_STOP_M = 50;

// A leg's bus, or every bus between the same stops with the chosen one filled in (in the leg's colour, as on the
// trip bar and the map)
const LegServices: React.FC<{ leg: TripLeg; legIndex: number; notDue: string[]; onChoose?: (serviceNo: string) => void }> = ({
  leg,
  legIndex,
  notDue,
  onChoose,
}) => (
  <ServiceChoice
    serviceNos={legServiceNos(leg)}
    chosen={leg.serviceNo}
    notDue={notDue}
    onChoose={onChoose}
    chosenClassName={legStyle(legIndex).badge}
    size="fit"
    label={`Buses from ${leg.board.name} to ${leg.alight.name}`}
  />
);

// Transit's trip bars: every trip drawn to the same time scale, starting when you'd set off, so the quickest trip
// and the one to leave for first show at a glance. A walk is the walker and its minutes on a dotted line, a wait a
// thin line, and a bus a pill in the trip's colour for it (as on the map), with any other bus between the same stops
// above it ("or 72A").
function TripBar({ option, timeline, scaleMin, faded }: { option: TripOption; timeline: TripTimeline; scaleMin: number; faded: boolean }) {
  const pct = (min: number) => `${(min / scaleMin) * 100}%`;
  const hasOthers = option.legs.some((leg) => legServiceNos(leg).length > 1);
  return (
    <div
      className={`col-span-2 flex items-center h-6 ${hasOthers ? 'mt-3' : ''} ${faded ? 'opacity-50' : ''}`}
      style={{ marginLeft: pct(timeline.goMin), width: pct(timeline.endMin - timeline.goMin) }}
      aria-hidden="true"
    >
      {timeline.segments.map((seg, i) => {
        const grow = { flexGrow: seg.endMin - seg.startMin, flexBasis: 0 };
        if (seg.kind === 'bus') {
          const leg = option.legs[seg.legIndex];
          const others = legServiceNos(leg).filter((no) => no !== leg.serviceNo);
          return (
            <span
              key={i}
              style={grow}
              className={`relative h-6 min-w-[2.25rem] px-1.5 rounded-full flex items-center justify-center text-xs font-black ${legStyle(seg.legIndex).badge}`}
            >
              {leg.serviceNo}
              {others.length > 0 && (
                <span className="absolute -top-3.5 left-1 text-[9px] font-bold text-warm-500 whitespace-nowrap">
                  or {others.join(', ')}
                </span>
              )}
            </span>
          );
        }
        if (seg.kind === 'walk') {
          return (
            <span key={i} style={grow} className="min-w-[1.75rem] flex items-center px-0.5 text-warm-600">
              <Footprints className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[10px] font-bold leading-none">{round(seg.endMin - seg.startMin)}</span>
              <span className="flex-1 min-w-0 ml-0.5 border-t-2 border-dotted border-warm-300" />
            </span>
          );
        }
        return <span key={i} style={grow} className="min-w-[3px] mx-0.5 h-0.5 rounded-full bg-warm-300" />;
      })}
    </div>
  );
}

// Clock times over the trip bars (every 5, 10, 15 or 30 minutes, to suit the longest trip)
function TimeAxis({ scaleMin }: { scaleMin: number }) {
  const step = scaleMin <= 20 ? 5 : scaleMin <= 45 ? 10 : scaleMin <= 100 ? 15 : 30;
  const sgt = new Date(Date.now() + 8 * 3_600_000);
  const nowOfDay = sgt.getUTCHours() * 60 + sgt.getUTCMinutes() + sgt.getUTCSeconds() / 60;
  const ticks: number[] = [];
  for (let at = Math.ceil(nowOfDay / step) * step - nowOfDay; at <= scaleMin; at += step) {
    if (at / scaleMin >= 0.12 && at / scaleMin <= 0.94) ticks.push(at); // clear of "Now" and the right edge
  }
  return (
    <div className="relative h-5 mx-[13px] mt-3 -mb-1" aria-hidden="true">
      <span className="absolute top-0 left-0 flex flex-col items-start text-[10px] font-bold text-helvetia-950">
        Now
        <span className="w-px h-1.5 bg-helvetia-950" />
      </span>
      {ticks.map((at) => (
        <span
          key={at}
          className="absolute top-0 -translate-x-1/2 flex flex-col items-center text-[10px] font-semibold text-warm-500 tabular-nums"
          style={{ left: `${(at / scaleMin) * 100}%` }}
        >
          {clockShort(at)}
          <span className="w-px h-1.5 bg-warm-300" />
        </span>
      ))}
    </div>
  );
}

// "Leave within 6 min", and the next buses at the first stop
function LiveLine({ trip }: { trip: RankedTrip }) {
  const { option, live } = trip;
  if (live.status === 'loading') {
    return (
      <span className="flex items-center gap-1.5 text-warm-500">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking live bus times…
      </span>
    );
  }
  if (live.status === 'unavailable') return <span className="text-warm-500">Live bus times unavailable · typical wait assumed</span>;
  if (live.status === 'not-running') {
    return <span className="text-rose-700 font-semibold">No bus due at {option.legs[0].board.name} now (may not be running)</span>;
  }
  // Worked out as on the arrivals card, so the two agree for the same bus. When that's another of the buses between
  // the same stops than the one picked, say which.
  const leave = leaveLabel(live.leave);
  const otherBus = live.catchServiceNo.toUpperCase() !== option.legs[0].serviceNo.toUpperCase();
  // With more than one bus to choose from, say which bus each time is for
  const severalServices = new Set(live.nextBuses.map((b) => b.serviceNo)).size > 1;
  const caught = live.nextBuses.findIndex((b) => b.etaMin === live.catchEtaMin);
  return (
    <span className="block leading-snug">
      {leave && (
        <strong className={`block text-sm font-black ${leave === 'Leave now' ? 'text-rose-700' : 'text-helvetia-950'}`}>
          {leave}
          {otherBus && ` for the ${live.catchServiceNo}`}
        </strong>
      )}
      <span className="text-warm-600">
        {severalServices ? 'Next ' : `Bus${option.legs[0].alsoServiceNos.length ? 'es' : ''} in `}
        {live.nextBuses.map((bus, i) => (
          <React.Fragment key={i}>
            {i > 0 && ', '}
            {severalServices && <span className="font-semibold">{bus.serviceNo} in </span>}
            <span className={i === caught ? 'font-bold text-warm-900' : ''}>{bus.etaMin <= 0 ? 'Arr' : bus.etaMin}</span>
          </React.Fragment>
        ))}
        {'\u00a0'}min
      </span>
      {live.monitored && <LiveSignal className="inline w-3 h-3 ml-1 -mt-1 text-green-blue" title="Live GPS" />}
    </span>
  );
}

// Door to door, big on the right: live when the next bus is GPS-tracked
function TotalTime({ trip }: { trip: RankedTrip }) {
  const { option, live } = trip;
  if (live.status === 'not-running') {
    return <div className="text-right text-xs font-semibold text-warm-500 shrink-0">≈ {round(option.travelMin)} min<br />+ wait</div>;
  }
  return (
    <div className="text-right shrink-0 text-helvetia-950">
      {live.status !== 'live' && <span className="text-sm font-bold mr-0.5">≈</span>}
      <Minutes min={round(expectedTotalMin(option, live))} signal={live.status === 'live' && live.monitored ? 'live' : undefined} size="md" />
    </div>
  );
}

// When you'd get there, on the right under the total
function ArriveAt({ trip }: { trip: RankedTrip }) {
  const { option, live } = trip;
  if (live.status === 'not-running') return null;
  return (
    <span className="text-[11px] text-warm-600 text-right whitespace-nowrap">
      {live.status === 'live' ? (
        <>
          Arrive <strong className="text-warm-900">{clockIn(expectedTotalMin(option, live))}</strong>
        </>
      ) : (
        'incl. typical wait'
      )}
    </span>
  );
}

function Steps({
  option,
  onTrackLeg,
  onChooseService,
  notDueAt,
  trackedServiceNo,
  trackedStopCode,
  destinationName,
  timeline,
  divided = true,
}: {
  option: TripOption;
  timeline: TripTimeline; // for the clock time at each place
  onTrackLeg: (option: TripOption, legIndex: number) => void;
  onChooseService: (option: TripOption, legIndex: number, serviceNo: string) => void;
  notDueAt: (leg: TripLeg) => string[];
  trackedServiceNo: string;
  trackedStopCode: string;
  destinationName: string;
  divided?: boolean; // a line above the steps (off when the "Show steps" button already has one)
}) {
  // Google Maps' itinerary: the clock time at each place (~ when it assumes a typical wait, not live times)
  const at = (min: number) => (
    <time className="font-black text-helvetia-950 tabular-nums mr-1.5">
      {timeline.estimated ? '~' : ''}
      {clockShort(min)}
    </time>
  );
  const walkStep = (minutes: number, metres: number, to: React.ReactNode, key: string, startMin?: number) => (
    <li key={key} className="relative pl-8 pb-3">
      <span className="absolute left-0 top-0 w-6 h-6 rounded-full bg-green-blue-soft text-green-blue-ink flex items-center justify-center">
        <Footprints className="w-3.5 h-3.5" />
      </span>
      <div className="text-xs text-warm-700 pt-1">
        {startMin !== undefined && at(startMin)}
        Walk ~{round(minutes)} min ({formatMetres(metres)}) to {to}
      </div>
    </li>
  );

  const steps: React.ReactNode[] = [];
  option.legs.forEach((leg, i) => {
    if (i === 0) {
      const stop = <><strong className="text-warm-900">{leg.board.name}</strong> · {leg.board.code}</>;
      steps.push(
        option.walkStartM > AT_STOP_M ? (
          walkStep(option.walkStartMin, option.walkStartM, stop, 'walk-start', timeline.goMin)
        ) : (
          <li key="walk-start" className="relative pl-8 pb-3">
            <span className="absolute left-0 top-0 w-6 h-6 rounded-full bg-green-blue-soft text-green-blue-ink flex items-center justify-center">
              <Footprints className="w-3.5 h-3.5" />
            </span>
            <div className="text-xs text-warm-700 pt-1">
              {at(timeline.goMin)}
              You're at {stop}
            </div>
          </li>
        )
      );
    } else if (option.transferWalkM > 0) {
      steps.push(
        walkStep(option.transferWalkMin, option.transferWalkM, <><strong className="text-warm-900">{leg.board.name}</strong> · {leg.board.code} to change buses</>, `walk-${i}`)
      );
    }
    const notDue = notDueAt(leg);
    const isTracked =
      trackedServiceNo.toUpperCase() === leg.serviceNo.toUpperCase() && trackedStopCode === leg.board.code;
    steps.push(
      <li key={`leg-${i}`} className="relative pl-8 pb-3">
        {/* Same colour as this bus's line on the map */}
        <span className={`absolute left-0 top-0 w-6 h-6 rounded-full ring-2 ring-helvetia-950 flex items-center justify-center ${legStyle(i).icon}`}>
          <BusFront className="w-3.5 h-3.5" />
        </span>
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs text-warm-700 min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
              {at(timeline.boardMin[i])}
              {i > 0 && option.transferWalkM === 0 && <span className="text-warm-600">Change at the same stop to</span>}
              <LegServices leg={leg} legIndex={i} notDue={notDue} onChoose={(serviceNo) => onChooseService(option, i, serviceNo)} />
              <span className="text-warm-600">towards {leg.towards}</span>
            </div>
            {leg.alsoServiceNos.length > 0 && (
              <div className="text-[11px] text-warm-500">
                {leg.alsoServiceNos.length === 1 ? 'Both buses go' : 'All these buses go'} between these stops. Tap a
                number to take that bus.{notDue.length > 0 && ' Greyed-out numbers have no bus due now.'}
              </div>
            )}
            <div>
              Ride {leg.stopCount} stop{leg.stopCount === 1 ? '' : 's'} · {formatMetres(leg.distanceM)} · ~{round(leg.rideMin)} min
              {i > 0 && <span className="text-warm-500"> (+ ~5 min wait)</span>}
            </div>
            <div>
              {at(timeline.boardMin[i] + leg.rideMin)}
              Get off at <strong className="text-warm-900">{leg.alight.name}</strong> · {leg.alight.code}
            </div>
          </div>
          {isTracked ? (
            <span className="text-[11px] font-bold text-green-blue-ink bg-green-blue-soft px-2 py-1 rounded-lg shrink-0">
              Tracking
            </span>
          ) : (
            <button
              onClick={() => onTrackLeg(option, i)}
              className="text-[11px] font-bold text-helvetia bg-white border border-helvetia-200 hover:bg-helvetia-50 px-2 py-1 rounded-lg shrink-0 flex items-center gap-0.5"
            >
              Live times <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </li>
    );
  });
  steps.push(
    <li key="end" className="relative pl-8">
      <span className="absolute left-0 top-0 w-6 h-6 rounded-full bg-lemon text-helvetia-950 flex items-center justify-center">
        <Flag className="w-3.5 h-3.5" />
      </span>
      <div className="text-xs text-warm-700 pt-1">
        {at(timeline.endMin)}
        <strong className="text-warm-900">{destinationName}</strong>
        {option.walkEndM > AT_STOP_M && (
          <span className="block text-warm-600">
            after a ~{round(option.walkEndMin)} min walk ({formatMetres(option.walkEndM)})
          </span>
        )}
      </div>
    </li>
  );
  return (
    <ol
      className={`relative before:absolute before:left-3 before:bottom-3 before:w-px before:bg-warm-200 ${
        divided ? 'mt-3 pt-3 border-t border-helvetia-100 before:top-4' : 'pt-1 before:top-2'
      }`}
    >
      {steps}
    </ol>
  );
}

export const TripPlannerCard: React.FC<TripPlannerCardProps> = ({
  destination,
  fromName,
  state,
  selectedId,
  canShowMap,
  onSelect,
  onTrackLeg,
  onChooseService,
  notDueAt,
  trackedServiceNo,
  trackedStopCode,
  onShowMap,
  onClear,
}) => {
  const plan = state.status === 'ready' ? state.plan : null;
  // On phones the steps and the extra trips start folded away, so the live times below are a shorter scroll
  const isPhone = useIsPhone();
  const [stepsOpen, setStepsOpen] = useState(false);
  const [allTrips, setAllTrips] = useState(false);
  const showSteps = !isPhone || stepsOpen;
  const trips = state.status === 'ready' ? state.trips : [];
  const shownTrips =
    isPhone && !allTrips ? trips.filter((t, i) => i < PHONE_TRIPS || t.option.id === selectedId) : trips;
  // Each trip in time, and one scale for all the bars shown (the latest arrival)
  const timelines = new Map(shownTrips.map((t) => [t.option.id, tripTimeline(t.option, t.live)]));
  const scaleMin = Math.max(10, ...[...timelines.values()].map((tl) => tl.endMin));

  return (
    <section
      aria-label={`Bus trips to ${destination.name}`}
      className="@container bg-white rounded-2xl border border-warm-200 shadow-sm p-3.5 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-warm-100">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-lemon text-helvetia-950 flex items-center justify-center shrink-0">
            <Route className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-helvetia-950 truncate">Buses to {destination.name}</h3>
            <p className="text-xs text-warm-500 truncate">
              {[fromName && `From ${fromName.split('(')[0].trim()}`, plan && `${formatMetres(plan.straightDistanceM)} away`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canShowMap && (
            <button
              onClick={onShowMap}
              className="px-2.5 py-1.5 bg-lemon hover:bg-lemon-hover text-helvetia-950 rounded-lg text-xs font-bold flex items-center gap-1.5"
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>
          )}
          <button
            onClick={onClear}
            aria-label="Clear destination"
            className="p-1.5 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-warm-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="mt-3 space-y-2 animate-pulse" aria-label="Loading bus network">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-warm-100 rounded-xl" />
          ))}
        </div>
      )}

      {state.status === 'unavailable' && (
        <p className="mt-3 text-xs text-warm-600">
          Trip planning isn't available right now because the bus network data couldn't be loaded. You can still track a
          bus by its number.
        </p>
      )}

      {state.status === 'ready' && state.trips.length === 0 && (
        <p className="mt-3 text-xs text-warm-600">
          {state.plan.walkOnlyMin <= 20 ? (
            <>
              It's only about <strong>{round(state.plan.walkOnlyMin)} min on foot</strong> ({formatMetres(state.plan.straightDistanceM)}{' '}
              straight line), quicker than waiting for a bus.
            </>
          ) : (
            <>
              No bus trip with at most one change was found. Both places need a bus stop within{' '}
              {formatMetres(state.plan.accessRadiusM)}. Try a nearby MRT station or landmark instead.
            </>
          )}
        </p>
      )}

      {state.status === 'ready' && state.trips.length > 0 && (
        <>
          <TimeAxis scaleMin={scaleMin} />
          <ul className="mt-1 space-y-2">
            {shownTrips.map((trip) => {
              const { option } = trip;
              const selected = option.id === selectedId;
              const legs = option.legs;
              return (
                <li key={option.id}>
                  <div
                    className={`rounded-xl border transition-colors ${
                      selected ? 'border-helvetia bg-helvetia-50/60 ring-1 ring-helvetia' : 'border-warm-200 bg-white hover:bg-warm-50'
                    }`}
                  >
                    <button
                      onClick={() => onSelect(option)}
                      aria-pressed={selected}
                      className="w-full text-left p-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2"
                    >
                      {/* Transit's trip bar on top, then Citymapper's row: when to leave and the next buses, the total
                          and when you'd arrive, and where to board */}
                      <TripBar
                        option={option}
                        timeline={timelines.get(option.id)!}
                        scaleMin={scaleMin}
                        faded={trip.live.status === 'not-running'}
                      />
                      <div className="text-xs min-w-0">
                        <LiveLine trip={trip} />
                      </div>
                      <span className="flex flex-col items-end gap-0.5">
                        <TotalTime trip={trip} />
                        <ArriveAt trip={trip} />
                      </span>
                      <div className="col-span-2 flex items-center justify-between gap-2 text-[11px] text-warm-500">
                        <span className="min-w-0">
                          Board at <strong className="text-warm-800">{legs[0].board.name}</strong> ·{' '}
                          {legs.reduce((n, l) => n + l.stopCount, 0)}&nbsp;stops ·{' '}
                          {legs.length === 1 ? 'direct' : `change at ${legs[1].board.name}`}
                        </span>
                        {/* Which trip the app is following, and that the others can be picked */}
                        {selected ? (
                          <span className="shrink-0 inline-flex items-center gap-1 font-bold text-helvetia">
                            <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
                            Selected
                          </span>
                        ) : (
                          <span className="shrink-0 inline-flex items-center font-bold text-helvetia" aria-hidden="true">
                            Choose
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </button>
                    {selected && isPhone && (
                      <button
                        onClick={() => setStepsOpen((open) => !open)}
                        aria-expanded={stepsOpen}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 border-t border-helvetia-100 text-xs font-semibold text-helvetia"
                      >
                        {stepsOpen ? 'Hide steps' : 'Show steps and where to get off'}
                        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${stepsOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                    {selected && showSteps && (
                      <div className="px-3 pb-3">
                        <Steps
                          option={option}
                          onTrackLeg={onTrackLeg}
                          onChooseService={onChooseService}
                          notDueAt={notDueAt}
                          trackedServiceNo={trackedServiceNo}
                          trackedStopCode={trackedStopCode}
                          destinationName={destination.name}
                          timeline={timelines.get(option.id)!}
                          divided={!isPhone}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {shownTrips.length < trips.length && (
            <button
              onClick={() => setAllTrips(true)}
              className="mt-2 text-xs font-semibold text-helvetia hover:underline flex items-center gap-1"
            >
              Show {trips.length - shownTrips.length} more trip{trips.length - shownTrips.length === 1 ? '' : 's'}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {isPhone ? (
            <details className="mt-2 text-[11px] text-warm-500">
              <summary className="cursor-pointer font-semibold py-1">How times are estimated</summary>
              <p className="leading-relaxed">{ESTIMATES_NOTE}</p>
            </details>
          ) : (
            <p className="mt-3 text-[11px] text-warm-500 leading-relaxed">Estimates: {ESTIMATES_NOTE.charAt(0).toLowerCase() + ESTIMATES_NOTE.slice(1)}</p>
          )}
        </>
      )}
    </section>
  );
};
