import { useEffect } from 'react';
import L from 'leaflet';
import type { MapRef } from '../model';
import type { BusStop, IncomingBus } from '../../../types/bus';
import { busMarkerHtml, busPopupHtml } from '../markerHtml';

import { useLayerGroup } from './useLayerGroup';

export function useBusLayer(mapInstanceRef: MapRef, incomingBuses: IncomingBus[], showBuses: boolean, selectedStop: BusStop) {
  const busesLayerRef = useLayerGroup(mapInstanceRef);
  // Update incoming bus markers from real LTA GPS positions
  useEffect(() => {
    const map = mapInstanceRef.current;
    const busesGroup = busesLayerRef.current;
    if (!map || !busesGroup) return;

    busesGroup.clearLayers();

    if (!showBuses) return;

    incomingBuses.forEach((bus) => {
      const busIcon = L.divIcon({
        html: busMarkerHtml(bus),
        className: 'live-bus-marker',
        iconSize: [48, 52],
        iconAnchor: [24, 20],
      });

      const marker = L.marker([bus.lat, bus.lng], { icon: busIcon, zIndexOffset: 1000 });

      marker.bindPopup(busPopupHtml(bus, selectedStop.name));

      busesGroup.addLayer(marker);
    });
  }, [incomingBuses, showBuses, selectedStop.name]);
}
