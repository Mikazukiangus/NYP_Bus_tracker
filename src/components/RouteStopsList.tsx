import React, { useEffect, useRef, useState } from 'react';
import { AlightHint, BusStop, BusRoute } from '../types/bus';
import { Search, ChevronRight, ChevronDown, Check, Flag, ArrowLeftRight, ArrowRight } from 'lucide-react';
import { TripLegView, legStyle, tripLegs } from './tripLegs';

interface RouteStopsListProps {
  route: BusRoute;
  direction: number;
  nearestStop: BusStop;
  selectedStop: BusStop;
  onSelectStop: (stop: BusStop) => void;
  stopsWithDistance: (BusStop & { distanceMeters: number })[];
  alight?: AlightHint | null; // where to get off for the destination in "Where to?"
  onTrackLeg?: (legIndex: number) => void; // show another bus of the trip
}

const minutes = (min: number) => Math.max(1, Math.round(min));

const ServiceChip: React.FC<{ serviceNo: string; legIndex: number }> = ({ serviceNo, legIndex }) => (
  <span className={`${legStyle(legIndex).badge} font-black text-[11px] px-1.5 py-px rounded`}>{serviceNo}</span>
);

// The bus after a change, shown under the stop where you change: where to board it, the stops it rides
// (folded) and where to get off
const NextLegBlock: React.FC<{
  leg: TripLegView;
  legIndex: number;
  fromStopName: string;
  transferWalkM: number;
  transferWalkMin: number;
  destinationName: string;
  walkEndMin: number;
  onShow?: () => void;
}> = ({ leg, legIndex, fromStopName, transferWalkM, transferWalkMin, destinationName, walkEndMin, onShow }) => {
  const [showAll, setShowAll] = useState(false);
  const style = legStyle(legIndex);
  const between = leg.stops.slice(1, -1);
  const stopRow = (stop: TripLegView['stops'][number], extra: React.ReactNode, icon: React.ReactNode) => (
    <li key={stop.code} className="flex items-start gap-2">
      {icon}
      <span className="min-w-0">
        <span className="font-semibold text-warm-900">{stop.name}</span>{' '}
        <span className="font-mono text-[11px] text-warm-500">{stop.code}</span>
        {extra && <span className="block text-warm-600">{extra}</span>}
      </span>
    </li>
  );
  const dot = <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${style.icon}`} />;

  return (
    <div className={`my-1.5 ml-3 pl-3 pr-2 py-2 border-l-4 ${style.border} ${style.soft} rounded-r-xl`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-warm-700 flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">Then</span>
          <ServiceChip serviceNo={leg.serviceNo} legIndex={legIndex} />
          {leg.alsoServiceNos.length > 0 && <span className="font-semibold">or {leg.alsoServiceNos.join(', ')}</span>}
          <span>
            towards {leg.towards} · {leg.stops.length - 1}&nbsp;stops · ~{minutes(leg.rideMin)}&nbsp;min
          </span>
        </p>
        {onShow && (
          <button
            type="button"
            onClick={onShow}
            className="text-[11px] font-bold text-helvetia bg-white border border-helvetia-200 hover:bg-helvetia-50 px-2 py-1 rounded-lg flex items-center gap-0.5 shrink-0"
          >
            Bus {leg.serviceNo} stops &amp; times <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <ol className="mt-2 space-y-1.5 text-xs">
        {stopRow(
          leg.board,
          transferWalkM > 0 ? `Walk ~${minutes(transferWalkMin)} min from ${fromStopName} to board` : 'Board at the same stop',
          dot
        )}
        {between.length > 0 &&
          (showAll ? (
            between.map((stop) => stopRow(stop, null, <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 bg-white border-2 border-warm-300" />))
          ) : (
            <li>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="ml-[18px] text-[11px] font-semibold text-helvetia hover:underline flex items-center gap-0.5"
              >
                {between.length} stop{between.length === 1 ? '' : 's'} in between <ChevronDown className="w-3 h-3" />
              </button>
            </li>
          ))}
        {stopRow(
          leg.alight,
          `Get off for ${destinationName} · walk ~${minutes(walkEndMin)} min`,
          <span className="w-5 h-5 -ml-[5px] -mt-0.5 rounded-full bg-helvetia-950 text-lemon flex items-center justify-center shrink-0">
            <Flag className="w-3 h-3" aria-label="Get off here" />
          </span>
        )}
      </ol>
    </div>
  );
};

// The bus before a change, shown above the stop where you board this one
const PrevLegBlock: React.FC<{ leg: TripLegView; legIndex: number; onShow?: () => void }> = ({ leg, legIndex, onShow }) => (
  <div className={`my-1.5 ml-3 pl-3 pr-2 py-2 border-l-4 ${legStyle(legIndex).border} ${legStyle(legIndex).soft} rounded-r-xl flex flex-wrap items-center justify-between gap-2`}>
    <p className="text-xs text-warm-700 flex flex-wrap items-center gap-1.5">
      <span className="font-semibold">First</span>
      <ServiceChip serviceNo={leg.serviceNo} legIndex={legIndex} />
      <span>
        from <strong className="text-warm-900">{leg.board.name}</strong> · {leg.stops.length - 1}&nbsp;stops · get off at{' '}
        <strong className="text-warm-900">{leg.alight.name}</strong>
      </span>
    </p>
    {onShow && (
      <button
        type="button"
        onClick={onShow}
        className="text-[11px] font-bold text-helvetia bg-white border border-helvetia-200 hover:bg-helvetia-50 px-2 py-1 rounded-lg flex items-center gap-0.5 shrink-0"
      >
        Bus {leg.serviceNo} stops &amp; times <ChevronRight className="w-3 h-3" />
      </button>
    )}
  </div>
);

export const RouteStopsList: React.FC<RouteStopsListProps> = ({
  route,
  direction,
  nearestStop,
  selectedStop,
  onSelectStop,
  stopsWithDistance,
  alight = null,
  onTrackLeg,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const alightRowRef = useRef<HTMLButtonElement>(null);
  const { trip, prev, next } = tripLegs(alight);
  const legIndex = trip?.legIndex ?? 0;
  const style = legStyle(legIndex);

  const routeDir = direction === 2 && route.direction2 ? route.direction2 : route.direction1;

  // Keep each stop's position on the route so numbering stays right while filtering
  const filteredStops = stopsWithDistance.map((s, i) => ({ ...s, sequence: i + 1 })).filter(
    (s) =>
      s.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      s.code.includes(filterQuery) ||
      s.road.toLowerCase().includes(filterQuery.toLowerCase())
  );

  // Positions (1-based) of the boarding stop and the stop to get off at; the stops between are ridden
  const boardSeq = stopsWithDistance.findIndex((s) => s.code === selectedStop.code) + 1;
  const alightSeq =
    alight?.status === 'alight'
      ? stopsWithDistance.findIndex((s, i) => i + 1 > boardSeq && s.code === alight.stop.code) + 1
      : 0;
  const showingTrip = alightSeq > 0 && !filterQuery;

  // Scroll the list (not the page) to the stop to get off at
  const showAlightStop = () => {
    setFilterQuery('');
    requestAnimationFrame(() => {
      const list = listRef.current;
      const row = alightRowRef.current;
      if (!list || !row) return;
      const offset = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
      list.scrollTo({ top: list.scrollTop + offset - list.clientHeight / 2 + row.clientHeight / 2, behavior: 'smooth' });
    });
  };

  // Switching to another bus of a trip shows where you board it
  const boardRowRef = useRef<HTMLButtonElement>(null);
  const tripLegKey = trip ? `${trip.id}:${trip.legIndex}` : '';
  useEffect(() => {
    const list = listRef.current;
    const row = boardRowRef.current;
    if (!tripLegKey || !list || !row) return;
    const offset = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTo({ top: list.scrollTop + offset - 90 });
  }, [tripLegKey]);

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  return (
    <div className="bg-white rounded-2xl border border-warm-200 shadow-sm p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-warm-100">
        <div>
          <h3 className="text-base font-bold text-helvetia">
            Route Stops: Bus {route.serviceNo}
          </h3>
          <p className="text-xs text-warm-500 font-medium">
            From {routeDir.origin} to {routeDir.destination} ({routeDir.stops.length} stops)
          </p>
          <p className="text-[11px] text-warm-500">Distances are straight-line from your location</p>
          {trip && trip.legs.length > 1 && onTrackLeg && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label={`Buses of your trip to ${trip.destinationName}`}>
              <span className="text-warm-600 font-semibold">Your trip:</span>
              {trip.legs.map((leg, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ArrowRight className="w-3.5 h-3.5 text-warm-400" />}
                  <button
                    type="button"
                    onClick={() => onTrackLeg(i)}
                    aria-pressed={i === legIndex}
                    className={`flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg border font-semibold ${
                      i === legIndex ? `${legStyle(i).soft} ${legStyle(i).border} text-warm-900` : 'bg-white border-warm-200 text-warm-600 hover:bg-warm-50'
                    }`}
                  >
                    <ServiceChip serviceNo={leg.serviceNo} legIndex={i} />
                    {i === 0 ? '1st bus' : '2nd bus'}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
          {alight?.status === 'alight' && alightSeq > 0 && (
            <button
              type="button"
              onClick={showAlightStop}
              className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-helvetia-950 ${style.soft} border ${style.border} rounded-lg px-2 py-1 hover:brightness-95 text-left`}
            >
              {next ? <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" /> : <Flag className="w-3.5 h-3.5 shrink-0" />}
              <span>
                {next ? 'Change buses at' : 'Get off at'} {alight.stop.name} (stop {alightSeq}, {alight.stopCount} stop
                {alight.stopCount === 1 ? '' : 's'} after boarding)
              </span>
            </button>
          )}
        </div>

        {/* Filter input */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-warm-500 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search stop name or code..."
            className="w-full pl-9 pr-3 py-1.5 bg-warm-50 border border-warm-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-helvetia"
          />
        </div>
      </div>

      {/* Sequential Stop List */}
      <div ref={listRef} className="mt-3 divide-y divide-warm-100 max-h-[500px] overflow-y-auto pr-1">
        {filteredStops.map((stop) => {
          const isNearest = stop.code === nearestStop.code;
          const isSelected = stop.code === selectedStop.code;
          const isAlight = stop.sequence === alightSeq;
          const isBoard = alightSeq > 0 && stop.sequence === boardSeq;
          const isRidden = alightSeq > 0 && stop.sequence > boardSeq && stop.sequence < alightSeq;
          // Stops you won't ride on this bus are faded while a trip is shown
          const isOffRide = alightSeq > 0 && (stop.sequence < boardSeq || stop.sequence > alightSeq);

          return (
            <React.Fragment key={`${stop.code}-${stop.sequence}`}>
            {isBoard && showingTrip && prev && trip && (
              <PrevLegBlock leg={prev} legIndex={legIndex - 1} onShow={onTrackLeg && (() => onTrackLeg(legIndex - 1))} />
            )}
            <button
              type="button"
              ref={isAlight ? alightRowRef : isBoard ? boardRowRef : undefined}
              onClick={() => onSelectStop(stop)}
              aria-pressed={isSelected}
              className={`w-full text-left p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 ${
                isAlight
                  ? `${style.soft} border ${style.border} font-semibold`
                  : isSelected
                  ? 'bg-helvetia-50/80 border border-helvetia-200 font-semibold'
                  : 'hover:bg-warm-50'
              } ${isOffRide ? 'opacity-55 hover:opacity-100' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Step indicator */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isAlight
                      ? 'bg-helvetia-950 text-lemon shadow-xs'
                      : isNearest
                      ? 'bg-lemon text-helvetia-950 shadow-xs ring-1 ring-helvetia/30'
                      : isSelected
                      ? 'bg-helvetia-600 text-white'
                      : isRidden
                      ? 'bg-helvetia-100 text-helvetia-800'
                      : 'bg-warm-100 text-warm-600'
                  }`}
                  title={isRidden ? 'On the bus' : undefined}
                >
                  {isAlight ? (
                    next ? <ArrowLeftRight className="w-3.5 h-3.5" aria-label="Change buses here" /> : <Flag className="w-3.5 h-3.5" aria-label="Get off here" />
                  ) : isNearest ? '★' : stop.sequence}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-warm-900 truncate">
                      {stop.name}
                    </span>
                    <span className="font-mono text-[11px] bg-warm-100 text-warm-700 px-1.5 py-0.2 rounded font-medium">
                      {stop.code}
                    </span>
                    {isNearest && (
                      <span className="bg-lemon-soft text-helvetia-950 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        Nearest Stop ({formatDistance(stop.distanceMeters)})
                      </span>
                    )}
                    {isAlight && (
                      <span className="bg-helvetia-950 text-lemon text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {next ? 'Change here' : 'Get off here'}
                      </span>
                    )}
                    {isBoard && prev && (
                      <span className="bg-helvetia-950 text-lemon text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        Change here from {prev.serviceNo}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-warm-500 mt-0.5">{stop.road}</div>
                  {isAlight && alight?.status === 'alight' && (
                    <div className="text-xs text-warm-700 mt-0.5 font-medium flex flex-wrap items-center gap-1">
                      {next ? (
                        <>
                          {alight.walkM > 0 ? `Walk ~${minutes(alight.walkMin)} min to ${next.board.name} for` : 'Take'}
                          <ServiceChip serviceNo={next.serviceNo} legIndex={legIndex + 1} />
                          {alight.walkM > 0 ? '' : 'from this stop'}
                        </>
                      ) : (
                        `For ${alight.destinationName} · walk ~${minutes(alight.walkMin)} min`
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-warm-500">
                  {formatDistance(stop.distanceMeters)}
                </span>
                {isSelected ? (
                  <Check className="w-4 h-4 text-helvetia" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-warm-300" />
                )}
              </div>
            </button>
            {isAlight && showingTrip && next && trip && (
              <NextLegBlock
                leg={next}
                legIndex={legIndex + 1}
                fromStopName={stop.name}
                transferWalkM={trip.transferWalkM}
                transferWalkMin={trip.transferWalkMin}
                destinationName={trip.destinationName}
                walkEndMin={trip.walkEndMin}
                onShow={onTrackLeg && (() => onTrackLeg(legIndex + 1))}
              />
            )}
            </React.Fragment>
          );
        })}

        {filteredStops.length === 0 && (
          <div className="py-8 text-center text-warm-500 text-xs">
            No stops found matching "{filterQuery}"
          </div>
        )}
      </div>
    </div>
  );
};
