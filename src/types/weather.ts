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
  rainfall?: StationReadings; // mm in the last 5 minutes
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
  psi?: BandedReading;
  pm25?: BandedReading;
  uv?: BandedReading;
  heatStress?: BandedReading;
  lightning?: { count: number; nearestKm: number; windowMinutes: number; time?: string };
  today?: NonNullable<WeatherSnapshot['forecast24h']> & { regionPeriods: { text: string; forecast: string }[] };
  outlook?: NonNullable<WeatherSnapshot['outlook4d']>;
  alerts: { tone: Tone; title: string; detail: string }[];
  missing: WeatherDatasetKey[];
  stale: WeatherDatasetKey[];
}
