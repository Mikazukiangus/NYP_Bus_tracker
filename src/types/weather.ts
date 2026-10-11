// Shared between api/weather.ts (which builds the snapshot) and the client (which summarises it)

export type LatLng = { lat: number; lng: number };
export type WeatherRegion = 'north' | 'south' | 'east' | 'west' | 'central';

export type WeatherDatasetKey =
  | 'forecast2h' | 'temperature' | 'rainfall' | 'psi' | 'pm25' | 'humidity'
  | 'forecast24h' | 'uv' | 'lightning' | 'wbgt' | 'windSpeed' | 'outlook4d';

export interface StationReadings {
  timestamp: string;
  unit: string;
  stations: (LatLng & { id: string; name: string; value: number })[];
}

// The last hour of 5-minute rainfall at every NEA rain gauge, oldest reading first. Each reading's values follow
// the station order (mm in those 5 minutes; null where a gauge didn't report).
export interface RainfallHistory {
  stations: (LatLng & { id: string; name: string })[];
  readings: { timestamp: string; values: (number | null)[] }[];
}

// Rain around a place now and where it's heading, from the last hour of rain gauge readings (rainNowcast.ts)
export type RainNowcast =
  | { status: 'unknown' }
  // Rain at the gauges around you now
  | {
      status: 'raining';
      mmPerHour: number;
      label: string;
      tone: Tone;
      station: string;
      distanceKm: number;
      sinceMin: number; // how long it has been raining here (at least this long if sinceAtLeast)
      sinceAtLeast: boolean;
    }
  // Rain at the gauges around you in the last 15 minutes, but not in the latest reading
  | { status: 'stopped'; minutesAgo: number }
  // A shower within 10 km getting closer: the nearest wet gauge's distance and direction, when it should reach
  // you, and whether it's close and wide enough that it usually does (within 5 km, 2+ wet gauges)
  | {
      status: 'approaching';
      distanceKm: number;
      direction: string;
      etaMin: [number, number];
      speedKmh: number;
      likely: boolean;
    }
  // Rain within 20 km that isn't clearly heading your way
  | { status: 'nearby'; distanceKm: number; direction: string; movingAway: boolean }
  // No rain within 20 km
  | { status: 'clear' };

// Singapore-wide snapshot of NEA's real-time datasets; any dataset may be absent if data.gov.sg was unavailable
export interface WeatherSnapshot {
  forecast2h?: { validText: string; updated: string; areas: (LatLng & { name: string; forecast: string })[] };
  forecast24h?: {
    validText: string;
    forecast: string;
    temperature: { low: number; high: number };
    humidity: { low: number; high: number };
    wind: { direction: string; low: number; high: number };
    periods: { text: string; regions: Partial<Record<WeatherRegion, string>> }[];
  };
  outlook4d?: { day: string; date: string; forecast: string; summary: string; low: number; high: number }[];
  temperature?: StationReadings;
  humidity?: StationReadings;
  rainfall?: StationReadings & { history?: RainfallHistory }; // mm in the last 5 minutes, and in the last hour's readings
  windSpeed?: StationReadings; // knots
  psi?: {
    timestamp: string;
    regions: (LatLng & { name: WeatherRegion; psi24h: number; pm25_24h: number; pm10_24h: number; o3_8h: number })[];
  };
  pm25?: { timestamp: string; regions: (LatLng & { name: WeatherRegion; value: number })[] };
  uv?: { timestamp: string; value: number };
  lightning?: { timestamp: string; strikes: (LatLng & { type: string; time: string })[] };
  wbgt?: { timestamp: string; stations: (LatLng & { name: string; value: number; heatStress: string })[] };
  fetchedAt: Partial<Record<WeatherDatasetKey, string>>;
  missing: WeatherDatasetKey[];
  stale: WeatherDatasetKey[];
  source: 'NEA_DATA_GOV_SG';
}

export type Tone = 'good' | 'moderate' | 'warn' | 'bad' | 'severe';

export interface Reading<T = number> {
  value: T;
  station?: string;
  distanceKm?: number;
  time?: string;
}

export interface BandedReading extends Reading {
  label: string;
  tone: Tone;
}

export interface WeatherAlert {
  kind: 'lightning' | 'rain' | 'air' | 'heat' | 'uv' | 'ok';
  tone: Tone;
  title: string;
  detail: string;
}

// Everything the widget shows, already resolved for the user's location
export interface WeatherSummary {
  area: string;
  region: WeatherRegion;
  forecast2h?: { text: string; validText: string; updated: string };
  iconType: 'fair' | 'fair-night' | 'cloudy' | 'rain' | 'thunder' | 'haze';
  temperature?: Reading;
  humidity?: Reading;
  windKmh?: Reading;
  rain?: BandedReading & { rainingNearby: boolean; nearbyStations: number; wetStations: number };
  nowcast?: RainNowcast; // where rain is and where it's heading, when the last hour of readings is available
  psi?: BandedReading;
  pm25?: BandedReading;
  uv?: BandedReading;
  heatStress?: BandedReading;
  lightning?: { count: number; nearestKm: number; windowMinutes: number; time?: string };
  today?: NonNullable<WeatherSnapshot['forecast24h']> & { regionPeriods: { text: string; forecast: string }[] };
  outlook?: NonNullable<WeatherSnapshot['outlook4d']>;
  alerts: WeatherAlert[];
  missing: WeatherDatasetKey[];
  stale: WeatherDatasetKey[];
}
