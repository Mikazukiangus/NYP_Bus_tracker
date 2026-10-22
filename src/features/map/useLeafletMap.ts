import { useEffect, useRef, type RefObject } from 'react';
import L from 'leaflet';
import { config } from '../../config';
import type { BusStop } from '../../types/bus';
import { oneMapAttribution } from './attribution';
import { TimedTileLayer } from './timedTileLayer';
import { boundImageRequest } from './imageDeadline';
import 'leaflet/dist/leaflet.css';

// OneMap: Singapore Land Authority's free official basemap (no key; attribution required)
const ONEMAP_ATTRIBUTION = oneMapAttribution(config.urls.oneMapBase);
const ONEMAP_STYLES = { Default: 'Standard', Grey: 'Grey', Night: 'Night' } as const;
// OneMap only serves tiles for Singapore
const SINGAPORE_BOUNDS = L.latLngBounds([1.144, 103.535], [1.494, 104.502]);

export function useLeafletMap(mapContainerRef: RefObject<HTMLDivElement | null>, nearestStop: BusStop) {
  const mapInstanceRef = useRef<L.Map | null>(null);
  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const map = L.map(mapContainerRef.current, {
      center: [nearestStop.lat, nearestStop.lng],
      zoom: 15,
      minZoom: 11,
      maxZoom: 19,
      maxBounds: SINGAPORE_BOUNDS,
      maxBoundsViscosity: 1,
      zoomControl: false,
    });

    const baseLayers = Object.fromEntries(
      Object.entries(ONEMAP_STYLES).map(([style, label]) => [
        label,
        new TimedTileLayer(`${config.urls.oneMapBase}/maps/tiles/${style}/{z}/{x}/{y}.png`, {
          attribution: ONEMAP_ATTRIBUTION,
          minZoom: 11,
          maxZoom: 19,
          bounds: SINGAPORE_BOUNDS,
          detectRetina: true,
        }, config.timeouts.mapImageMs),
      ])
    );
    baseLayers[ONEMAP_STYLES.Default].addTo(map);
    L.control.layers(baseLayers, undefined, { position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const logos = new Map<HTMLImageElement, () => void>();
    const bindLogos = () => {
      const container = map.attributionControl.getContainer();
      for (const [image, cancel] of logos) if (!container?.contains(image)) { cancel(); logos.delete(image); }
      for (const image of container?.querySelectorAll('img') ?? []) {
        if (!logos.has(image)) logos.set(image, boundImageRequest(image, config.timeouts.mapImageMs));
      }
    };
    bindLogos();
    map.on('baselayerchange', bindLogos);

    // Trip lines sit above the route line (overlay pane, z 400) but below markers (z 600)
    map.createPane('journey').style.zIndex = '450';

    mapInstanceRef.current = map;

    return () => {
      // Leaflet ends a zoom animation on a 250 ms timer that crashes if the map was removed mid-animation
      // (e.g. switching tabs while it is fitting bounds), so cancel the pending animation first
      (map as unknown as { _animatingZoom: boolean })._animatingZoom = false;
      map.off('baselayerchange', bindLogos);
      for (const cancel of logos.values()) cancel();
      logos.clear();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  return mapInstanceRef;
}
