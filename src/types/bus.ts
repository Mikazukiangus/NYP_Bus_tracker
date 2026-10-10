export type BusLoad = 'SEA' | 'SDA' | 'LSD'; // Seats Available, Standing Available, Limited Standing
export type BusType = 'SD' | 'DD' | 'BD'; // Single Deck, Double Deck, Bendy
export type BusOperator = 'SBST' | 'SMRT' | 'TTS' | 'GAS';

export interface BusStop {
  code: string; // e.g. "09037"
  name: string; // e.g. "Opp Mandarin Orchard"
  road: string; // e.g. "Orchard Rd"
  lat: number;
  lng: number;
  distanceMeters?: number;
  sheltered?: boolean;
}

export interface BusArrivalInfo {
  estimatedMinutes: number; // 0 means "Arr"
  load: BusLoad;
  type: BusType;
  feature: 'WAB' | '';
  busReg?: string; // e.g. "SBS 3290R"
  lat?: number;
  lng?: number;
  speedKmH?: number;
  monitored?: boolean; // true when LTA has a live GPS fix (position is real), false when schedule-based
}

export interface BusServiceArrivals {
  serviceNo: string;
  operator: BusOperator;
  stopCode: string;
  stopName: string;
  roadName: string;
  destination: string;
  direction: number;
  nextBus: BusArrivalInfo | null;
  nextBus2: BusArrivalInfo | null;
  nextBus3: BusArrivalInfo | null;
  lastUpdated: Date;
}

// A real bus approaching the selected stop, positioned from LTA BusArrival GPS data
export interface IncomingBus {
  id: string;
  serviceNo: string;
  ordinal: 1 | 2 | 3; // 1st, 2nd or 3rd bus due at the stop
  lat: number;
  lng: number;
  etaMinutes: number;
  load: BusLoad;
  type: BusType;
  feature: 'WAB' | '';
}

export interface RouteDirection {
  origin: string;
  destination: string;
  stops: BusStop[];
  path: [number, number][];
  pathSource?: 'OPENSTREETMAP'; // set when path follows real roads; otherwise straight stop-to-stop lines
}

export interface BusRoute {
  serviceNo: string;
  operator: BusOperator;
  category: 'Trunk' | 'Feeder' | 'Express';
  source?: 'LTA_DATAMALL' | 'OFFLINE';
  direction1: RouteDirection;
  direction2?: RouteDirection;
}

export interface UserLocation {
  lat: number;
  lng: number;
  name: string;
  isSimulated: boolean;
  accuracyMeters?: number;
}

export interface NEAWeather {
  area: string;
  region: 'Central' | 'East' | 'West' | 'North' | 'South';
  forecast: string;
  temperatureC: number;
  humidityPercent: number;
  rainProbabilityPercent: number;
  isRaining: boolean;
  windSpeedKmh: number;
  updateTime: string;
  iconType: 'fair' | 'cloudy' | 'rain' | 'thunder' | 'heavy-rain';
  commuterAdvice: string;
}

export interface FavoriteItem {
  id: string;
  serviceNo: string;
  stopCode: string;
  stopName: string;
  roadName: string;
  direction: number;
  destination: string;
  savedAt: number;
}
