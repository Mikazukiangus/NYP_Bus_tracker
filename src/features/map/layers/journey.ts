import { useEffect } from 'react';
import L from 'leaflet';
import type { MapRef, StopEtas } from '../model';
import type { BusStop, JourneyOverlay } from '../../../types/bus';
import { escapeHtml, changeSvg, FLAG_SVG } from '../markerHtml';

import { legStyle } from '../../../components/tripLegs';
import { bindEtaCallout } from './etaCallout';
import { useLayerGroup } from './useLayerGroup';

export function useJourneyLayer(mapInstanceRef: MapRef, journey: JourneyOverlay | null, etas: StopEtas | null, selectedStop: BusStop) {
  const journeyLayerRef = useLayerGroup(mapInstanceRef);
  const etaKey = etas ? `${etas.serviceNo}|${etas.minutes.join(',')}|${etas.live}` : "";
  // Planned trip: walking legs (dashed), each bus in its own colour (lemon, then green-blue after a change)
  // with a dark casing, boarding, change, alighting and destination markers (drawn above live buses so the
  // plan stays readable). The bus being tracked is drawn at full strength and the other one fainter.
  useEffect(() => {
    const group = journeyLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!journey) return;

    const walk = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
      L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        { pane: 'journey', color: 'var(--color-green-blue-ink)', weight: 4, opacity: 0.9, dashArray: '2 8', lineCap: 'round' }
      ).addTo(group);

    const pill = (content: string, border: string) =>
      `<div class="px-1.5 h-6 min-w-8 rounded-lg bg-helvetia text-white border-2 shadow-md flex items-center justify-center gap-0.5 text-[11px] font-black whitespace-nowrap" style="border-color:${border}">${content}</div>`;

    journey.legs.forEach((leg, i) => {
      const color = legStyle(i).line;
      const faded = journey.activeLeg !== undefined && journey.activeLeg !== i;
      const prev = journey.legs[i - 1];
      const changeAtSameStop = !!prev && prev.alight.code === leg.board.code;
      walk(i === 0 ? journey.from : prev.alight, leg.board);
      L.polyline(leg.path, { pane: 'journey', color: 'var(--color-helvetia-950)', weight: 10, opacity: faded ? 0.6 : 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(group);
      L.polyline(leg.path, {
        pane: 'journey',
        color,
        weight: 5,
        opacity: faded ? 0.75 : 1,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: leg.followsRoads ? undefined : '1 9',
      }).addTo(group);

      // Boarding: the first bus gets a service-number pill; a later bus gets a change pill ("⇄ 167")
      const title = prev
        ? changeAtSameStop
          ? `Change here from Bus ${prev.serviceNo} to Bus ${leg.serviceNo}: ${leg.board.name} (${leg.board.code})`
          : `Board Bus ${leg.serviceNo} at ${leg.board.name} (${leg.board.code}) after changing`
        : `Board Bus ${leg.serviceNo} at ${leg.board.name} (${leg.board.code})`;
      const boardMarker = L.marker([leg.board.lat, leg.board.lng], {
        title,
        zIndexOffset: 1150,
        icon: L.divIcon({
          html: pill(prev ? `${changeSvg(11)}${escapeHtml(leg.serviceNo)}` : escapeHtml(leg.serviceNo), color),
          className: 'journey-board-marker',
          iconSize: [prev ? 52 : 40, 24],
          iconAnchor: [prev ? 26 : 20, 12],
        }),
      })
        .bindPopup(
          prev
            ? `<div class="font-sans text-xs"><div class="font-black text-helvetia-950 text-sm">Change buses</div>
              <div class="text-warm-700">${changeAtSameStop ? 'Get off' : `Get off at ${escapeHtml(prev.alight.name)} · ${prev.alight.code}, then walk to`} Bus ${escapeHtml(prev.serviceNo)}${changeAtSameStop ? ' and take' : ''}</div>
              <div class="text-warm-700">${changeAtSameStop ? '' : 'board '}Bus ${escapeHtml(leg.serviceNo)} at ${escapeHtml(leg.board.name)} · ${leg.board.code}</div></div>`
            : `<div class="font-sans text-xs"><div class="font-black text-helvetia-950 text-sm">Board Bus ${escapeHtml(leg.serviceNo)}</div>
              <div class="text-warm-700">${escapeHtml(leg.board.name)} · ${leg.board.code}</div></div>`
        )
        .addTo(group);
      // The tracked bus's next times over the stop where you board it
      if (etas && leg.board.code === selectedStop.code && leg.serviceNo.toUpperCase() === etas.serviceNo.toUpperCase()) {
        bindEtaCallout(boardMarker, etas, false, 24);
      }

      // Getting off: skipped where the change pill already marks the stop
      const next = journey.legs[i + 1];
      if (next && next.board.code === leg.alight.code) return;
      L.marker([leg.alight.lat, leg.alight.lng], {
        title: `Get off Bus ${leg.serviceNo} at ${leg.alight.name} (${leg.alight.code})`,
        zIndexOffset: 1100,
        icon: L.divIcon({
          html: `<div class="w-4 h-4 m-[3px] rounded-full border-[3px] border-helvetia-950 shadow-md" style="background:${color}"></div>`,
          className: 'journey-alight-marker',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      })
        .bindPopup(
          `<div class="font-sans text-xs"><div class="font-black text-helvetia-950 text-sm">Get off Bus ${escapeHtml(leg.serviceNo)}</div>
          <div class="text-warm-700">${escapeHtml(leg.alight.name)} · ${leg.alight.code}${next ? ` (walk to Bus ${escapeHtml(next.serviceNo)})` : ''}</div></div>`
        )
        .addTo(group);
    });
    const last = journey.legs[journey.legs.length - 1];
    walk(last ? last.alight : journey.from, journey.to);

    L.marker([journey.to.lat, journey.to.lng], {
      title: `Destination: ${journey.to.name}`,
      zIndexOffset: 1200,
      icon: L.divIcon({
        html: `<div class="w-8 h-8 rounded-full bg-lemon text-helvetia-950 border-2 border-helvetia-950 shadow-lg flex items-center justify-center">${FLAG_SVG}</div>`,
        className: 'journey-destination-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
    })
      .bindPopup(`<div class="font-sans text-xs"><div class="font-black text-helvetia-950 text-sm">Destination</div><div class="text-warm-700">${escapeHtml(journey.to.name)}</div></div>`)
      .addTo(group);
  }, [journey, etaKey, selectedStop.code]); // (etaKey stands for etas)
}
