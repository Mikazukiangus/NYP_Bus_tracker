import React from 'react';
import { ArrowRight, BusFront, ChevronRight, Flag, Footprints, Loader2, Map as MapIcon, Route, X } from 'lucide-react';
import type { PlaceResult } from '../services/placeSearch';
import type { LiveDeparture, TripLeg, TripOption, TripPlan } from '../services/tripPlanner';
import { expectedTotalMin } from '../services/tripPlanner';
import { TrackingBadge } from './ArrivalBits';

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
  fromName: string;
  state: TripPlannerState;
  selectedId: string | null;
  canShowMap: boolean;
  onSelect: (option: TripOption) => void;
  onTrackLeg: (leg: TripLeg) => void;
  trackedServiceNo: string;
  trackedStopCode: string;
  onShowMap: () => void;
  onClear: () => void;
}

const round = (min: number) => Math.max(1, Math.round(min));
const formatMetres = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const clockIn = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  });

const ServiceBadge: React.FC<{ leg: TripLeg; size?: 'sm' | 'md' }> = ({ leg, size = 'md' }) => (
  <span className="inline-flex items-baseline gap-1 shrink-0">
    <span
      className={`bg-helvetia text-white font-black rounded-lg text-center ${
        size === 'md' ? 'text-sm px-2 py-0.5 min-w-[2.5rem]' : 'text-xs px-1.5 py-0.5 min-w-[2.25rem]'
      }`}
    >
      {leg.serviceNo}
    </span>
    {leg.alsoServiceNos.length > 0 && (
      <span className="text-[11px] font-semibold text-warm-600">or {leg.alsoServiceNos.join(', ')}</span>
    )}
  </span>
);

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
  const leaveIn = live.catchEtaMin === null ? null : Math.round(live.catchEtaMin - option.walkStartMin);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-warm-700">
        Bus{option.legs[0].alsoServiceNos.length ? 'es' : ''} in{' '}
        {live.nextEtas.map((eta, i) => (
          <React.Fragment key={i}>
            {i > 0 && ', '}
            <strong className={eta === live.catchEtaMin ? 'text-warm-900' : 'font-normal text-warm-500'}>
              {eta <= 0 ? 'Arr' : eta}
            </strong>
          </React.Fragment>
        ))}{' '}
        min
      </span>
      {leaveIn !== null && (
        <span className={`font-bold ${leaveIn <= 1 ? 'text-rose-700' : 'text-green-blue-ink'}`}>
          {leaveIn <= 1 ? 'Leave now' : `Leave in ${leaveIn} min`}
        </span>
      )}
      <TrackingBadge bus={live} compact />
    </span>
  );
}

function TotalTime({ trip }: { trip: RankedTrip }) {
  const { option, live } = trip;
  if (live.status === 'not-running') {
    return <div className="text-right text-xs font-semibold text-warm-500 shrink-0">≈ {round(option.travelMin)} min<br />+ wait</div>;
  }
  const total = expectedTotalMin(option, live);
  return (
    <div className="text-right shrink-0">
      <div className="text-lg font-black text-helvetia-950 leading-none">
        {live.status === 'live' ? '' : '≈ '}
        {round(total)} <span className="text-xs font-bold">min</span>
      </div>
      <div className="text-[11px] text-warm-500 mt-0.5">
        {live.status === 'live' ? `arrive ~${clockIn(total)}` : 'incl. typical wait'}
      </div>
    </div>
  );
}

function Steps({
  option,
  onTrackLeg,
  trackedServiceNo,
  trackedStopCode,
  destinationName,
}: {
  option: TripOption;
  onTrackLeg: (leg: TripLeg) => void;
  trackedServiceNo: string;
  trackedStopCode: string;
  destinationName: string;
}) {
  const walkStep = (minutes: number, metres: number, to: React.ReactNode, key: string) => (
    <li key={key} className="relative pl-8 pb-3">
      <span className="absolute left-0 top-0 w-6 h-6 rounded-full bg-green-blue-soft text-green-blue-ink flex items-center justify-center">
        <Footprints className="w-3.5 h-3.5" />
      </span>
      <div className="text-xs text-warm-700 pt-1">
        Walk ~{round(minutes)} min ({formatMetres(metres)}) to {to}
      </div>
    </li>
  );

  const steps: React.ReactNode[] = [];
  option.legs.forEach((leg, i) => {
    if (i === 0) {
      steps.push(
        walkStep(option.walkStartMin, option.walkStartM, <><strong className="text-warm-900">{leg.board.name}</strong> · {leg.board.code}</>, 'walk-start')
      );
    } else if (option.transferWalkM > 0) {
      steps.push(
        walkStep(option.transferWalkMin, option.transferWalkM, <><strong className="text-warm-900">{leg.board.name}</strong> · {leg.board.code} to change buses</>, `walk-${i}`)
      );
    }
    const isTracked =
      trackedServiceNo.toUpperCase() === leg.serviceNo.toUpperCase() && trackedStopCode === leg.board.code;
    steps.push(
      <li key={`leg-${i}`} className="relative pl-8 pb-3">
        <span className="absolute left-0 top-0 w-6 h-6 rounded-full bg-helvetia text-white flex items-center justify-center">
          <BusFront className="w-3.5 h-3.5" />
        </span>
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs text-warm-700 min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
              {i > 0 && option.transferWalkM === 0 && <span className="text-warm-600">Change at the same stop to</span>}
              <ServiceBadge leg={leg} size="sm" />
              <span className="text-warm-600">towards {leg.towards}</span>
            </div>
            <div>
              Ride {leg.stopCount} stop{leg.stopCount === 1 ? '' : 's'} · {formatMetres(leg.distanceM)} · ~{round(leg.rideMin)} min
              {i > 0 && <span className="text-warm-500"> (+ ~5 min wait)</span>}
            </div>
            <div>
              Get off at <strong className="text-warm-900">{leg.alight.name}</strong> · {leg.alight.code}
            </div>
          </div>
          {isTracked ? (
            <span className="text-[11px] font-bold text-green-blue-ink bg-green-blue-soft px-2 py-1 rounded-lg shrink-0">
              Tracking
            </span>
          ) : (
            <button
              onClick={() => onTrackLeg(leg)}
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
        Walk ~{round(option.walkEndMin)} min ({formatMetres(option.walkEndM)}) to{' '}
        <strong className="text-warm-900">{destinationName}</strong>
      </div>
    </li>
  );
  return (
    <ol className="relative mt-3 pt-3 border-t border-helvetia-100 before:absolute before:left-3 before:top-4 before:bottom-3 before:w-px before:bg-warm-200">
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
  trackedServiceNo,
  trackedStopCode,
  onShowMap,
  onClear,
}) => {
  const plan = state.status === 'ready' ? state.plan : null;

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
              From {fromName.split('(')[0].trim()}
              {plan && ` · ${formatMetres(plan.straightDistanceM)} away`}
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
          <ul className="mt-3 space-y-2">
            {state.trips.map((trip) => {
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
                      className="w-full text-left p-3 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {legs.map((leg, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <ArrowRight className="w-3.5 h-3.5 text-warm-400" />}
                              <ServiceBadge leg={leg} />
                            </React.Fragment>
                          ))}
                          <span className="text-[11px] font-semibold text-warm-500 ml-1">
                            {legs.length === 1 ? 'Direct' : `1 change at ${legs[1].board.name}`}
                          </span>
                        </div>
                        <div className="text-xs text-warm-600 flex flex-wrap items-center gap-x-1.5">
                          <span className="inline-flex items-center gap-0.5">
                            <Footprints className="w-3 h-3" /> {round(option.walkStartMin)} min
                          </span>
                          <span className="text-warm-300">·</span>
                          <span>
                            board at <strong className="text-warm-800">{legs[0].board.name}</strong>
                          </span>
                          <span className="text-warm-300">·</span>
                          <span>{legs.reduce((n, l) => n + l.stopCount, 0)} stops</span>
                        </div>
                        <div className="text-xs">
                          <LiveLine trip={trip} />
                        </div>
                      </div>
                      <TotalTime trip={trip} />
                    </button>
                    {selected && (
                      <div className="px-3 pb-3">
                        <Steps
                          option={option}
                          onTrackLeg={onTrackLeg}
                          trackedServiceNo={trackedServiceNo}
                          trackedStopCode={trackedStopCode}
                          destinationName={destination.name}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-warm-500 leading-relaxed">
            Estimates: walking is straight-line distance +30% at 4.8 km/h; riding uses typical bus speeds. Next-bus times
            are live from LTA. Up to one change; MRT is not included.
          </p>
        </>
      )}
    </section>
  );
};
