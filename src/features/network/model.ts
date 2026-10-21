import type { StopCallRef, PhysicalStop, Direction } from '../../../shared/transit/routes';
export interface NetStop extends PhysicalStop {
  call?: StopCallRef;
  index: number;
}

// One direction of one service, in stop order
export interface NetPattern {
  index: number;
  serviceNo: string;
  direction: Direction;
  stops: number[]; // indexes into BusNetwork.stops
  distM: number[]; // cumulative road distance from the first stop, metres
}

export interface TransferNeighbour {
  readonly index: number;
  readonly distanceM: number;
}

export const serviceDirectionKey = (serviceNo: string, direction: number) => `${serviceNo.trim().toUpperCase()}:${direction}`;

export interface BusNetwork {
  generatedAt: string;
  datasetVersion?: string;
  stops: NetStop[];
  byCode: Map<string, NetStop>;
  patterns: NetPattern[];
  byServiceDirection: Map<string, NetPattern>;
  transferNeighboursByRadius: Map<number, Map<number, readonly TransferNeighbour[]>>;
  patternsAtStop: number[][]; // stop index -> pattern indexes calling there
  grid: Map<string, number[]>; // spatial grid cell -> stop indexes
}

export interface StopWithDistance {
  stop: NetStop;
  distanceM: number;
}

export interface StopService {
  serviceNo: string;
  direction: Direction;
  towards: string; // last stop of this direction
}

export interface NearbyStop {
  stop: NetStop;
  distanceM: number;
  services: StopService[]; // services that can be boarded here, in number order
}
