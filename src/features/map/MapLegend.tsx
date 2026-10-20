import type { LiveBusMapProps } from './model';
import type { AlightHint, TripView } from '../../types/bus';
import { legStyle } from '../../components/tripLegs';
type Props = Pick<LiveBusMapProps, 'nearestStop' | 'journey' | 'incidents'> & {
 alightStop: Extract<AlightHint, { status: 'alight' }> | null; nextBus: TripView['legs'][number] | null; followsRoads: boolean;
};
export function MapLegend({ nearestStop, alightStop, nextBus, journey, incidents, followsRoads }: Props) {
  return (<>
        {/* Legend Overlay (compact on phones) */}
        <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl px-2.5 py-2 border border-warm-200/90 shadow-md text-[11px] space-y-1 max-w-[60%]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-blue border border-white inline-block shadow-xs shrink-0" />
            <span className="text-warm-700">You</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-lemon text-helvetia-950 ring-1 ring-helvetia flex items-center justify-center text-[8px] font-bold shrink-0">★</span>
            <span className="text-warm-700 font-medium truncate">Nearest stop ({nearestStop.code})</span>
          </div>
          {alightStop && !journey && (
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-lemon border-2 border-helvetia-950 inline-block shrink-0" />
              <span className="text-warm-700 font-medium truncate">
                {nextBus ? 'Change buses' : 'Get off'} ({alightStop.stop.code})
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-helvetia inline-block shadow-2xs shrink-0" />
            <span className="text-warm-700">Bus (live GPS)</span>
          </div>
          {journey && (
            <>
              {journey.legs.map((leg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="w-4 h-[5px] rounded-full ring-2 ring-helvetia-950 inline-block shrink-0"
                    style={{ background: legStyle(i).line }}
                  />
                  <span className="text-warm-700 truncate">
                    {journey.legs.length > 1 ? `${i === 0 ? '1st' : '2nd'} bus: ${leg.serviceNo}` : `Your bus: ${leg.serviceNo}`}
                    {leg.otherServiceNos.length > 0 && <span className="text-warm-500"> (or {leg.otherServiceNos.join(', ')})</span>}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="w-4 h-0 border-t-[3px] border-dotted border-green-blue-ink inline-block shrink-0" />
                <span className="text-warm-700">Walk (straight line)</span>
              </div>
            </>
          )}
          {incidents.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400 text-[8px] font-black flex items-center justify-center shrink-0">!</span>
              <span className="text-warm-700">Traffic incident</span>
            </div>
          )}
          <div className="hidden sm:flex items-center gap-2">
            <span
              className={`w-4 h-0 border-t-[3px] border-helvetia inline-block shrink-0 ${followsRoads ? '' : 'border-dotted'}`}
            />
            <span className="text-warm-700">{followsRoads ? 'Route (actual roads)' : 'Route (stop to stop)'}</span>
          </div>
        </div>
  </>);
}
