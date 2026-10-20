import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { MapRef } from '../model';

export function useLayerGroup(map: MapRef) {
  const group = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!map.current) return;
    const layer = L.layerGroup().addTo(map.current);
    group.current = layer;
    return () => { layer.remove(); group.current = null; };
  }, [map]);
  return group;
}
