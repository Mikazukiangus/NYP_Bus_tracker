import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { BusRoute, BusStop, IncomingBus, UserLocation } from '../types/bus';
import { Navigation, Locate, Maximize2 } from 'lucide-react';

interface LiveBusMapProps {
  route: BusRoute;
  direction: number;
  nearestStop: BusStop;
  selectedStop: BusStop;
  onSelectStop: (stop: BusStop) => void;
  userLocation: UserLocation;
  incomingBuses: IncomingBus[];
}

// OneMap: Singapore Land Authority's free official basemap (no key; attribution required)
const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:16px;width:16px;display:inline;vertical-align:-3px"/>&nbsp;' +
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
const OSM_ROUTE_ATTRIBUTION =
  'Route lines &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const ONEMAP_STYLES = { Default: 'Standard', Grey: 'Grey', Night: 'Night' } as const;
// OneMap only serves tiles for Singapore
const SINGAPORE_BOUNDS = L.latLngBounds([1.144, 103.535], [1.494, 104.502]);

const ORDINAL_LABEL = { 1: '1st', 2: '2nd', 3: '3rd' } as const;
const LOAD_LABEL = { SEA: 'Seats available', SDA: 'Standing available', LSD: 'Limited standing' } as const;
const LOAD_COLOR = { SEA: '#10b981', SDA: '#f59e0b', LSD: '#ef4444' } as const;
const TYPE_LABEL = { SD: 'Single deck', DD: 'Double deck', BD: 'Bendy' } as const;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const LiveBusMap: React.FC<LiveBusMapProps> = ({
  route,
  direction,
  nearestStop,
  selectedStop,
  onSelectStop,
  userLocation,
  incomingBuses
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const routeLayerRef = useRef<L.Polyline | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const busesLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [showStops, setShowStops] = useState(true);
  const [showBuses, setShowBuses] = useState(true);

  const routeDir = direction === 2 && route.direction2 ? route.direction2 : route.direction1;
  const followsRoads = routeDir.pathSource === 'OPENSTREETMAP';

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

    stopsLayerRef.current = L.layerGroup().addTo(map);
    busesLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
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
        color: '#602a85',
        weight: 5,
        opacity: 0.85,
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
  }, [routeDir, followsRoads]);

  // Frame the user and their nearest stop whenever the route, direction or location changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bounds = L.latLngBounds([
      [userLocation.lat, userLocation.lng],
      [nearestStop.lat, nearestStop.lng],
    ]);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
  }, [route.serviceNo, direction, nearestStop.code, userLocation.lat, userLocation.lng]);

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
          <div class="absolute w-8 h-8 rounded-full bg-blue-500/30 animate-ping"></div>
          <div class="relative w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
        </div>
      `,
      className: 'user-pulse-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 500 })
      .bindPopup(
        `<div class="font-sans text-xs">
          <strong class="text-blue-900">Your Location</strong><br/>
          <span class="text-slate-600">${escapeHtml(userLocation.name)}</span>
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

      let iconHtml: string;
      let size: number;

      if (isNearest) {
        size = 28;
        iconHtml = `
          <div class="relative flex items-center justify-center w-7 h-7">
            <div class="absolute w-7 h-7 rounded-full bg-purple-500/40 animate-ping"></div>
            <div class="w-5 h-5 rounded-full bg-[#602a85] border-2 border-white shadow-md flex items-center justify-center text-white text-[9px] font-black">★</div>
          </div>
        `;
      } else if (isSelected) {
        size = 22;
        iconHtml = `<div class="w-4 h-4 m-[3px] rounded-full bg-red-600 border-2 border-white shadow-md"></div>`;
      } else {
        // Larger hit area than the visible dot so stops are easy to tap on phones
        size = 22;
        iconHtml = `<div class="w-3 h-3 m-[5px] rounded-full bg-white border-[3px] border-[#602a85] shadow-xs"></div>`;
      }

      const marker = L.marker([stop.lat, stop.lng], {
        icon: L.divIcon({
          html: iconHtml,
          className: 'bus-stop-marker',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        zIndexOffset: isNearest || isSelected ? 300 : 0,
      });

      marker.bindPopup(
        `<div class="font-sans text-xs">
          <div class="font-black text-purple-950 text-sm">${escapeHtml(stop.name)}</div>
          <div class="text-slate-500 text-[11px] font-mono mb-1">Stop ${stop.code} • ${escapeHtml(stop.road)}</div>
          ${isNearest ? '<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">Nearest Stop to You</span><br/>' : ''}
          <div class="mt-2 text-right">
            <button id="select-stop-${stop.code}" class="bg-[#602a85] text-white text-xs font-bold px-3 py-1.5 rounded-md">View Arrivals</button>
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
  }, [routeDir, nearestStop, selectedStop, showStops, onSelectStop]);

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
            <div class="w-9 h-9 rounded-xl bg-[#602a85] text-white flex flex-col items-center justify-center shadow-lg border-2 border-white ring-2 ring-purple-400/40 relative">
              <span class="text-[10px] font-black leading-none">${escapeHtml(bus.serviceNo)}</span>
              <div class="w-4 h-1 rounded-full mt-0.5" style="background-color: ${LOAD_COLOR[bus.load]}"></div>
              <span class="absolute -top-2 -right-2 bg-white text-[#602a85] border border-purple-200 text-[8px] font-black px-1 rounded-full">${bus.ordinal}</span>
            </div>
            <span class="mt-0.5 bg-slate-900/85 text-white text-[10px] font-bold px-1.5 rounded whitespace-nowrap">${eta}</span>
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
            <strong class="text-sm font-black text-purple-900">Bus ${escapeHtml(bus.serviceNo)}</strong>
            <span class="text-[10px] font-bold bg-purple-50 text-purple-900 px-1.5 py-0.5 rounded">${ORDINAL_LABEL[bus.ordinal]} bus</span>
          </div>
          <div class="text-slate-700">Arriving at <strong>${escapeHtml(selectedStop.name)}</strong>: <strong>${eta}</strong></div>
          <div class="text-[11px] text-slate-600 mt-1">${LOAD_LABEL[bus.load]} • ${TYPE_LABEL[bus.type]}${bus.feature === 'WAB' ? ' • Wheelchair accessible' : ''}</div>
          <div class="text-[10px] text-slate-400 mt-1.5">GPS position from LTA DataMall</div>
        </div>`
      );

      busesGroup.addLayer(marker);
    });
  }, [incomingBuses, showBuses, selectedStop.name]);

  const handleCenterNearest = () => {
    mapInstanceRef.current?.flyTo([nearestStop.lat, nearestStop.lng], 17, { duration: 1 });
  };

  const handleCenterUser = () => {
    mapInstanceRef.current?.flyTo([userLocation.lat, userLocation.lng], 17, { duration: 1 });
  };

  const handleFitRoute = () => {
    if (mapInstanceRef.current && routeDir.path.length > 0) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(routeDir.path), { padding: [30, 30] });
    }
  };

  const toggleClass = (active: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
      active ? 'bg-purple-50 text-[#602a85] border-purple-200' : 'bg-white text-slate-500 border-slate-200'
    }`;
  const actionClass =
    'shrink-0 px-2.5 sm:px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200 shadow-2xs flex items-center gap-1.5';

  return (
    <div className="@container bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm relative">
      {/* Map Header & Toolbar */}
      <div className="px-3 sm:px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${incomingBuses.length ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}
          />
          <span className="font-bold text-sm text-slate-900 truncate">Bus {route.serviceNo} Live Map</span>
          <span className="bg-purple-100 text-purple-900 text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0">
            {incomingBuses.length
              ? `${incomingBuses.length} bus${incomingBuses.length > 1 ? 'es' : ''} tracked`
              : 'No live GPS'}
          </span>
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
            <Navigation className="w-3.5 h-3.5 text-[#602a85]" />
            <span className="hidden sm:inline">Nearest Stop</span>
          </button>
          <button onClick={handleCenterUser} className={actionClass} title="Center on my location" aria-label="Center on my location">
            <Locate className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Me</span>
          </button>
          <button onClick={handleFitRoute} className={actionClass} title="Fit whole route" aria-label="Fit whole route">
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Full Route</span>
          </button>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative w-full h-[60vh] min-h-[320px] max-h-[520px] sm:h-[460px] lg:h-[520px] bg-slate-100 z-10">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Legend Overlay (compact on phones) */}
        <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl px-2.5 py-2 border border-slate-200/90 shadow-md text-[11px] space-y-1 max-w-[60%]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600 border border-white inline-block shadow-xs shrink-0" />
            <span className="text-slate-700">You</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#602a85] text-white flex items-center justify-center text-[8px] font-bold shrink-0">★</span>
            <span className="text-slate-700 font-medium truncate">Nearest stop ({nearestStop.code})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-[#602a85] inline-block shadow-2xs shrink-0" />
            <span className="text-slate-700">Bus (live GPS)</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span
              className={`w-4 h-0 border-t-[3px] border-[#602a85] inline-block shrink-0 ${followsRoads ? '' : 'border-dotted'}`}
            />
            <span className="text-slate-700">{followsRoads ? 'Route (actual roads)' : 'Route (stop to stop)'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
