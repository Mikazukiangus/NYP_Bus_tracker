import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BusFront, ChevronDown, ChevronRight } from 'lucide-react';
import { ArrivalDataSource, BusStop, StopServiceArrivals } from '../types/bus';
import { fetchStopNames } from '../services/busTrackerService';
import { useIsPhone } from '../services/useIsPhone';
import { LoadMeter, Minutes } from './ArrivalBits';
import { BUS_TYPE_SHORT, BusTypeIcon } from './BusTypeIcon';

interface StopServicesBoardProps {
  stop: BusStop;
  services: StopServiceArrivals[] | null; // null while loading or when the live feed is down
  dataSource: ArrivalDataSource;
  currentServiceNo: string;
  onSelectService: (serviceNo: string) => void;
}

// Services shown before "Show all": fewer on phones, where they stack in one column
const COLLAPSED_COUNT = 8;
const PHONE_COLLAPSED_COUNT = 4;

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
  const collapsedCount = useIsPhone() ? PHONE_COLLAPSED_COUNT : COLLAPSED_COUNT;

  useEffect(() => {
    fetchStopNames().then(setStopNames);
  }, []);

  useEffect(() => setExpanded(false), [stop.code]);

  const sorted = useMemo(
    () => [...(services ?? [])].sort((a, b) => a.serviceNo.localeCompare(b.serviceNo, 'en', { numeric: true })),
    [services]
  );
  const shown = expanded ? sorted : sorted.slice(0, collapsedCount);

  return (
    <div className="@container bg-white rounded-2xl border border-warm-200 shadow-sm p-3.5 sm:p-5">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-warm-100">
        <div className="flex items-center gap-2 min-w-0">
          <BusFront className="w-4 h-4 text-helvetia shrink-0" />
          {/* The arrivals card right above names the stop */}
          <h3 className="text-sm font-bold text-helvetia truncate" title={`${stop.name} (${stop.code})`}>
            All buses at this stop
          </h3>
        </div>
        {services && services.length > 0 && (
          <span className="text-[11px] text-warm-500 shrink-0">
            {services.length} service{services.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {dataSource === 'LOADING' ? (
        <div className="mt-3 grid grid-cols-1 @2xl:grid-cols-2 gap-2 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 bg-warm-100 rounded-xl" />
          ))}
        </div>
      ) : dataSource !== 'LTA_DATAMALL_V3' || !services ? (
        <p className="mt-3 text-xs text-warm-500">Live arrivals for the other services here are unavailable right now.</p>
      ) : services.length === 0 ? (
        <p className="mt-3 text-xs text-warm-500">
          No buses are due at this stop right now. Services may have ended for the day.
        </p>
      ) : (
        <>
          {/* Departure rows, Transit style: the bus number big with where it's going under it, and the next three
              buses on the right, each with a load bar under it (SG BusLeh). The tracked bus is the dark row. */}
          <ul className="mt-2 grid grid-cols-1 @2xl:grid-cols-2 gap-1.5 @2xl:gap-x-3">
            {shown.map((svc) => {
              const isCurrent = svc.serviceNo.toUpperCase() === currentServiceNo.toUpperCase();
              const destination = svc.destinationCode ? stopNames[svc.destinationCode] : undefined;
              const buses = [svc.nextBus, svc.nextBus2, svc.nextBus3].filter((b) => b !== null);
              const type = svc.nextBus?.type;
              return (
                <li key={svc.serviceNo}>
                  <button
                    onClick={() => !isCurrent && onSelectService(svc.serviceNo)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={`w-full flex items-center gap-3 py-2 px-3 text-left transition-colors min-w-0 rounded-xl border ${
                      isCurrent
                        ? 'bg-helvetia-950 border-helvetia-950 text-white cursor-default'
                        : 'bg-white border-warm-200/80 hover:bg-warm-50 text-warm-900'
                    }`}
                    title={isCurrent ? 'Currently tracking' : `Track Bus ${svc.serviceNo} from this stop`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black tracking-tight leading-none ${isCurrent ? 'text-lemon' : 'text-helvetia'}`}>
                          {svc.serviceNo}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${isCurrent ? 'text-helvetia-200' : 'text-warm-500'}`}>
                          {isCurrent ? 'Tracking' : type ? BUS_TYPE_SHORT[type] : svc.operator}
                        </span>
                      </span>
                      <span className={`mt-1 flex items-center gap-1 text-xs font-semibold min-w-0 ${isCurrent ? 'text-white' : 'text-warm-700'}`}>
                        <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-lemon' : 'text-green-blue'}`} aria-hidden="true" />
                        <span className="truncate">{destination ?? svc.operator}</span>
                        {isCurrent && type && (
                          <BusTypeIcon type={type} className="w-3.5 h-3.5 shrink-0 text-helvetia-200" />
                        )}
                      </span>
                    </span>
                    {buses.length > 0 ? (
                      <span className="flex items-end gap-2.5 shrink-0">
                        {buses.map((bus, i) => (
                          <span key={i} className="flex flex-col items-end gap-1">
                            {i === 0 ? (
                              <Minutes
                                min={bus.estimatedMinutes}
                                signal={bus.monitored ? 'live' : 'scheduled'}
                                signalClassName={isCurrent ? 'text-lemon' : 'text-green-blue'}
                                arrClassName={isCurrent ? 'text-lemon' : 'text-green-blue-ink'}
                                className={isCurrent ? 'text-white' : 'text-warm-900'}
                              />
                            ) : (
                              <span className={`text-sm font-bold leading-none tabular-nums ${isCurrent ? 'text-helvetia-200' : 'text-warm-600'}`}>
                                {bus.estimatedMinutes <= 0 ? 'Arr' : bus.estimatedMinutes}
                              </span>
                            )}
                            <LoadMeter load={bus.load} emptyClassName={isCurrent ? 'bg-white/20' : 'bg-warm-200'} />
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className={`text-xs shrink-0 ${isCurrent ? 'text-helvetia-200' : 'text-warm-500'}`}>No estimate</span>
                    )}
                    {!isCurrent && <ChevronRight className="w-4 h-4 text-warm-300 shrink-0 -mx-1" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {sorted.length > collapsedCount && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 text-xs font-semibold text-helvetia hover:underline flex items-center gap-1"
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
