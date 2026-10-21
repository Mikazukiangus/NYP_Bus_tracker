export interface LTABusStop {
  BusStopCode: string;
  RoadName: string;
  Description: string;
  Latitude: number;
  Longitude: number;
}

export interface LTABusRouteRow {
  ServiceNo: string;
  Operator: string;
  Direction: number;
  StopSequence: number;
  BusStopCode: string;
  Distance?: number; // km travelled from the first stop
  // "HHmm", or "-" when the service doesn't run that day
  WD_FirstBus?: string;
  WD_LastBus?: string;
  SAT_FirstBus?: string;
  SAT_LastBus?: string;
  SUN_FirstBus?: string;
  SUN_LastBus?: string;
}

export interface LTABusServiceRow {
  ServiceNo: string;
  Operator: string;
  Direction?: number; // Metadata-only; route rows own the actual direction.
  Category: string;
}

export interface Datasets {
  stops: Map<string, LTABusStop>; // keyed by BusStopCode
  routes: Map<string, LTABusRouteRow[]>; // keyed by upper-case ServiceNo
  services: Map<string, LTABusServiceRow>;
  loadedAt: number;
}
