import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { BusRoute, BusStop, LiveBus, UserLocation } from '../types/bus';
import { Navigation, Locate, Layers, Eye, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

interface LiveBusMapProps {
  route: BusRoute;
  direction: number;
  nearestStop: BusStop;
  selectedStop: BusStop;
  onSelectStop: (stop: BusStop) => void;
  userLocation: UserLocation;
  liveBuses: LiveBus[];
}

export const LiveBusMap: React.FC<LiveBusMapProps> = ({
  route,
  direction,
  nearestStop,
  selectedStop,
  onSelectStop,
  userLocation,
  liveBuses
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const routeLayerRef = useRef<L.Polyline | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const busesLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [showStops, setShowStops] = useState(true);
  const [showBuses, setShowBuses] = useState(true);
  const [selectedBus, setSelectedBus] = useState<LiveBus | null>(null);

  const routeDir = direction === 2 && route.direction2 ? route.direction2 : route.direction1;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    // Create Leaflet map centered on Singapore
    const map = L.map(mapContainerRef.current, {
      center: [nearestStop.lat, nearestStop.lng],
      zoom: 15,
      zoomControl: false,
    });

    // Add crisp OpenStreetMap / Carto tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Create layer groups
    stopsLayerRef.current = L.layerGroup().addTo(map);
    busesLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Route Polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (routeDir.path.length > 0) {
      const poly = L.polyline(routeDir.path, {
        color: '#602a85',
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      routeLayerRef.current = poly;
    }
  }, [routeDir]);

  // Update User Location Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    const userIconHtml = `
      <div class="relative flex items-center justify-center">
        <div class="absolute w-8 h-8 rounded-full bg-blue-500/30 animate-ping"></div>
        <div class="relative w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-[8px]">
        </div>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userIconHtml,
      className: 'user-pulse-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const marker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
      .bindPopup(
        `<div class="p-1 font-sans text-xs">
          <strong class="text-blue-900">Your Location</strong><br/>
          <span class="text-slate-600">${userLocation.name}</span>
        </div>`
      )
      .addTo(map);

    userMarkerRef.current = marker;
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

      let iconHtml = '';
      let size = 16;

      if (isNearest) {
        size = 28;
        iconHtml = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-7 h-7 rounded-full bg-purple-500/40 animate-ping"></div>
            <div class="w-5 h-5 rounded-full bg-[#602a85] border-2 border-white shadow-md flex items-center justify-center text-white text-[9px] font-black">
              ★
            </div>
          </div>
        `;
      } else if (isSelected) {
        size = 22;
        iconHtml = `
          <div class="w-4 h-4 rounded-full bg-red-600 border-2 border-white shadow-md"></div>
        `;
      } else {
        size = 14;
        iconHtml = `
          <div class="w-3 h-3 rounded-full bg-slate-700 hover:bg-[#602a85] border border-white shadow-xs"></div>
        `;
      }

      const stopIcon = L.divIcon({
        html: iconHtml,
        className: 'bus-stop-marker',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon });

      marker.bindPopup(
        `<div class="font-sans text-xs p-1">
          <div class="font-black text-purple-950 text-sm">${stop.name}</div>
          <div class="text-slate-500 text-[11px] font-mono mb-1">Stop ${stop.code} • ${stop.road}</div>
          ${isNearest ? '<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">Nearest Stop to You</span><br/>' : ''}
          <div class="mt-2 text-right">
            <button id="select-stop-${stop.code}" class="bg-[#602a85] text-white text-[11px] font-bold px-2 py-1 rounded">View Arrivals</button>
          </div>
        </div>`
      );

      marker.on('popupopen', () => {
        const btn = document.getElementById(`select-stop-${stop.code}`);
        if (btn) {
          btn.onclick = () => {
            onSelectStop(stop);
          };
        }
      });

      stopsGroup.addLayer(marker);
    });
  }, [routeDir, nearestStop, selectedStop, showStops, onSelectStop]);

  // Update Live Moving Buses Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const busesGroup = busesLayerRef.current;
    if (!map || !busesGroup) return;

    busesGroup.clearLayers();

    if (!showBuses) return;

    liveBuses.forEach((bus) => {
      const loadColor =
        bus.load === 'SEA' ? '#10b981' : bus.load === 'SDA' ? '#f59e0b' : '#ef4444';

      const busIconHtml = `
        <div class="relative group cursor-pointer" style="transform: rotate(0deg)">
          <div class="w-8 h-8 rounded-xl bg-[#602a85] text-white flex flex-col items-center justify-center shadow-lg border-2 border-white ring-2 ring-purple-400/40 relative">
            <span class="text-[9px] font-black leading-none">${bus.serviceNo}</span>
            <div class="w-4 h-1 rounded-full mt-0.5" style="background-color: ${loadColor}"></div>
            ${bus.type === 'DD' ? '<span class="absolute -top-1.5 -right-1.5 bg-amber-400 text-slate-900 text-[8px] font-black px-1 rounded-full">DD</span>' : ''}
          </div>
        </div>
      `;

      const busIcon = L.divIcon({
        html: busIconHtml,
        className: 'live-bus-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([bus.lat, bus.lng], { icon: busIcon });

      marker.bindPopup(
        `<div class="font-sans text-xs p-1 min-w-[180px]">
          <div class="flex items-center justify-between border-b pb-1 mb-1.5">
            <strong class="text-sm font-black text-purple-900">Bus ${bus.serviceNo}</strong>
            <span class="text-[10px] font-mono bg-slate-100 px-1 py-0.5 rounded">${bus.busReg}</span>
          </div>
          <div class="text-[11px] text-slate-600 mb-1">
            <strong>Speed:</strong> ${bus.speedKmH} km/h • <strong>Load:</strong> ${bus.load} (${bus.load === 'SEA' ? 'Seats Avail' : bus.load === 'SDA' ? 'Standing' : 'Crowded'})
          </div>
          <div class="text-[11px] text-slate-700 bg-purple-50 p-1.5 rounded">
            Next: <strong>${bus.nextStopName}</strong> (${bus.nextStopCode})
          </div>
        </div>`
      );

      marker.on('click', () => {
        setSelectedBus(bus);
      });

      busesGroup.addLayer(marker);
    });
  }, [liveBuses, showBuses]);

  // Center on Nearest Stop
  const handleCenterNearest = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([nearestStop.lat, nearestStop.lng], 16, { duration: 1 });
    }
  };

  // Center on User
  const handleCenterUser = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([userLocation.lat, userLocation.lng], 16, { duration: 1 });
    }
  };

  // Fit Entire Route
  const handleFitRoute = () => {
    if (mapInstanceRef.current && routeDir.path.length > 0) {
      const bounds = L.latLngBounds(routeDir.path);
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm relative">
      {/* Map Header & Toolbar */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-bold text-xs sm:text-sm text-slate-900">
            Live Bus Radar: Service {route.serviceNo}
          </span>
          <span className="bg-purple-100 text-purple-900 text-[11px] font-bold px-2 py-0.5 rounded-md">
            {liveBuses.length} Active Buses on Road
          </span>
        </div>

        {/* Quick Map Controls */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setShowBuses(!showBuses)}
            className={`px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${
              showBuses
                ? 'bg-purple-50 text-[#602a85] border-purple-200'
                : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            Buses ({liveBuses.length})
          </button>

          <button
            onClick={() => setShowStops(!showStops)}
            className={`px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${
              showStops
                ? 'bg-purple-50 text-[#602a85] border-purple-200'
                : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            Stops ({routeDir.stops.length})
          </button>

          <button
            onClick={handleCenterNearest}
            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-md font-semibold border border-slate-200 shadow-2xs flex items-center gap-1"
            title="Focus Nearest Bus Stop"
          >
            <Navigation className="w-3 h-3 text-[#602a85]" />
            <span>Nearest Stop</span>
          </button>

          <button
            onClick={handleCenterUser}
            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-md font-semibold border border-slate-200 shadow-2xs flex items-center gap-1"
            title="Center on my location"
          >
            <Locate className="w-3 h-3 text-blue-600" />
            <span>My GPS</span>
          </button>

          <button
            onClick={handleFitRoute}
            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-md font-semibold border border-slate-200 shadow-2xs hidden sm:flex items-center gap-1"
            title="Fit whole route"
          >
            <span>Full Route</span>
          </button>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative w-full h-[380px] sm:h-[460px] bg-slate-100 z-10">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Legend Overlay at Bottom-Left */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl p-2.5 border border-slate-200/90 shadow-md text-[11px] space-y-1">
          <div className="font-bold text-slate-900 border-b pb-1 mb-1">Map Legend</div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600 border border-white inline-block shadow-xs" />
            <span className="text-slate-700">Your Location</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#602a85] text-white flex items-center justify-center text-[8px] font-bold">★</span>
            <span className="text-slate-700 font-medium">Nearest Stop ({nearestStop.code})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-[#602a85] inline-block shadow-2xs" />
            <span className="text-slate-700">Live Bus {route.serviceNo}</span>
          </div>
        </div>

        {/* Floating Active Bus Telemetry Drawer if user clicked a bus */}
        {selectedBus && (
          <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl p-3 border border-purple-200 shadow-lg text-xs max-w-[240px]">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <strong className="text-purple-900 font-bold">Bus {selectedBus.serviceNo} Telemetry</strong>
              <button
                onClick={() => setSelectedBus(null)}
                className="text-slate-400 hover:text-slate-700 text-xs px-1"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 space-y-1 text-slate-600 text-[11px]">
              <div>Plate: <span className="font-mono font-bold text-slate-900">{selectedBus.busReg}</span></div>
              <div>Type: <span className="font-semibold">{selectedBus.type === 'DD' ? 'Double Deck' : 'Single Deck'}</span></div>
              <div>Current Speed: <span className="font-bold text-slate-900">{selectedBus.speedKmH} km/h</span></div>
              <div>Next Stop: <span className="font-medium text-purple-900">{selectedBus.nextStopName}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
