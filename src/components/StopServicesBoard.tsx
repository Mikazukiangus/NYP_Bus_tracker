import React, { useEffect, useMemo, useState } from 'react';
import { BusFront, ChevronDown, ChevronRight } from 'lucide-react';
import { ArrivalDataSource, BusLoad, BusStop, StopServiceArrivals } from '../types/bus';
import { fetchStopNames } from '../services/busTrackerService';
import { formatEta, TrackingBadge } from './ArrivalBits';

interface StopServicesBoardProps {
  stop: BusStop;
  services: StopServiceArrivals[] | null; // null while loading or when the live feed is down
  dataSource: ArrivalDataSource;
  currentServiceNo: string;
  onSelectService: (serviceNo: string) => void;
}

const COLLAPSED_COUNT = 8;
const LOAD_DOT: Record<BusLoad, { className: string; label: string }> = {
  SEA: { className: 'bg-emerald-500', label: 'Seats available' },
  SDA: { className: 'bg-amber-500', label: 'Standing available' },
  LSD: { className: 'bg-rose-500', label: 'Limited standing' },
};

// Every bus service due at the selected stop, from the same LTA BusArrival call as the main board
export const StopServicesBoard: React.FC<StopServicesBoardProps> = ({
  stop,
  services,
  dataSource,
  currentServiceNo,
  onSelectService,
}) => {
  const [stopNames, setStopNames] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchStopNames().then(setStopNames);
  }, []);

  useEffect(() => setExpanded(false), [stop.code]);

  const sorted = useMemo(
    () => [...(services ?? [])].sort((a, b) => a.serviceNo.localeCompare(b.serviceNo, 'en', { numeric: true })),
    [services]
  );
  const shown = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);

  return (
    <div className="@container bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-5">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <BusFront className="w-4 h-4 text-[#602a85] shrink-0" />
          <h3 className="text-sm font-bold text-slate-900 truncate">
            All buses at {stop.name} <span className="font-mono text-xs text-slate-400">{stop.code}</span>
          </h3>
        </div>
        {services && services.length > 0 && (
          <span className="text-[11px] text-slate-500 shrink-0">
            {services.length} service{services.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {dataSource === 'LOADING' ? (
        <div className="mt-3 grid grid-cols-1 @2xl:grid-cols-2 gap-2 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 bg-slate-100 rounded-xl" />
          ))}
        </div>
      ) : dataSource !== 'LTA_DATAMALL_V3' || !services ? (
        <p className="mt-3 text-xs text-slate-500">Live arrivals for the other services here are unavailable right now.</p>
      ) : services.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          No buses are due at this stop right now. Services may have ended for the day.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 @2xl:grid-cols-2 gap-2">
            {shown.map((svc) => {
              const isCurrent = svc.serviceNo.toUpperCase() === currentServiceNo.toUpperCase();
              const destination = svc.destinationCode ? stopNames[svc.destinationCode] : undefined;
              return (
                <button
                  key={svc.serviceNo}
                  onClick={() => !isCurrent && onSelectService(svc.serviceNo)}
                  className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-colors min-w-0 ${
                    isCurrent
                      ? 'bg-purple-50 border-purple-200 cursor-default'
                      : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                  title={isCurrent ? 'Currently tracking' : `Track Bus ${svc.serviceNo} from this stop`}
                >
                  <span className="min-w-[2.75rem] text-center bg-[#602a85] text-white font-black text-xs px-1.5 py-1 rounded-lg shrink-0">
                    {svc.serviceNo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-slate-500 truncate">
                      {destination ? `To ${destination}` : svc.operator}
                    </div>
                    {svc.nextBus ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${LOAD_DOT[svc.nextBus.load].className}`}
                          title={LOAD_DOT[svc.nextBus.load].label}
                        />
                        <strong className={svc.nextBus.estimatedMinutes <= 0 ? 'text-emerald-600' : 'text-slate-900'}>
                          {formatEta(svc.nextBus.estimatedMinutes)}
                        </strong>
                        {svc.nextBus2 && <span className="text-slate-400">then {formatEta(svc.nextBus2.estimatedMinutes)}</span>}
                        <TrackingBadge bus={svc.nextBus} compact />
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">No estimate</div>
                    )}
                  </div>
                  {!isCurrent && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
                </button>
              );
            })}
          </div>
          {sorted.length > COLLAPSED_COUNT && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 text-xs font-semibold text-[#602a85] hover:underline flex items-center gap-1"
            >
              {expanded ? 'Show fewer' : `Show all ${sorted.length} services`}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </>
      )}
    </div>
  );
};
