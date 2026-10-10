import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AlightHint, BusRoute, BusStop, IncomingBus, JourneyOverlay, TrafficIncident, UserLocation } from '../types/bus';
import { Navigation, Locate, Maximize2, TriangleAlert, Route } from 'lucide-react';

interface LiveBusMapProps {
  route: BusRoute;
  direction: number;
  nearestStop: BusStop;
  selectedStop: BusStop;
  onSelectStop: (stop: BusStop) => void;
  userLocation: UserLocation;
  incomingBuses: IncomingBus[];
  incidents: TrafficIncident[]; // LTA traffic incidents near this route
  journey?: JourneyOverlay | null; // a planned trip to draw over the route
  alight?: AlightHint | null; // where to get off the tracked bus for the destination
}

// OneMap: Singapore Land Authority's free official basemap (no key; attribution required)
const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" style="height:16px;width:16px;display:inline;vertical-align:-3px"/>&nbsp;' +
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
const OSM_ROUTE_ATTRIBUTION =
  'Route lines &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const ONEMAP_STYLES = { Default: 'Standard', Grey: 'Grey', Night: 'Night' } as const;
// OneMap only serves tiles for Singapore
const SINGAPORE_BOUNDS = L.latLngBounds([1.144, 103.535], [1.494, 104.502]);

// Keep a framed trip clear of the legend in the top-left corner
const TRIP_FIT: L.FitBoundsOptions = { paddingTopLeft: [40, 150], paddingBottomRight: [40, 30], maxZoom: 17 };
// The stop to get off at is a marker on its own, so give it more room from the edge
const ALIGHT_FIT: L.FitBoundsOptions = { paddingTopLeft: [50, 150], paddingBottomRight: [50, 60], maxZoom: 16 };

const ORDINAL_LABEL = { 1: '1st', 2: '2nd', 3: '3rd' } as const;
const LOAD_LABEL = { SEA: 'Seats available', SDA: 'Standing available', LSD: 'Limited standing' } as const;
const LOAD_COLOR = { SEA: 'var(--color-green-blue)', SDA: '#f59e0b', LSD: '#ef4444' } as const;
const TYPE_LABEL = { SD: 'Single deck', DD: 'Double deck', BD: 'Bendy' } as const;

// Lucide "flag" icon, for the destination and get-off markers
const flagSvg = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;
const FLAG_SVG = flagSvg(14);

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const LiveBusMap: React.FC<LiveBusMapProps> = ({
  route,
  direction,
  nearestStop,
  selectedStop,
  onSelectStop,
  userLocation,
  incomingBuses,
  incidents,
  journey = null,
  alight = null,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const routeLayerRef = useRef<L.Polyline | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const busesLayerRef = useRef<L.LayerGroup | null>(null);
  const incidentsLayerRef = useRef<L.LayerGroup | null>(null);
  const journeyLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [showStops, setShowStops] = useState(true);
  // A trip has its own stop markers, so hide the tracked route's stops (the Stops toggle brings them back)
  const [showBuses, setShowBuses] = useState(true);

  const routeDir = direction === 2 && route.direction2 ? route.direction2 : route.direction1;
  const followsRoads = routeDir.pathSource === 'OPENSTREETMAP';
  const hasJourney = !!journey;
  const alightStop = alight?.status === 'alight' ? alight : null;
  useEffect(() => setShowStops(!hasJourney), [hasJourney]);

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
        L.tileLayer(`https://www.onemap.gov.sg/maps/tiles/${style}/{z}/{x}/{y}.png`, {
          attribution: ONEMAP_ATTRIBUTION,
          minZoom: 11,
          maxZoom: 19,
          bounds: SINGAPORE_BOUNDS,
          detectRetina: true,
        }),
      ])
    );
    baseLayers[ONEMAP_STYLES.Default].addTo(map);
    L.control.layers(baseLayers, undefined, { position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Trip lines sit above the route line (overlay pane, z 400) but below markers (z 600)
    map.createPane('journey').style.zIndex = '450';
    journeyLayerRef.current = L.layerGroup().addTo(map);
    stopsLayerRef.current = L.layerGroup().addTo(map);
    incidentsLayerRef.current = L.layerGroup().addTo(map);
    busesLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      // Leaflet ends a zoom animation on a 250 ms timer that crashes if the map was removed mid-animation
      // (e.g. switching tabs while it is fitting bounds), so cancel the pending animation first
      (map as unknown as { _animatingZoom: boolean })._animatingZoom = false;
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Route Polyline (road-following when OSM geometry matched, otherwise stop-to-stop)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (routeDir.path.length > 0) {
      routeLayerRef.current = L.polyline(routeDir.path, {
        color: 'var(--color-helvetia)',
        weight: 5,
        // Fade the full route behind a planned trip
        opacity: hasJourney ? 0.3 : 0.85,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: followsRoads ? undefined : '1 9',
      }).addTo(map);
    }

    if (followsRoads) {
      map.attributionControl.addAttribution(OSM_ROUTE_ATTRIBUTION);
      return () => {
        map.attributionControl.removeAttribution(OSM_ROUTE_ATTRIBUTION);
      };
    }
  }, [routeDir, followsRoads, hasJourney]);

  // Frame the user and their nearest stop (and the stop to get off at, if any) whenever the route, direction
  // or location changes (a planned trip is framed by its own effect instead)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || journey) return;
    const bounds = L.latLngBounds([
      [userLocation.lat, userLocation.lng],
      [nearestStop.lat, nearestStop.lng],
      ...(alightStop ? [[alightStop.stop.lat, alightStop.stop.lng] as [number, number]] : []),
    ]);
    map.fitBounds(bounds, alightStop ? ALIGHT_FIT : { padding: [60, 60], maxZoom: 16 });
  }, [route.serviceNo, direction, nearestStop.code, userLocation.lat, userLocation.lng, journey?.id, alightStop?.stop.code]);

  // Planned trip: walking legs (dashed), bus legs (lemon line with a Helvetia casing), boarding,
  // alighting and destination markers (drawn above live buses so the plan stays readable)
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

    journey.legs.forEach((leg, i) => {
      walk(i === 0 ? journey.from : journey.legs[i - 1].alight, leg.board);
      L.polyline(leg.path, { pane: 'journey', color: 'var(--color-helvetia-950)', weight: 10, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(group);
      L.polyline(leg.path, {
        pane: 'journey',
        color: 'var(--color-lemon)',
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: leg.followsRoads ? undefined : '1 9',
      }).addTo(group);

      L.marker([leg.board.lat, leg.board.lng], {
        title: `Board Bus ${leg.serviceNo} at ${leg.board.name} (${leg.board.code})`,
        zIndexOffset: 1150,
        icon: L.divIcon({
          html: `<div class="px-1.5 h-6 min-w-8 rounded-lg bg-helvetia text-white border-2 border-lemon shadow-md flex items-center justify-center text-[11px] font-black whitespace-nowrap">${escapeHtml(leg.serviceNo)}</div>`,
          className: 'journey-board-marker',
          iconSize: [40, 24],
          iconAnchor: [20, 12],
        }),
      })
        .bindPopup(
          `<div class="font-sans text-xs"><div class="font-black text-helvetia-950 text-sm">Board Bus ${escapeHtml(leg.serviceNo)}</div>
          <div class="text-warm-700">${escapeHtml(leg.board.name)} · ${leg.board.code}</div></div>`
        )
        .addTo(group);
      L.marker([leg.alight.lat, leg.alight.lng], {
        title: `Get off at ${leg.alight.name} (${leg.alight.code})`,
        zIndexOffset: 1100,
        icon: L.divIcon({
          html: `<div class="w-4 h-4 m-[3px] rounded-full bg-lemon border-[3px] border-helvetia-950 shadow-md"></div>`,
          className: 'journey-alight-marker',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      })
        .bindPopup(
          `<div class="font-sans text-xs"><div class="font-black text-helvetia-950 text-sm">Get off Bus ${escapeHtml(leg.serviceNo)}</div>
          <div class="text-warm-700">${escapeHtml(leg.alight.name)} · ${leg.alight.code}</div></div>`
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
  }, [journey]);

  // Frame the whole trip when one is chosen
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !journey) return;
    const points: [number, number][] = [
      [journey.from.lat, journey.from.lng],
      [journey.to.lat, journey.to.lng],
      ...journey.legs.flatMap((leg) => leg.path),
    ];
    map.fitBounds(L.latLngBounds(points), TRIP_FIT);
    // Only when a different trip is chosen, not when its lines are upgraded to road geometry
  }, [journey?.id]);

  // Update User Location Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    const userIcon = L.divIcon({
      html: `
        <div class="relative flex items-center justify-center w-8 h-8">
          <div class="absolute w-8 h-8 rounded-full bg-green-blue/30 animate-ping"></div>
          <div class="relative w-4 h-4 rounded-full bg-green-blue border-2 border-white shadow-md"></div>
        </div>
      `,
      className: 'user-pulse-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
      icon: userIcon,
      title: `Your location: ${userLocation.name}`,
      zIndexOffset: 500,
    })
      .bindPopup(
        `<div class="font-sans text-xs">
          <strong class="text-helvetia-900">Your Location</strong><br/>
          <span class="text-warm-600">${escapeHtml(userLocation.name)}</span>
        </div>`
      )
      .addTo(map);
  }, [userLocation]);

  // Update Bus Stops Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const stopsGroup = stopsLayerRef.current;
    if (!map || !stopsGroup) return;

    stopsGroup.clearLayers();

    if (!showStops) return;

    routeDir.stops.forEach((stop) => {
      const isNearest = stop.code === nearestStop.code;
      const isSelected = stop.code === selectedStop.code;
      const isAlight = stop.code === alightStop?.stop.code;

      let iconHtml: string;
      let size: number;

      if (isAlight) {
        size = 28;
        iconHtml = `<div class="w-6 h-6 m-[2px] rounded-full bg-lemon border-[3px] border-helvetia-950 text-helvetia-950 shadow-md flex items-center justify-center">${flagSvg(11)}</div>`;
      } else if (isNearest) {
        size = 28;
        iconHtml = `
          <div class="relative flex items-center justify-center w-7 h-7">
            <div class="absolute w-7 h-7 rounded-full bg-lemon/40 animate-ping"></div>
            <div class="w-5 h-5 rounded-full bg-lemon border-2 border-helvetia shadow-md flex items-center justify-center text-helvetia-950 text-[9px] font-black">★</div>
          </div>
        `;
      } else if (isSelected) {
        size = 22;
        iconHtml = `<div class="w-4 h-4 m-[3px] rounded-full bg-helvetia border-2 border-white shadow-md"></div>`;
      } else {
        // Larger hit area than the visible dot so stops are easy to tap on phones
        size = 22;
        iconHtml = `<div class="w-3 h-3 m-[5px] rounded-full bg-white border-[3px] border-helvetia shadow-xs"></div>`;
      }

      const marker = L.marker([stop.lat, stop.lng], {
        title: `${isAlight ? 'Get off here: ' : isNearest ? 'Nearest stop: ' : ''}${stop.name} (${stop.code})`,
        icon: L.divIcon({
          html: iconHtml,
          className: 'bus-stop-marker',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        zIndexOffset: isAlight ? 400 : isNearest || isSelected ? 300 : 0,
      });

      marker.bindPopup(
        `<div class="font-sans text-xs">
          <div class="font-black text-helvetia-950 text-sm">${escapeHtml(stop.name)}</div>
          <div class="text-warm-500 text-[11px] font-mono mb-1">Stop ${stop.code} • ${escapeHtml(stop.road)}</div>
          ${isNearest ? '<span class="bg-lemon-soft text-helvetia-950 text-[10px] font-bold px-1.5 py-0.5 rounded">Nearest Stop to You</span><br/>' : ''}
          ${isAlight && alightStop ? `<span class="bg-helvetia-950 text-lemon text-[10px] font-bold px-1.5 py-0.5 rounded">${escapeHtml(alightStop.change ? `Get off to change to Bus ${alightStop.change.serviceNo}` : `Get off here for ${alightStop.destinationName}`)}</span><br/>` : ''}
          <div class="mt-2 text-right">
            <button id="select-stop-${stop.code}" class="bg-helvetia text-white text-xs font-bold px-3 py-1.5 rounded-md">View Arrivals</button>
          </div>
        </div>`
      );

      marker.on('popupopen', () => {
        const btn = document.getElementById(`select-stop-${stop.code}`);
        if (btn) {
          btn.onclick = () => {
            onSelectStop(stop);
            marker.closePopup();
          };
        }
      });

      stopsGroup.addLayer(marker);
    });
  }, [routeDir, nearestStop, selectedStop, showStops, onSelectStop, alightStop]);

  // Update incoming bus markers from real LTA GPS positions
  useEffect(() => {
    const map = mapInstanceRef.current;
    const busesGroup = busesLayerRef.current;
    if (!map || !busesGroup) return;

    busesGroup.clearLayers();

    if (!showBuses) return;

    incomingBuses.forEach((bus) => {
      const eta = bus.etaMinutes <= 0 ? 'Arr' : `${bus.etaMinutes} min`;
      const busIcon = L.divIcon({
        html: `
          <div class="flex flex-col items-center">
            <div class="w-9 h-9 rounded-xl bg-helvetia text-white flex flex-col items-center justify-center shadow-lg border-2 border-white ring-2 ring-helvetia-400/40 relative">
              <span class="text-[10px] font-black leading-none">${escapeHtml(bus.serviceNo)}</span>
              <div class="w-4 h-1 rounded-full mt-0.5" style="background-color: ${LOAD_COLOR[bus.load]}"></div>
              <span class="absolute -top-2 -right-2 bg-white text-helvetia border border-helvetia-200 text-[8px] font-black px-1 rounded-full">${bus.ordinal}</span>
            </div>
            <span class="mt-0.5 bg-warm-900/85 text-white text-[10px] font-bold px-1.5 rounded whitespace-nowrap">${eta}</span>
          </div>
        `,
        className: 'live-bus-marker',
        iconSize: [48, 52],
        iconAnchor: [24, 20],
      });

      const marker = L.marker([bus.lat, bus.lng], { icon: busIcon, zIndexOffset: 1000 });

      marker.bindPopup(
        `<div class="font-sans text-xs min-w-[190px]">
          <div class="flex items-center justify-between border-b pb-1 mb-1.5 gap-2">
            <strong class="text-sm font-black text-helvetia-900">Bus ${escapeHtml(bus.serviceNo)}</strong>
            <span class="text-[10px] font-bold bg-helvetia-50 text-helvetia-900 px-1.5 py-0.5 rounded">${ORDINAL_LABEL[bus.ordinal]} bus</span>
          </div>
          <div class="text-warm-700">Arriving at <strong>${escapeHtml(selectedStop.name)}</strong>: <strong>${eta}</strong></div>
          <div class="text-[11px] text-warm-600 mt-1">${LOAD_LABEL[bus.load]} • ${TYPE_LABEL[bus.type]}${bus.feature === 'WAB' ? ' • Wheelchair accessible' : ''}</div>
          <div class="text-[10px] text-warm-500 mt-1.5">GPS position from LTA DataMall</div>
        </div>`
      );

      busesGroup.addLayer(marker);
    });
  }, [incomingBuses, showBuses, selectedStop.name]);

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

  const handleCenterNearest = () => {
    mapInstanceRef.current?.flyTo([nearestStop.lat, nearestStop.lng], 17, { duration: 1 });
  };

  const handleCenterUser = () => {
    mapInstanceRef.current?.flyTo([userLocation.lat, userLocation.lng], 17, { duration: 1 });
  };

  const handleFitTrip = () => {
    if (!mapInstanceRef.current || !journey) return;
    const points: [number, number][] = [
      [journey.from.lat, journey.from.lng],
      [journey.to.lat, journey.to.lng],
      ...journey.legs.flatMap((leg) => leg.path),
    ];
    mapInstanceRef.current.fitBounds(L.latLngBounds(points), TRIP_FIT);
  };

  const handleFitRoute = () => {
    if (mapInstanceRef.current && routeDir.path.length > 0) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(routeDir.path), { padding: [30, 30] });
    }
  };

  const toggleClass = (active: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
      active ? 'bg-helvetia-50 text-helvetia border-helvetia-200' : 'bg-white text-warm-500 border-warm-200'
    }`;
  const actionClass =
    'shrink-0 px-2.5 sm:px-3 py-1.5 bg-white hover:bg-warm-100 text-warm-800 rounded-lg text-xs font-semibold border border-warm-200 shadow-2xs flex items-center gap-1.5';

  return (
    <div className="@container bg-white rounded-2xl border border-warm-200 overflow-hidden shadow-sm relative">
      {/* Map Header & Toolbar */}
      <div className="px-3 sm:px-4 py-3 bg-warm-50 border-b border-warm-200 flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${incomingBuses.length ? 'bg-green-blue animate-pulse' : 'bg-warm-300'}`}
          />
          <span className="font-bold text-sm text-warm-900 truncate">
            {journey ? `Trip to ${journey.to.name}` : `Bus ${route.serviceNo} Live Map`}
          </span>
          <span className="bg-helvetia-100 text-helvetia-900 text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0">
            {incomingBuses.length
              ? `${incomingBuses.length} bus${incomingBuses.length > 1 ? 'es' : ''} tracked`
              : 'No live GPS'}
          </span>
          {incidents.length > 0 && (
            <span
              className="bg-amber-100 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1"
              title="LTA traffic incidents within 150 m of this route"
            >
              <TriangleAlert className="w-3 h-3" />
              {incidents.length} incident{incidents.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Quick Map Controls (scrolls sideways on narrow screens) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
          <button onClick={() => setShowBuses(!showBuses)} className={toggleClass(showBuses)} aria-pressed={showBuses}>
            Buses ({incomingBuses.length})
          </button>
          <button onClick={() => setShowStops(!showStops)} className={toggleClass(showStops)} aria-pressed={showStops}>
            Stops ({routeDir.stops.length})
          </button>
          <button onClick={handleCenterNearest} className={actionClass} title="Focus nearest bus stop" aria-label="Focus nearest bus stop">
            <Navigation className="w-3.5 h-3.5 text-helvetia" />
            <span className="hidden sm:inline">Nearest Stop</span>
          </button>
          <button onClick={handleCenterUser} className={actionClass} title="Center on my location" aria-label="Center on my location">
            <Locate className="w-3.5 h-3.5 text-green-blue" />
            <span className="hidden sm:inline">Me</span>
          </button>
          {journey && (
            <button onClick={handleFitTrip} className={actionClass} title="Show the whole trip" aria-label="Show the whole trip">
              <Route className="w-3.5 h-3.5 text-helvetia" />
              <span className="hidden sm:inline">Trip</span>
            </button>
          )}
          <button onClick={handleFitRoute} className={actionClass} title="Fit whole route" aria-label="Fit whole route">
            <Maximize2 className="w-3.5 h-3.5 text-warm-600" />
            <span className="hidden sm:inline">Full Route</span>
          </button>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative w-full h-[60vh] min-h-[320px] max-h-[520px] sm:h-[460px] lg:h-[520px] bg-warm-100 z-10">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Legend Overlay (compact on phones) */}
        <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl px-2.5 py-2 border border-warm-200/90 shadow-md text-[11px] space-y-1 max-w-[60%]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-blue border border-white inline-block shadow-xs shrink-0" />
            <span className="text-warm-700">You</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-lemon text-helvetia-950 ring-1 ring-helvetia flex items-center justify-center text-[8px] font-bold shrink-0">★</span>
            <span className="text-warm-700 font-medium truncate">Nearest stop ({nearestStop.code})</span>
          </div>
          {alightStop && (
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-lemon border-2 border-helvetia-950 inline-block shrink-0" />
              <span className="text-warm-700 font-medium truncate">Get off ({alightStop.stop.code})</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-helvetia inline-block shadow-2xs shrink-0" />
            <span className="text-warm-700">Bus (live GPS)</span>
          </div>
          {journey && (
            <>
              {journey.legs.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[5px] rounded-full bg-lemon ring-2 ring-helvetia-950 inline-block shrink-0" />
                  <span className="text-warm-700">Your bus</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="w-4 h-0 border-t-[3px] border-dotted border-green-blue-ink inline-block shrink-0" />
                <span className="text-warm-700">Walk (straight line)</span>
              </div>
            </>
          )}
          {incidents.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400 text-[8px] font-black flex items-center justify-center shrink-0">!</span>
              <span className="text-warm-700">Traffic incident</span>
            </div>
          )}
          <div className="hidden sm:flex items-center gap-2">
            <span
              className={`w-4 h-0 border-t-[3px] border-helvetia inline-block shrink-0 ${followsRoads ? '' : 'border-dotted'}`}
            />
            <span className="text-warm-700">{followsRoads ? 'Route (actual roads)' : 'Route (stop to stop)'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
