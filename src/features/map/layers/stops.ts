import { sameStopCall } from '../../../../shared/transit/stopCalls';
import { useEffect } from 'react';
import L from 'leaflet';
import type { MapRef, StopEtas } from '../model';
import type { BusStop, RouteDirection, AlightHint, TripView } from '../../../types/bus';
import { element } from '../dom';
import { flagIcon, changeIcon } from '../svg';
import { stopPopup } from '../popupElements';

import { bindEtaCallout } from './etaCallout';
import { useLayerGroup } from './useLayerGroup';

export function useStopLayer(mapInstanceRef: MapRef, routeDir: RouteDirection, nearestStop: BusStop, selectedStop: BusStop, showStops: boolean, onSelectStop: (stop: BusStop) => void, alightStop: Extract<AlightHint, { status: 'alight' }> | null, nextBus: TripView['legs'][number] | null, etas: StopEtas | null) {
  const stopsLayerRef = useLayerGroup(mapInstanceRef);
  const etaKey = etas ? `${etas.serviceNo}|${etas.minutes.join(',')}|${etas.live}` : "";
  // Update Bus Stops Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const stopsGroup = stopsLayerRef.current;
    if (!map || !stopsGroup) return;

    stopsGroup.clearLayers();

    if (!showStops) return;

    routeDir.stops.forEach((stop) => {
      const isNearest = sameStopCall(stop, nearestStop);
      const isSelected = sameStopCall(stop, selectedStop);
      const isAlight = !!alightStop && sameStopCall(stop, alightStop.stop);

      let icon: HTMLElement;
      let size: number;
      if (isAlight) {
        size = 28;
        icon = element('div', 'w-6 h-6 m-[2px] rounded-full bg-lemon border-[3px] border-helvetia-950 text-helvetia-950 shadow-md flex items-center justify-center');
        icon.append(nextBus ? changeIcon(11) : flagIcon(11));
      } else if (isNearest) {
        size = 28;
        icon = element('div', 'relative flex items-center justify-center w-7 h-7');
        icon.append(element('div', 'absolute w-7 h-7 rounded-full bg-lemon/40 animate-ping'),
          element('div', 'w-5 h-5 rounded-full bg-lemon border-2 border-helvetia shadow-md flex items-center justify-center text-helvetia-950 text-[9px] font-black', '★'));
      } else if (isSelected) {
        size = 22;
        icon = element('div', 'w-4 h-4 m-[3px] rounded-full bg-helvetia border-2 border-white shadow-md');
      } else {
        size = 22;
        icon = element('div', 'w-3 h-3 m-[5px] rounded-full bg-white border-[3px] border-helvetia shadow-xs');
      }

      const marker = L.marker([stop.lat, stop.lng], {
        title: `${isAlight ? 'Get off here: ' : isNearest ? 'Nearest stop: ' : ''}${stop.name} (${stop.code})`,
        icon: L.divIcon({
          html: icon,
          className: 'bus-stop-marker',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        zIndexOffset: isAlight ? 400 : isNearest || isSelected ? 300 : 0,
      });

      const alightLabel = isAlight && alightStop
        ? nextBus ? `Get off to change to Bus ${nextBus.serviceNo}` : `Get off here for ${alightStop.destinationName}`
        : null;
      // The listener belongs to this popup, including repeated visits to the same physical stop.
      marker.bindPopup(stopPopup(stop, isNearest, alightLabel, () => {
        onSelectStop(stop);
        marker.closePopup();
      }));

      if (isSelected && etas) bindEtaCallout(marker, etas, true, size);

      stopsGroup.addLayer(marker);
    });
    // (etaKey stands for etas, which is a new object on every render)
  }, [routeDir, nearestStop, selectedStop, showStops, onSelectStop, alightStop, nextBus, etaKey]);
}
