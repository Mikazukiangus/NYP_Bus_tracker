import React, { useState } from 'react';
import { RefreshCw, Accessibility, Info, Clock, CalendarClock, ChevronDown, Flag, ArrowLeftRight, ChevronRight, ChevronLeft, Heart, Footprints } from 'lucide-react';
import { AlightHint, ArrivalDataSource, BusArrivalInfo, BusServiceArrivals, BusStop, FirstLastTimes } from '../types/bus';
import { LOAD_INFO, LiveSignal, LoadMeter, Minutes } from './ArrivalBits';
import { LeaveWithin, leaveLabel, walkMinutes } from '../services/leaveWithin';
import { BUS_TYPE_NAME, BUS_TYPE_SHORT, BusTypeIcon } from './BusTypeIcon';
import { ServiceChoice } from './ServiceChoice';
import { GetOffAlarmSwitch } from './GetOffAlarm';
import type { GetOffAlarm } from '../services/useGetOffAlarm';
import { legStyle, tripLegs } from './tripLegs';

interface ArrivalDisplayProps {
  arrivals: BusServiceArrivals;
  activeStop: BusStop;
  onRefresh: () => void;
  isRefreshing: boolean;
  dataSource: ArrivalDataSource;
  secondsUntilRefresh: number;
  alight?: AlightHint | null; // where to get off for the destination in "Where to?"
  onTrackLeg?: (legIndex: number) => void; // switch to another bus of the trip
  onChooseService?: (legIndex: number, serviceNo: string) => void; // take another bus between the same stops
  getOffAlarm?: GetOffAlarm; // the "Get off now" alarm for this ride, when it can be set
  // Phones, where this card also does the nearest-stop banner's job: how far the stop is, and saving it
  stopInfo?: { distanceM: number; isNearest: boolean; onShowNearest: () => void };
  leave?: LeaveWithin | null; // when to set off from where the trip starts to catch one of these buses
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

// "0530" -> "5:30 am"
function formatHHmm(hhmm: string) {
  const h = parseInt(hhmm.slice(0, 2), 10);
  const m = hhmm.slice(2);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

const formatTimes = (t: FirstLastTimes) => (t ? `${formatHHmm(t[0])} – ${formatHHmm(t[1])}` : 'No service');

// LTA publishes separate first/last bus times for weekdays, Saturdays and Sundays/public holidays.
// Before 4 am the previous day's late buses are still running, so use the previous day's schedule.
function todaysDayType(): 'weekday' | 'saturday' | 'sunday' {
  const sgNow = new Date(Date.now() + 8 * 3600 * 1000 - 4 * 3600 * 1000); // SGT, shifted back 4 h
  const day = sgNow.getUTCDay();
  return day === 0 ? 'sunday' : day === 6 ? 'saturday' : 'weekday';
}

const DAY_LABEL = { weekday: 'Weekdays', saturday: 'Saturdays', sunday: 'Sundays & PH' } as const;

const minutes = (min: number) => Math.max(1, Math.round(min));
// Non-breaking spaces keep each number with its unit when the text wraps
const formatMetres = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10}\u00a0m` : `${(m / 1000).toFixed(1)}\u00a0km`);

// The stop to get off at for the destination, or a note that this bus doesn't go near it
const AlightStrip: React.FC<{
  alight: AlightHint;
  serviceNo: string;
  onTrackLeg?: (legIndex: number) => void;
  onChooseService?: (legIndex: number, serviceNo: string) => void;
  getOffAlarm?: GetOffAlarm;
}> = ({ alight, serviceNo, onTrackLeg, onChooseService, getOffAlarm }) => {
  if (alight.status === 'not-near') {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2.5 text-xs text-amber-900">
        <Flag className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Bus {serviceNo} doesn't stop within walking distance of <strong>{alight.destinationName}</strong> after this
          stop.{' '}
          {alight.distanceM <= 2000
            ? `Its closest stop is ${alight.stop.name} (${alight.stop.code}), ${formatMetres(alight.distanceM)} away.`
            : `See "Buses to ${alight.destinationName}" for ones that do.`}
        </p>
      </div>
    );
  }
  const { stop } = alight;
  const { trip, prev, next } = tripLegs(alight);
  const legIndex = trip?.legIndex ?? 0;
  const style = legStyle(legIndex);
  const legButton = 'shrink-0 self-start @md:self-center flex items-center gap-1 text-xs font-bold text-helvetia bg-white border border-helvetia-200 hover:bg-helvetia-50 px-2.5 py-1.5 rounded-lg';
  const current = trip?.legs[legIndex];

  return (
    <div className={`mt-3 rounded-xl border ${style.border} ${style.soft} px-3 py-2.5 flex flex-col @md:flex-row @md:items-start gap-2.5`}>
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <span className="w-7 h-7 rounded-full bg-helvetia-950 text-lemon flex items-center justify-center shrink-0" aria-hidden="true">
          {next ? <ArrowLeftRight className="w-3.5 h-3.5" /> : <Flag className="w-3.5 h-3.5" />}
        </span>
        <div className="min-w-0 text-xs text-warm-700">
          {trip && trip.legs.length > 1 && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-warm-600">
              Bus {legIndex + 1} of {trip.legs.length} to {trip.destinationName}
              {prev && <span className="normal-case tracking-normal font-semibold"> · after Bus&nbsp;{prev.serviceNo}</span>}
            </p>
          )}
          <p className="text-sm text-warm-900">
            {next ? 'Get off to change buses at ' : `Get off for ${alight.destinationName} at `}
            <strong className="font-black">{stop.name}</strong>{' '}
            <span className="font-mono text-[11px] font-semibold text-warm-600">{stop.code}</span>
          </p>
          <p className="mt-0.5">
            {alight.stopCount}&nbsp;stop{alight.stopCount === 1 ? '' : 's'} · ~{minutes(alight.rideMin)}&nbsp;min ride, then{' '}
            {next ? (
              <>
                {alight.walkM > 0
                  ? <>walk ~{minutes(alight.walkMin)}&nbsp;min to {next.board.name} ({next.board.code}) for </>
                  : 'take '}
                <ServiceChoice
                  serviceNos={next.serviceNos}
                  chosen={next.serviceNo}
                  notDue={next.notDueServiceNos}
                  onChoose={onChooseService && ((no) => onChooseService(legIndex + 1, no))}
                  chosenClassName={legStyle(legIndex + 1).badge}
                  size="sm"
                  label={`Buses from ${next.board.name} to ${next.alight.name}`}
                />
                {alight.walkM > 0 ? '' : ' from the same stop'}, {next.stops.length - 1}&nbsp;stops to{' '}
                <strong className="text-warm-900">{next.alight.name}</strong>
              </>
            ) : walkMinutes(alight.walkM) === 0 ? (
              "you're there"
            ) : (
              `walk ~${minutes(alight.walkMin)}\u00a0min (${formatMetres(alight.walkM)}) to ${alight.destinationName}`
            )}
          </p>
          {current && current.serviceNos.length > 1 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <ServiceChoice
                serviceNos={current.serviceNos}
                chosen={current.serviceNo}
                notDue={current.notDueServiceNos}
                onChoose={onChooseService && ((no) => onChooseService(legIndex, no))}
                chosenClassName={style.badge}
                size="sm"
                label={`Buses from ${current.board.name} to ${current.alight.name}`}
              />
              <span>
                {current.serviceNos.length === 2 ? 'both go' : 'all go'} from this stop to {stop.name}
                {onChooseService ? ' · tap one to track it' : ''}
              </span>
            </p>
          )}
          {getOffAlarm && (
            <GetOffAlarmSwitch alarm={getOffAlarm} serviceNo={serviceNo} stopName={stop.name} stopCount={alight.stopCount} />
          )}
        </div>
      </div>
      {onTrackLeg && next && trip && (
        <button type="button" onClick={() => onTrackLeg(legIndex + 1)} className={legButton}>
          Bus {next.serviceNo} times <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
      {onTrackLeg && prev && !next && trip && (
        <button type="button" onClick={() => onTrackLeg(legIndex - 1)} className={legButton}>
          <ChevronLeft className="w-3.5 h-3.5" /> Bus {prev.serviceNo} times
        </button>
      )}
    </div>
  );
};

const clockIn = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });

// Citymapper's summary band: how long you have before walking to the stop to catch one of the buses below
const LeaveStrip: React.FC<{ leave: Exclude<LeaveWithin, { status: 'at-stop' }> }> = ({ leave }) => {
  const label = leaveLabel(leave);
  const now = label === 'Leave now';
  return (
    <div
      className={`mt-3 rounded-xl border px-3 py-2 flex items-center gap-2.5 ${
        now ? 'bg-lemon-soft border-lemon' : 'bg-warm-50 border-warm-200/80'
      }`}
    >
      <span className="w-7 h-7 rounded-full bg-helvetia-950 text-lemon flex items-center justify-center shrink-0" aria-hidden="true">
        <Footprints className="w-3.5 h-3.5" />
      </span>
      {leave.status === 'leave' ? (
        <p className="min-w-0 text-xs text-warm-600 leading-snug">
          <strong className="block text-sm font-black text-helvetia-950">
            {label}
          </strong>
          {now ? '' : `By ${clockIn(leave.inMin)} · `}~{leave.walkMin}&nbsp;min walk for the bus due in {leave.busMin}&nbsp;min
          {leave.monitored && <LiveSignal className="inline w-3 h-3 ml-1 -mt-1 text-green-blue" title="Live GPS" />}
        </p>
      ) : (
        <p className="min-w-0 text-xs text-warm-600 leading-snug">
          <strong className="block text-sm font-black text-helvetia-950">These buses leave before you get there</strong>
          It's a ~{leave.walkMin}&nbsp;min walk to the stop: catch a later bus
        </p>
      )}
    </div>
  );
};

export const ArrivalDisplay: React.FC<ArrivalDisplayProps> = ({
  arrivals,
  activeStop,
  onRefresh,
  isRefreshing,
  dataSource,
  secondsUntilRefresh,
  alight = null,
  onTrackLeg,
  onChooseService,
  getOffAlarm,
  stopInfo,
  leave = null,
  isFavorite = false,
  onToggleFavorite,
}) => {
  const [showAllDays, setShowAllDays] = useState(false);
  const [showGuide, setShowGuide] = useState(false); // phones: the capacity guide is folded away
  const isLive = dataSource === 'LTA_DATAMALL_V3';
  const isLoading = dataSource === 'LOADING';
  const firstLast = activeStop.firstLastBus;
  const dayType = todaysDayType();

  const renderSingleBusCard = (
    bus: BusArrivalInfo | null,
    label: string,
    shortLabel: string,
    isPrimary: boolean = false
  ) => {
    if (!bus) {
      return (
        <div className="bg-warm-50 border border-dashed border-warm-200 rounded-xl p-2.5 @2xl:p-4 flex flex-col items-center justify-center text-center text-warm-500 min-h-[120px] @2xl:min-h-[140px]">
          <Clock className="w-5 h-5 mb-1 opacity-50" />
          <span className="text-xs font-medium">
            <span className="@2xl:hidden">{shortLabel}</span>
            <span className="hidden @2xl:inline">{label}</span>
          </span>
          <span className="text-xs @2xl:text-sm font-semibold text-warm-500 mt-1">{isLoading ? 'Loading...' : 'No estimate'}</span>
        </div>
      );
    }

    const isArr = bus.estimatedMinutes <= 0;

    return (
      <div
        className={`rounded-xl @2xl:rounded-2xl p-2.5 @2xl:p-5 transition-all relative min-w-0 ${
          isPrimary
            ? 'bg-lemon-soft border-2 border-helvetia/30 shadow-sm'
            : 'bg-white border border-warm-200 shadow-2xs'
        }`}
      >
        <div className="flex items-center justify-between gap-1 mb-1 @2xl:mb-2">
          <span className="text-[11px] @2xl:text-xs font-bold uppercase tracking-wider text-warm-500 truncate">
            <span className="@2xl:hidden">{shortLabel}</span>
            <span className="hidden @2xl:inline">{label}</span>
          </span>
          {bus.feature === 'WAB' && (
            <span
              className="text-helvetia-600 bg-helvetia-50 border border-helvetia-200 p-0.5 @2xl:p-1 rounded-md text-[11px] flex items-center gap-0.5 font-medium shrink-0"
              title="Wheelchair Accessible Bus"
              role="img"
              aria-label="Wheelchair accessible bus"
            >
              <Accessibility className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold hidden @2xl:inline">WAB</span>
            </span>
          )}
        </div>

        {/* Arrival time, Citymapper style: the live sign for a GPS-tracked bus, a clock for a timetable estimate;
            and the clock time, as Apple and Google Maps show */}
        <div className="my-1 @2xl:my-2">
          <Minutes
            min={bus.estimatedMinutes}
            signal={isLive ? (bus.monitored ? 'live' : 'scheduled') : undefined}
            size="lg"
            className={isArr ? 'animate-pulse' : 'text-warm-900'}
          />
          <span className="block mt-1 text-[11px] font-semibold text-warm-500 tabular-nums">
            {isArr ? 'Now' : clockIn(bus.estimatedMinutes)}
          </span>
        </div>

        {/* How full (a load bar, as in SG BusLeh) and the kind of bus (LTA gives both for each bus) */}
        <div className="mt-2 @2xl:mt-3 space-y-1 text-[11px] @2xl:text-xs font-semibold text-warm-700">
          <span className="flex items-center gap-1.5">
            <LoadMeter load={bus.load} />
            <span className="@2xl:hidden">{LOAD_INFO[bus.load].short}</span>
            <span className="hidden @2xl:inline">{LOAD_INFO[bus.load].label}</span>
          </span>
          {bus.type && (
            <span className="flex items-center gap-1.5 text-warm-600" title={BUS_TYPE_NAME[bus.type]}>
              <BusTypeIcon type={bus.type} className="w-4 h-4 shrink-0" />
              <span className="@2xl:hidden">{BUS_TYPE_SHORT[bus.type]}</span>
              <span className="hidden @2xl:inline">{BUS_TYPE_NAME[bus.type]}</span>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="@container bg-white rounded-2xl border border-warm-200 shadow-sm p-3.5 sm:p-6">
      {/* Header bar (phones: the refresh button sits in the top corner so the lines under the title get the full width) */}
      <div className="relative flex flex-col @xl:flex-row @xl:items-center justify-between gap-3 pb-3 @2xl:pb-4 border-b border-warm-100">
        <div className="flex items-center gap-3 min-w-0">
          {/* Phones: the title already names the bus, so the badge makes room for the refresh button */}
          <div className="max-sm:hidden w-11 h-11 @2xl:w-12 @2xl:h-12 rounded-xl bg-helvetia text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
            {arrivals.serviceNo}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 max-sm:pr-20 max-sm:min-h-[1.875rem]">
              <h3 className="text-base sm:text-lg font-black text-helvetia leading-tight">
                Bus {arrivals.serviceNo} Arrivals
              </h3>
              <span className="bg-warm-100 text-warm-700 text-xs font-bold px-2 py-0.5 rounded-md">
                {arrivals.operator}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                isLoading
                  ? 'bg-warm-50 text-warm-600 border-warm-200'
                  : isLive
                  ? 'bg-green-blue-soft text-green-blue-ink border-green-blue/30'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}>
                {isLoading ? (
                  'Loading live arrivals...'
                ) : isLive ? (
                  <span className="inline-flex items-center gap-1">
                    <LiveSignal className="w-2.5 h-2.5 text-green-blue" />
                    <span className="max-sm:hidden">LTA DataMall v3 </span>Live
                  </span>
                ) : (
                  <>
                    ● Simulated<span className="max-sm:hidden"> (live feed unavailable)</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-warm-500 font-medium">
              at <strong className="text-warm-800">{activeStop.name}</strong> ({activeStop.code}) • Towards {arrivals.destination}
            </p>
            {(stopInfo || onToggleFavorite) && (
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-warm-600">
                {stopInfo && (
                  <span className="min-w-0">
                    {stopInfo.isNearest ? <strong className="text-warm-800">★ Nearest stop</strong> : 'Not your nearest stop'}
                    {' · '}
                    {formatMetres(stopInfo.distanceM)}
                    {!leave && <>, ~{Math.max(1, walkMinutes(stopInfo.distanceM))}&nbsp;min walk</>}
                    {!stopInfo.isNearest && (
                      <>
                        {' · '}
                        <button onClick={stopInfo.onShowNearest} className="font-semibold text-helvetia underline">
                          Go to nearest
                        </button>
                      </>
                    )}
                  </span>
                )}
                {onToggleFavorite && (
                  <button
                    onClick={onToggleFavorite}
                    aria-pressed={isFavorite}
                    title={isFavorite ? 'Remove from favourites' : 'Save to favourites'}
                    className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border font-semibold ${
                      isFavorite ? 'bg-lemon border-lemon text-helvetia-950' : 'border-warm-200 text-warm-700 hover:bg-warm-50'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-helvetia-950' : ''}`} />
                    {isFavorite ? 'Saved' : 'Save'}
                  </button>
                )}
              </div>
            )}
            {firstLast && (
              <button
                onClick={() => setShowAllDays((v) => !v)}
                className="mt-1 flex items-center gap-1 text-[11px] text-left text-warm-500 hover:text-warm-700"
                aria-expanded={showAllDays}
              >
                <CalendarClock className="w-3.5 h-3.5 text-helvetia shrink-0" />
                <span>
                  {firstLast[dayType] ? (
                    <>
                      First <strong className="text-warm-700">{formatHHmm(firstLast[dayType]![0])}</strong> · Last{' '}
                      <strong className="text-warm-700">{formatHHmm(firstLast[dayType]![1])}</strong>
                    </>
                  ) : (
                    'No service'
                  )}{' '}
                  ({DAY_LABEL[dayType].toLowerCase()})
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showAllDays ? 'rotate-180' : ''}`} />
              </button>
            )}
            {firstLast && showAllDays && (
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[11px] max-w-md">
                {(['weekday', 'saturday', 'sunday'] as const).map((d) => (
                  <div
                    key={d}
                    className={`rounded-lg border px-2 py-1 ${d === dayType ? 'border-helvetia-200 bg-helvetia-50' : 'border-warm-200 bg-warm-50'}`}
                  >
                    <div className="font-semibold text-warm-700">{DAY_LABEL[d]}</div>
                    <div className="text-warm-500">{formatTimes(firstLast[d])}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Refresh timer & button */}
        <div className="flex items-center gap-3 self-end @xl:self-center shrink-0 max-sm:absolute max-sm:top-0 max-sm:right-0">
          <div className="text-right text-xs max-sm:hidden">
            <div className="text-warm-500 text-[11px]">Auto-refresh in</div>
            <div className="font-mono font-bold text-helvetia-900">{isRefreshing ? 'Updating...' : `${secondsUntilRefresh}s`}</div>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 max-sm:py-1.5 bg-helvetia-50 hover:bg-helvetia-100 text-helvetia font-semibold text-xs rounded-xl transition-all border border-helvetia-200"
            title="Refresh bus arrivals now"
            aria-label={`Refresh bus arrivals now (auto-refresh in ${secondsUntilRefresh} seconds)`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="max-sm:hidden">Update</span>
            {/* Phones: the countdown sits in the button */}
            <span className="sm:hidden font-mono font-bold tabular-nums">{isRefreshing ? '…' : `${secondsUntilRefresh}s`}</span>
          </button>
        </div>
      </div>

      {isLive && leave && leave.status !== 'at-stop' && <LeaveStrip leave={leave} />}

      {alight && (
        <AlightStrip
          alight={alight}
          serviceNo={arrivals.serviceNo}
          onTrackLeg={onTrackLeg}
          onChooseService={onChooseService}
          getOffAlarm={getOffAlarm}
        />
      )}

      {/* Grid of 3 Arrival timings */}
      <div className="grid grid-cols-3 gap-2 @2xl:gap-3.5 mt-3 @2xl:mt-4">
        {renderSingleBusCard(arrivals.nextBus, 'Next Bus', 'Next', true)}
        {renderSingleBusCard(arrivals.nextBus2, '2nd Bus', '2nd', false)}
        {renderSingleBusCard(arrivals.nextBus3, '3rd Bus', '3rd', false)}
      </div>
      {isLive && arrivals.lastUpdated && (
        <p className="mt-2 text-[11px] text-warm-500">
          Updated {arrivals.lastUpdated.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour12: false })} SGT
        </p>
      )}

      {/* Official Singapore LTA / SBS Transit Load legend (folded away on phones) */}
      <button
        type="button"
        onClick={() => setShowGuide((v) => !v)}
        aria-expanded={showGuide}
        className="sm:hidden mt-2 flex items-center gap-1 text-[11px] font-semibold text-warm-600 py-1"
      >
        <Info className="w-3.5 h-3.5 text-helvetia-700 shrink-0" />
        What do Seats, Standing and Live GPS mean?
        <ChevronDown className={`w-3 h-3 transition-transform ${showGuide ? 'rotate-180' : ''}`} />
      </button>
      <div
        className={`${showGuide ? 'flex' : 'hidden sm:flex'} mt-1.5 sm:mt-3 @2xl:mt-5 p-3 bg-warm-50 rounded-xl border border-warm-200/80 flex-col sm:flex-row sm:items-center justify-between text-[11px] text-warm-600 gap-2`}
      >
        <div className="flex items-center gap-1 font-semibold text-warm-700">
          <Info className="w-3.5 h-3.5 text-helvetia-700 shrink-0" />
          <span>Bus Capacity Guide:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-medium">
          {(['SEA', 'SDA', 'LSD'] as const).map((load) => (
            <span key={load} className="flex items-center gap-1.5">
              <LoadMeter load={load} />
              <strong>{LOAD_INFO[load].label}</strong>
            </span>
          ))}
          {isLive && (
            <>
              <span className="flex items-center gap-1">
                <LiveSignal className="w-3 h-3 text-green-blue" />
                <strong>Live GPS:</strong> bus is being tracked
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-warm-500" />
                <strong>Scheduled:</strong> timetable estimate
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
