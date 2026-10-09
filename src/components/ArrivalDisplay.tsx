import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Accessibility, Layers, Info, CheckCircle2, Clock } from 'lucide-react';
import { BusArrivalInfo, BusLoad, BusServiceArrivals, BusStop } from '../types/bus';

interface ArrivalDisplayProps {
  arrivals: BusServiceArrivals;
  activeStop: BusStop;
  onRefresh: () => void;
  isRefreshing: boolean;
  dataSource?: 'LTA_DATAMALL_V3' | 'FALLBACK_SIMULATED';
}

export const ArrivalDisplay: React.FC<ArrivalDisplayProps> = ({
  arrivals,
  activeStop,
  onRefresh,
  isRefreshing,
  dataSource
}) => {
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(15);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const prevSecRef = useRef(secondsUntilRefresh);
  useEffect(() => {
    if (prevSecRef.current === 1 && secondsUntilRefresh === 15) {
      onRefreshRef.current();
    }
    prevSecRef.current = secondsUntilRefresh;
  }, [secondsUntilRefresh]);

  const handleManualRefresh = () => {
    setSecondsUntilRefresh(15);
    onRefresh();
  };

  const renderLoadBadge = (load: BusLoad) => {
    switch (load) {
      case 'SEA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
            SEA • Seats Avail
          </span>
        );
      case 'SDA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 inline-block" />
            SDA • Standing Avail
          </span>
        );
      case 'LSD':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 inline-block" />
            LSD • Limited Standing
          </span>
        );
    }
  };

  const renderSingleBusCard = (
    bus: BusArrivalInfo | null,
    label: string,
    isPrimary: boolean = false
  ) => {
    if (!bus) {
      return (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-slate-400 min-h-[140px]">
          <Clock className="w-5 h-5 mb-1 opacity-50" />
          <span className="text-xs font-medium">{label}</span>
          <span className="text-sm font-semibold text-slate-500 mt-1">Not in service</span>
        </div>
      );
    }

    const isArr = bus.estimatedMinutes <= 0;

    return (
      <div
        className={`rounded-2xl p-4 sm:p-5 transition-all relative ${
          isPrimary
            ? 'bg-gradient-to-b from-purple-50/70 to-white border-2 border-[#602a85]/30 shadow-sm'
            : 'bg-white border border-slate-200 shadow-2xs'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {label}
          </span>
          {bus.feature === 'WAB' && (
            <span
              className="text-blue-600 bg-blue-50 border border-blue-200 p-1 rounded-md text-[11px] flex items-center gap-0.5 font-medium"
              title="Wheelchair Accessible Bus"
            >
              <Accessibility className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold">WAB</span>
            </span>
          )}
        </div>

        {/* Arrival Time Big Display */}
        <div className="my-2 flex items-baseline gap-2">
          {isArr ? (
            <div className="flex items-center gap-1.5">
              <span className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight animate-pulse">
                Arr
              </span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Arriving Now
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                {bus.estimatedMinutes}
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-500">min</span>
            </div>
          )}
        </div>

        {/* Load badge */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {renderLoadBadge(bus.load)}

          {/* Bus Type */}
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
            <Layers className="w-3 h-3 text-slate-500" />
            {bus.type === 'DD' ? 'Double Deck' : bus.type === 'BD' ? 'Bendy Bus' : 'Single Deck'}
          </span>
        </div>

        {/* Fleet metadata */}
        {bus.busReg && (
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between font-mono">
            <span>Reg: {bus.busReg}</span>
            {bus.speedKmH && <span>Speed: {bus.speedKmH} km/h</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#602a85] text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
            {arrivals.serviceNo}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Bus {arrivals.serviceNo} Arrivals
              </h3>
              <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-md">
                {arrivals.operator}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                dataSource === 'LTA_DATAMALL_V3'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-purple-50 text-purple-700 border-purple-200'
              }`}>
                {dataSource === 'LTA_DATAMALL_V3' ? '● LTA DataMall v3 Live' : '● LTA Real-Time Feed'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              at <strong className="text-slate-800">{activeStop.name}</strong> ({activeStop.code}) • Towards {arrivals.destination}
            </p>
          </div>
        </div>

        {/* Refresh timer & button */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          <div className="text-right text-xs">
            <div className="text-slate-400 text-[11px]">Auto-refresh in</div>
            <div className="font-mono font-bold text-purple-900">{secondsUntilRefresh}s</div>
          </div>

          <button
            onClick={handleManualRefresh}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
        {renderSingleBusCard(arrivals.nextBus, 'Next Bus', true)}
        {renderSingleBusCard(arrivals.nextBus2, 'Subsequent Bus (2nd)', false)}
        {renderSingleBusCard(arrivals.nextBus3, 'Following Bus (3rd)', false)}
      </div>

      {/* Official Singapore LTA / SBS Transit Load legend */}
      <div className="mt-5 p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-600 gap-2">
        <div className="flex items-center gap-1 font-semibold text-slate-700">
          <Info className="w-3.5 h-3.5 text-purple-700 shrink-0" />
          <span>SBS Transit Capacity Guide:</span>
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
        </div>
      </div>
    </div>
  );
};
