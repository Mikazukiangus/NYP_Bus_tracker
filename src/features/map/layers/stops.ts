import { useEffect } from 'react';
import L from 'leaflet';
import type { MapRef, StopEtas } from '../model';
import type { BusStop, RouteDirection, AlightHint, TripView } from '../../../types/bus';
import { escapeHtml, flagSvg, changeSvg } from '../markerHtml';

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
      const isNearest = stop.code === nearestStop.code;
      const isSelected = stop.code === selectedStop.code;
      const isAlight = stop.code === alightStop?.stop.code;

      let iconHtml: string;
      let size: number;

      if (isAlight) {
        size = 28;
        iconHtml = `<div class="w-6 h-6 m-[2px] rounded-full bg-lemon border-[3px] border-helvetia-950 text-helvetia-950 shadow-md flex items-center justify-center">${nextBus ? changeSvg(11) : flagSvg(11)}</div>`;
      } else if (isNearest) {
        size = 28;
        iconHtml = `
          <div class="relative flex items-center justify-center w-7 h-7">
            <div class="absolute w-7 h-7 rounded-full bg-lemon/40 animate-ping"></div>
            <div class="w-5 h-5 rounded-full bg-lemon border-2 border-helvetia shadow-md flex items-center justify-center text-helvetia-950 text-[9px] font-black">★</div>
          </div>
        `;
      } else if (isSelected) {
        size = 22;
        iconHtml = `<div class="w-4 h-4 m-[3px] rounded-full bg-helvetia border-2 border-white shadow-md"></div>`;
      } else {
        // Larger hit area than the visible dot so stops are easy to tap on phones
        size = 22;
        iconHtml = `<div class="w-3 h-3 m-[5px] rounded-full bg-white border-[3px] border-helvetia shadow-xs"></div>`;
      }

      const marker = L.marker([stop.lat, stop.lng], {
        title: `${isAlight ? 'Get off here: ' : isNearest ? 'Nearest stop: ' : ''}${stop.name} (${stop.code})`,
        icon: L.divIcon({
          html: iconHtml,
          className: 'bus-stop-marker',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        zIndexOffset: isAlight ? 400 : isNearest || isSelected ? 300 : 0,
      });

      marker.bindPopup(
        `<div class="font-sans text-xs">
          <div class="font-black text-helvetia-950 text-sm">${escapeHtml(stop.name)}</div>
          <div class="text-warm-500 text-[11px] font-mono mb-1">Stop ${stop.code} • ${escapeHtml(stop.road)}</div>
          ${isNearest ? '<span class="bg-lemon-soft text-helvetia-950 text-[10px] font-bold px-1.5 py-0.5 rounded">Nearest Stop to You</span><br/>' : ''}
          ${isAlight && alightStop ? `<span class="bg-helvetia-950 text-lemon text-[10px] font-bold px-1.5 py-0.5 rounded">${escapeHtml(nextBus ? `Get off to change to Bus ${nextBus.serviceNo}` : `Get off here for ${alightStop.destinationName}`)}</span><br/>` : ''}
          <div class="mt-2 text-right">
            <button id="select-stop-${stop.code}" class="bg-helvetia text-white text-xs font-bold px-3 py-1.5 rounded-md">View Arrivals</button>
          </div>
        </div>`
      );

      marker.on('popupopen', () => {
        const btn = document.getElementById(`select-stop-${stop.code}`);
        if (btn) {
          btn.onclick = () => {
            onSelectStop(stop);
            marker.closePopup();
          };
        }
      });

      if (isSelected && etas) bindEtaCallout(marker, etas, true, size);

      stopsGroup.addLayer(marker);
    });
    // (etaKey stands for etas, which is a new object on every render)
  }, [routeDir, nearestStop, selectedStop, showStops, onSelectStop, alightStop, nextBus, etaKey]);
}
