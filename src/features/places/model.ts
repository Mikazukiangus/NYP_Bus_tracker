import type { PlaceKind, PlaceReference } from '../../../shared/geo/location';
export type { PlaceKind } from '../../../shared/geo/location';

export interface PlaceResult {
  id: string;
  kind: PlaceKind;
  placeRef?: PlaceReference;
  name: string;
  subtitle?: string;
  lat: number;
  lng: number;
}

export type PlaceSearchStatus = 'idle' | 'loading' | 'done';

export interface PlaceSearchState {
  results: PlaceResult[];
  status: PlaceSearchStatus;
  addressSearchFailed: boolean; // OneMap unavailable: only bus stops are shown
}
