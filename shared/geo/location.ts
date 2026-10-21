export type PlaceKind = 'place' | 'address' | 'postal' | 'stop';
export interface PlaceReference {
  id: string;
  provider: 'lta' | 'onemap' | 'preset';
  stopCode?: string;
  postalCode?: string;
}
export interface UserLocation {
  lat: number; lng: number; name: string;
  source: 'gps' | 'selected-place' | 'default';
  capturedAtMs?: number; // unknown for legacy saved GPS fixes
  selectedAtMs?: number;
  accuracyMeters?: number;
  kind?: PlaceKind;
  address?: string;
  placeRef?: PlaceReference;
}
