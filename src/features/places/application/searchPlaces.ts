import type { BusNetwork } from '../../network/model';
import { searchStops } from '../../network/domain/queries';
import type { PlaceResult, PlaceSearchState } from '../model';
import { isStopCode, mergeSearchResults } from '../domain/searchPolicy';
import { stopToPlace } from '../domain/locations';
export type SearchRemotePlaces = (query: string, signal?: AbortSignal) => Promise<PlaceResult[] | null>;
export function localPlaceMatches(query: string, network: BusNetwork | null): PlaceResult[] {
  return network ? searchStops(network, query, isStopCode(query) ? 5 : 3).map(stopToPlace) : [];
}
export async function searchPlaces(query: string, network: BusNetwork | null, searchRemote: SearchRemotePlaces, signal?: AbortSignal): Promise<PlaceSearchState> {
  const q = query.trim();
  if (q.length < 2) return { results: [], status: 'idle', addressSearchFailed: false };
  const stops = localPlaceMatches(q, network);
  if (isStopCode(q)) return mergeSearchResults([], stops);
  return mergeSearchResults(await searchRemote(q, signal), stops);
}
