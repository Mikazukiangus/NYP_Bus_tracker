import { useEffect } from 'react';
import L from 'leaflet';
import type { MapRef } from '../model';
import type { TrafficIncident } from '../../../types/bus';
import { escapeHtml } from '../markerHtml';

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
        html: `<div class="w-6 h-6 rounded-full bg-amber-400 border-2 border-white shadow-md flex items-center justify-center text-warm-900 text-[13px] font-black leading-none">!</div>`,
        className: 'traffic-incident-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([incident.lat, incident.lng], { icon, zIndexOffset: 700 })
        .bindPopup(
          `<div class="font-sans text-xs max-w-[240px]">
            <div class="font-black text-amber-800 text-sm">${escapeHtml(incident.type)}</div>
            <div class="text-warm-700 mt-1">${escapeHtml(incident.message)}</div>
            <div class="text-[10px] text-warm-500 mt-1.5">LTA traffic incident near this route</div>
          </div>`
        )
        .addTo(group);
    });
  }, [incidents]);
}
