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

export interface LiveBus {
  id: string;
  serviceNo: string;
  operator: BusOperator;
  lat: number;
  lng: number;
  heading: number;
  speedKmH: number;
  load: BusLoad;
  type: BusType;
  busReg: string;
  direction: number;
  currentStopIndex: number;
  nextStopName: string;
  nextStopCode: string;
  etaMinutesToNextStop: number;
}

export interface BusRoute {
  serviceNo: string;
  operator: BusOperator;
  category: 'Trunk' | 'Feeder' | 'Express';
  source?: 'LTA_DATAMALL' | 'OFFLINE';
  direction1: {
    origin: string;
    destination: string;
    stops: BusStop[];
    path: [number, number][];
  };
  direction2?: {
    origin: string;
    destination: string;
    stops: BusStop[];
    path: [number, number][];
  };
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
