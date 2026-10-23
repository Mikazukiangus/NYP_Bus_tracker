import { Check, Navigation, Locate, Maximize2, TriangleAlert, Route } from 'lucide-react';
import type { LiveBusMapProps } from './model';
import type { RouteDirection, TrafficIncident } from '../../types/bus';
type Props = Pick<LiveBusMapProps, 'incomingBuses' | 'journey' | 'route'> & {
  incidents: TrafficIncident[];
  showBuses: boolean; showStops: boolean; setShowBuses: (value: boolean) => void; setShowStops: (value: boolean) => void;
  routeDir: RouteDirection; handleCenterNearest: () => void; handleCenterUser: () => void; handleFitTrip: () => void; handleFitRoute: () => void;
};
export function MapControls({ incomingBuses, journey, route, incidents, showBuses, showStops, setShowBuses, setShowStops, routeDir, handleCenterNearest, handleCenterUser, handleFitTrip, handleFitRoute }: Props) {
  const toggleClass = (active: boolean) =>
    `shrink-0 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1 ${
      active ? 'bg-helvetia-50 text-helvetia border-helvetia-200' : 'bg-white text-warm-500 border-warm-200'
    }`;
  const actionClass =
    'shrink-0 px-2.5 sm:px-3 py-1.5 bg-white hover:bg-warm-100 text-warm-800 rounded-lg text-xs font-semibold border border-warm-200 shadow-2xs flex items-center gap-1.5';

  return (<>
      {/* Map Header & Toolbar */}
      <div className="px-3 sm:px-4 py-3 bg-warm-50 border-b border-warm-200 flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${incomingBuses.length ? 'bg-green-blue animate-pulse' : 'bg-warm-300'}`}
          />
          <span className="font-bold text-sm text-warm-900 truncate">
            {journey ? `Trip to ${journey.to.name}` : `Bus ${route.serviceNo} Live Map`}
          </span>
          <span className="bg-helvetia-100 text-helvetia-900 text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0">
            {incomingBuses.length
              ? `${incomingBuses.length} bus${incomingBuses.length > 1 ? 'es' : ''} tracked`
              : 'No bus on GPS yet'}
          </span>
          {incidents.length > 0 && (
            <span
              className="bg-amber-100 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1"
              title="LTA traffic incidents within 150 m of this route"
            >
              <TriangleAlert className="w-3 h-3" />
              {incidents.length} incident{incidents.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Quick map controls, each with a word (phones have no hover to explain an icon); they wrap rather than
            scroll sideways, so none is hidden off the edge. The layers show a tick while they're on the map. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setShowBuses(!showBuses)} className={toggleClass(showBuses)} aria-pressed={showBuses}>
            {showBuses && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            Buses ({incomingBuses.length})
          </button>
          <button onClick={() => setShowStops(!showStops)} className={toggleClass(showStops)} aria-pressed={showStops}>
            {showStops && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            Stops ({routeDir.stops.length})
          </button>
          <span className="w-px h-5 bg-warm-200 mx-0.5" aria-hidden="true" />
          <button onClick={handleCenterNearest} className={actionClass} title="Go to the nearest bus stop">
            <Navigation className="w-3.5 h-3.5 text-helvetia" />
            Nearest stop
          </button>
          <button onClick={handleCenterUser} className={actionClass} title="Go to where you are">
            <Locate className="w-3.5 h-3.5 text-green-blue" />
            Me
          </button>
          {journey && (
            <button onClick={handleFitTrip} className={actionClass} title="Show the whole trip">
              <Route className="w-3.5 h-3.5 text-helvetia" />
              Trip
            </button>
          )}
          <button onClick={handleFitRoute} className={actionClass} title="Show the bus's whole route">
            <Maximize2 className="w-3.5 h-3.5 text-warm-600" />
            Whole route
          </button>
        </div>
      </div>

  </>);
}
