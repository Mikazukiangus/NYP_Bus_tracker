import React from 'react';
import { Clock, Satellite } from 'lucide-react';
import { BusArrivalInfo } from '../types/bus';

export const formatEta = (minutes: number) => (minutes <= 0 ? 'Arr' : `${minutes} min`);

// Whether LTA's estimate is based on the bus's live GPS position or only on the timetable
export const TrackingBadge: React.FC<{ bus: Pick<BusArrivalInfo, 'monitored'>; compact?: boolean }> = ({ bus, compact }) =>
  bus.monitored ? (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold text-green-blue-ink"
      title="Estimate from the bus's live GPS position"
    >
      <Satellite className="w-3 h-3 shrink-0" />
      {compact ? 'GPS' : 'Live GPS'}
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold text-warm-500"
      title="No GPS fix yet (e.g. bus still at the interchange): estimate is from the timetable"
    >
      <Clock className="w-3 h-3 shrink-0" />
      {compact ? 'Sched.' : 'Scheduled'}
    </span>
  );
