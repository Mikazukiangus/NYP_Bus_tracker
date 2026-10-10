import React, { useState } from 'react';
import { RefreshCw, Accessibility, Layers, Info, Clock, CalendarClock, ChevronDown, Satellite } from 'lucide-react';
import { ArrivalDataSource, BusArrivalInfo, BusLoad, BusServiceArrivals, BusStop, FirstLastTimes } from '../types/bus';
import { TrackingBadge } from './ArrivalBits';

interface ArrivalDisplayProps {
  arrivals: BusServiceArrivals;
  activeStop: BusStop;
  onRefresh: () => void;
  isRefreshing: boolean;
  dataSource: ArrivalDataSource;
  secondsUntilRefresh: number;
}

const BUS_TYPE_LABEL = { SD: 'Single Deck', DD: 'Double Deck', BD: 'Bendy Bus' } as const;

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

export const ArrivalDisplay: React.FC<ArrivalDisplayProps> = ({
  arrivals,
  activeStop,
  onRefresh,
  isRefreshing,
  dataSource,
  secondsUntilRefresh,
}) => {
  const [showAllDays, setShowAllDays] = useState(false);
  const isLive = dataSource === 'LTA_DATAMALL_V3';
  const isLoading = dataSource === 'LOADING';
  const firstLast = activeStop.firstLastBus;
  const dayType = todaysDayType();

  const LOAD_BADGE: Record<BusLoad, { full: string; short: string; className: string; dot: string }> = {
    SEA: { full: 'SEA • Seats Avail', short: 'Seats', className: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-600' },
    SDA: { full: 'SDA • Standing Avail', short: 'Standing', className: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-600' },
    LSD: { full: 'LSD • Limited Standing', short: 'Limited', className: 'bg-rose-100 text-rose-800 border-rose-300', dot: 'bg-rose-600' },
  };

  const renderLoadBadge = (load: BusLoad) => {
    const badge = LOAD_BADGE[load];
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 @2xl:px-2 py-0.5 rounded-md text-[11px] @2xl:text-xs font-bold border ${badge.className}`}>
        <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${badge.dot}`} />
        <span className="@2xl:hidden">{badge.short}</span>
        <span className="hidden @2xl:inline">{badge.full}</span>
      </span>
    );
  };

  const renderSingleBusCard = (
    bus: BusArrivalInfo | null,
    label: string,
    shortLabel: string,
    isPrimary: boolean = false
  ) => {
    if (!bus) {
      return (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-2.5 @2xl:p-4 flex flex-col items-center justify-center text-center text-slate-400 min-h-[120px] @2xl:min-h-[140px]">
          <Clock className="w-5 h-5 mb-1 opacity-50" />
          <span className="text-xs font-medium">
            <span className="@2xl:hidden">{shortLabel}</span>
            <span className="hidden @2xl:inline">{label}</span>
          </span>
          <span className="text-xs @2xl:text-sm font-semibold text-slate-500 mt-1">{isLoading ? 'Loading...' : 'No estimate'}</span>
        </div>
      );
    }

    const isArr = bus.estimatedMinutes <= 0;

    return (
      <div
        className={`rounded-xl @2xl:rounded-2xl p-2.5 @2xl:p-5 transition-all relative min-w-0 ${
          isPrimary
            ? 'bg-gradient-to-b from-purple-50/70 to-white border-2 border-[#602a85]/30 shadow-sm'
            : 'bg-white border border-slate-200 shadow-2xs'
        }`}
      >
        <div className="flex items-center justify-between gap-1 mb-1 @2xl:mb-2">
          <span className="text-[11px] @2xl:text-xs font-bold uppercase tracking-wider text-slate-500 truncate">
            <span className="@2xl:hidden">{shortLabel}</span>
            <span className="hidden @2xl:inline">{label}</span>
          </span>
          {bus.feature === 'WAB' && (
            <span
              className="text-blue-600 bg-blue-50 border border-blue-200 p-0.5 @2xl:p-1 rounded-md text-[11px] flex items-center gap-0.5 font-medium shrink-0"
              title="Wheelchair Accessible Bus"
              aria-label="Wheelchair accessible bus"
            >
              <Accessibility className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold hidden @2xl:inline">WAB</span>
            </span>
          )}
        </div>

        {/* Arrival Time Big Display */}
        <div className="my-1 @2xl:my-2 flex items-baseline gap-2">
          {isArr ? (
            <div className="flex items-center gap-1.5">
              <span className="text-3xl @2xl:text-4xl font-black text-emerald-600 tracking-tight animate-pulse">
                Arr
              </span>
              <span className="hidden @2xl:inline text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Arriving Now
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl @2xl:text-4xl font-black text-slate-900 tracking-tight">
                {bus.estimatedMinutes}
              </span>
              <span className="text-sm @2xl:text-base font-bold text-slate-500">min</span>
            </div>
          )}
        </div>
        {isLive && <TrackingBadge bus={bus} compact={false} />}

        {/* Load badge */}
        <div className="mt-2 @2xl:mt-3 flex flex-wrap items-center gap-1.5 @2xl:gap-2">
          {renderLoadBadge(bus.load)}

          {/* Bus Type */}
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 @2xl:px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
            title={BUS_TYPE_LABEL[bus.type]}
          >
            <Layers className="w-3 h-3 text-slate-500" />
            <span className="@2xl:hidden">{bus.type}</span>
            <span className="hidden @2xl:inline">{BUS_TYPE_LABEL[bus.type]}</span>
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="@container bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-6">
      {/* Header bar */}
      <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-3 pb-3 @2xl:pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 @2xl:w-12 @2xl:h-12 rounded-xl bg-[#602a85] text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
            {arrivals.serviceNo}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Bus {arrivals.serviceNo} Arrivals
              </h3>
              <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-md">
                {arrivals.operator}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                isLoading
                  ? 'bg-slate-50 text-slate-600 border-slate-200'
                  : isLive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}>
                {isLoading ? 'Loading live arrivals...' : isLive ? '● LTA DataMall v3 Live' : '● Simulated (live feed unavailable)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              at <strong className="text-slate-800">{activeStop.name}</strong> ({activeStop.code}) • Towards {arrivals.destination}
            </p>
            {firstLast && (
              <button
                onClick={() => setShowAllDays((v) => !v)}
                className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
                aria-expanded={showAllDays}
              >
                <CalendarClock className="w-3.5 h-3.5 text-[#602a85] shrink-0" />
                <span>
                  {firstLast[dayType] ? (
                    <>
                      First <strong className="text-slate-700">{formatHHmm(firstLast[dayType]![0])}</strong> · Last{' '}
                      <strong className="text-slate-700">{formatHHmm(firstLast[dayType]![1])}</strong>
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
                    className={`rounded-lg border px-2 py-1 ${d === dayType ? 'border-purple-200 bg-purple-50' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <div className="font-semibold text-slate-700">{DAY_LABEL[d]}</div>
                    <div className="text-slate-500">{formatTimes(firstLast[d])}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Refresh timer & button */}
        <div className="flex items-center gap-3 self-end @xl:self-center shrink-0">
          <div className="text-right text-xs">
            <div className="text-slate-400 text-[11px]">Auto-refresh in</div>
            <div className="font-mono font-bold text-purple-900">{isRefreshing ? 'Updating...' : `${secondsUntilRefresh}s`}</div>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-[#602a85] font-semibold text-xs rounded-xl transition-all border border-purple-200"
            title="Refresh bus arrivals now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Update</span>
          </button>
        </div>
      </div>

      {/* Grid of 3 Arrival timings */}
      <div className="grid grid-cols-3 gap-2 @2xl:gap-3.5 mt-3 @2xl:mt-4">
        {renderSingleBusCard(arrivals.nextBus, 'Next Bus', 'Next', true)}
        {renderSingleBusCard(arrivals.nextBus2, '2nd Bus', '2nd', false)}
        {renderSingleBusCard(arrivals.nextBus3, '3rd Bus', '3rd', false)}
      </div>
      {isLive && arrivals.lastUpdated && (
        <p className="mt-2 text-[11px] text-slate-500">
          Updated {arrivals.lastUpdated.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour12: false })} SGT
        </p>
      )}

      {/* Official Singapore LTA / SBS Transit Load legend */}
      <div className="mt-3 @2xl:mt-5 p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-600 gap-2">
        <div className="flex items-center gap-1 font-semibold text-slate-700">
          <Info className="w-3.5 h-3.5 text-purple-700 shrink-0" />
          <span>Bus Capacity Guide:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-medium">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <strong>SEA:</strong> Seats Available
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <strong>SDA:</strong> Standing Available
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <strong>LSD:</strong> Limited Standing
          </span>
          {isLive && (
            <>
              <span className="flex items-center gap-1">
                <Satellite className="w-3 h-3 text-emerald-700" />
                <strong>Live GPS:</strong> bus is being tracked
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <strong>Scheduled:</strong> timetable estimate
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
