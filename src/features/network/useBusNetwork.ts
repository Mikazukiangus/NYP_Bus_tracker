import { useEffect, useMemo, useState } from 'react';
import type { UserLocation } from '../../types/bus';
import { BusNetwork, loadBusNetwork, nearestStops } from '../../services/busNetwork';

export function useBusNetwork(userLocation: UserLocation) {
  // LTA bus network (every stop and service direction, built at deploy time) for nearby buses,
  // stop search and trip planning. Loaded once in the background.
  const [network, setNetwork] = useState<BusNetwork | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let active = true;
    loadBusNetwork().then((net) => {
      if (!active) return;
      setNetwork(net);
      setNetworkStatus(net ? 'ready' : 'unavailable');
    });
    return () => {
      active = false;
    };
  }, []);

  // Bus stops nearest the user, with their services (null while loading, undefined if the network is unavailable)
  const nearbyStops = useMemo(
    () =>
      network ? nearestStops(network, userLocation.lat, userLocation.lng) : networkStatus === 'loading' ? null : undefined,
    [network, networkStatus, userLocation.lat, userLocation.lng]
  );

  return { network, networkStatus, nearbyStops };
}
