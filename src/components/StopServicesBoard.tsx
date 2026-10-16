import React, { useEffect, useMemo, useState } from 'react';
import { BusFront, ChevronDown, ChevronRight } from 'lucide-react';
import { ArrivalDataSource, BusLoad, BusStop, StopServiceArrivals } from '../types/bus';
import { fetchStopNames } from '../services/busTrackerService';
import { useIsPhone } from '../services/useIsPhone';
import { Minutes } from './ArrivalBits';
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
const LOAD_DOT: Record<BusLoad, { className: string; label: string; short: string }> = {
  SEA: { className: 'bg-green-blue', label: 'Seats available', short: 'Seats' },
  SDA: { className: 'bg-amber-500', label: 'Standing available', short: 'Standing' },
  LSD: { className: 'bg-rose-500', label: 'Limited standing', short: 'Limited' },
};
const later = (min: number) => (min <= 0 ? 'Arr' : String(min));

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
          {/* Departure rows, Citymapper style: the bus, where it's going and how full, and the next times on the right */}
          <ul className="mt-1 grid grid-cols-1 @2xl:grid-cols-2 @2xl:gap-x-6">
            {shown.map((svc) => {
              const isCurrent = svc.serviceNo.toUpperCase() === currentServiceNo.toUpperCase();
              const destination = svc.destinationCode ? stopNames[svc.destinationCode] : undefined;
              const next = svc.nextBus;
              const then = [svc.nextBus2, svc.nextBus3].flatMap((b) => (b ? [later(b.estimatedMinutes)] : []));
              return (
                <li key={svc.serviceNo} className="border-b border-warm-100 last:border-b-0 @2xl:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                  <button
                    onClick={() => !isCurrent && onSelectService(svc.serviceNo)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={`w-full flex items-center gap-3 py-2.5 px-2 text-left transition-colors min-w-0 rounded-xl ${
                      isCurrent ? 'bg-helvetia-50 cursor-default' : 'hover:bg-warm-50'
                    }`}
                    title={isCurrent ? 'Currently tracking' : `Track Bus ${svc.serviceNo} from this stop`}
                  >
                    <span className="min-w-[2.75rem] text-center bg-helvetia text-white font-black text-sm px-1.5 py-1 rounded-lg shrink-0">
                      {svc.serviceNo}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-warm-900 truncate">
                        {destination ? `To ${destination}` : svc.operator}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-warm-500 truncate">
                        {isCurrent && <strong className="text-helvetia">Tracking ·</strong>}
                        {next ? (
                          <>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${LOAD_DOT[next.load].className}`} />
                            {LOAD_DOT[next.load].short}
                            {next.type && (
                              <>
                                <BusTypeIcon type={next.type} className="w-3.5 h-3.5 shrink-0 text-warm-500" />
                                {BUS_TYPE_SHORT[next.type]}
                              </>
                            )}
                          </>
                        ) : (
                          'No estimate'
                        )}
                      </span>
                    </span>
                    {next && (
                      <span className="text-right shrink-0">
                        <Minutes min={next.estimatedMinutes} signal={next.monitored ? 'live' : 'scheduled'} className="text-warm-900" />
                        {then.length > 0 && <span className="block text-[11px] text-warm-500 mt-0.5">{then.join(', ')} min</span>}
                      </span>
                    )}
                    {!isCurrent && <ChevronRight className="w-4 h-4 text-warm-300 shrink-0 -ml-1" />}
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
