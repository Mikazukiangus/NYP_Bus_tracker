import { useEffect } from 'react';
import L from 'leaflet';
import type { MapRef } from '../model';
import type { TrafficIncident } from '../../../types/bus';
import { element } from '../dom';
import { incidentPopup } from '../popupElements';

import { useLayerGroup } from './useLayerGroup';

export function useIncidentLayer(mapInstanceRef: MapRef, incidents: TrafficIncident[]) {
  const incidentsLayerRef = useLayerGroup(mapInstanceRef);
  // LTA traffic incidents along the route (accidents, roadworks, breakdowns, ...)
  useEffect(() => {
    const group = incidentsLayerRef.current;
    if (!group) return;
    group.clearLayers();

    incidents.forEach((incident) => {
      const icon = L.divIcon({
        html: element('div', 'w-6 h-6 rounded-full bg-amber-400 border-2 border-white shadow-md flex items-center justify-center text-warm-900 text-[13px] font-black leading-none', '!'),
        className: 'traffic-incident-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([incident.lat, incident.lng], { icon, zIndexOffset: 700 })
        .bindPopup(incidentPopup(incident))
        .addTo(group);
    });
  }, [incidents]);
}
