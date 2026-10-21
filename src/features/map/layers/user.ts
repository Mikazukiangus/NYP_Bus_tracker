import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { MapRef } from '../model';
import type { UserLocation } from '../../../types/bus';
import { element } from '../dom';
import { userPopup } from '../popupElements';

export function useUserLayer(mapInstanceRef: MapRef, userLocation: UserLocation) {
  const userMarkerRef = useRef<L.Marker | null>(null);
  // Update User Location Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    const pulse = element('div', 'relative flex items-center justify-center w-8 h-8');
    pulse.append(element('div', 'absolute w-8 h-8 rounded-full bg-green-blue/30 animate-ping'),
      element('div', 'relative w-4 h-4 rounded-full bg-green-blue border-2 border-white shadow-md'));
    const userIcon = L.divIcon({
      html: pulse,
      className: 'user-pulse-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
      icon: userIcon,
      title: `Your location: ${userLocation.name}`,
      zIndexOffset: 500,
    })
      .bindPopup(userPopup(userLocation.name))
      .addTo(map);
    return () => { userMarkerRef.current?.remove(); userMarkerRef.current = null; };
  }, [userLocation]);
}
