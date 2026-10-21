import type L from 'leaflet';
import type { StopEtas } from '../model';
import { etaCallout } from '../markerElements';

export const bindEtaCallout = (marker: L.Marker, etas: StopEtas, withBadge: boolean, markerSize: number) =>
  marker.bindTooltip(etaCallout(etas, withBadge), {
    permanent: true,
    direction: 'top',
    offset: [0, -markerSize / 2 - 2],
    className: 'eta-callout',
  });
