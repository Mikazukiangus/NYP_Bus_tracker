import React, { useEffect, useRef, useState } from 'react';
import type { LiveBusMapProps } from '../features/map/model';
import { useLeafletMap } from '../features/map/useLeafletMap';
import { useMapViewport } from '../features/map/useMapViewport';
import { useRouteLayer } from '../features/map/layers/route';
import { useJourneyLayer } from '../features/map/layers/journey';
import { useUserLayer } from '../features/map/layers/user';
import { useStopLayer } from '../features/map/layers/stops';
import { useBusLayer } from '../features/map/layers/liveBuses';
import { useIncidentLayer } from '../features/map/layers/incidents';
import { MapControls } from '../features/map/MapControls';
import { MapLegend } from '../features/map/MapLegend';
import { IncidentFeedNotice } from '../features/incidents/IncidentFeedNotice';
import { tripLegs } from './tripLegs';

export const LiveBusMap: React.FC<LiveBusMapProps> = ({
  route,
  direction,
  nearestStop,
  selectedStop,
  onSelectStop,
  userLocation,
  incomingBuses,
  incidentFeed,
  journey = null,
  alight = null,
  etas = null,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const { incidents } = incidentFeed;
  const mapInstanceRef = useLeafletMap(mapContainerRef, nearestStop);
  const [showStops, setShowStops] = useState(true);
  const [showBuses, setShowBuses] = useState(true);
  const routeDir = direction === 2 && route.direction2 ? route.direction2 : route.direction1;
  const followsRoads = routeDir.pathSource === 'OPENSTREETMAP';
  const hasJourney = !!journey;
  const alightStop = alight?.status === 'alight' ? alight : null;
  const nextBus = tripLegs(alight).next;
  useEffect(() => setShowStops(!hasJourney), [hasJourney]);
  useRouteLayer(mapInstanceRef, routeDir, followsRoads, hasJourney);
  useJourneyLayer(mapInstanceRef, journey, etas, selectedStop);
  useUserLayer(mapInstanceRef, userLocation);
  useStopLayer(mapInstanceRef, routeDir, nearestStop, selectedStop, showStops, onSelectStop, alightStop, nextBus, etas);
  useBusLayer(mapInstanceRef, incomingBuses, showBuses, selectedStop);
  useIncidentLayer(mapInstanceRef, incidents);
  const { handleCenterNearest, handleCenterUser, handleFitTrip, handleFitRoute } =
    useMapViewport(mapInstanceRef, { route, direction, nearestStop, userLocation, journey, alightStop, routeDir });

  return (
    <div className="@container bg-white rounded-2xl border border-warm-200 overflow-hidden shadow-sm relative">
      <MapControls {...{ incomingBuses, journey, route, incidents, showBuses, showStops, setShowBuses, setShowStops,
        routeDir, handleCenterNearest, handleCenterUser, handleFitTrip, handleFitRoute }} />
      <IncidentFeedNotice feed={incidentFeed} />
      <div className="relative w-full h-[calc(100dvh-18rem)] min-h-[320px] max-h-[520px] max-sm:max-h-none sm:h-[460px] lg:h-[520px] bg-warm-100 z-10">
        <div ref={mapContainerRef} className="w-full h-full" />
        <MapLegend {...{ nearestStop, alightStop, nextBus, journey, incidents, followsRoads }} />
      </div>
    </div>
  );
};
