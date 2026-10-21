import { useEffect, useState } from 'react';
import type { BusNetwork } from '../../network/model';
import type { PlaceSearchState } from '../model';
import { isStopCode } from '../domain/searchPolicy';
import { oneMapClient } from '../data/oneMapClient';
import { localPlaceMatches, searchPlaces, type SearchRemotePlaces } from './searchPlaces';
const SEARCH_DEBOUNCE_MS = 350;

// Debounced search across OneMap places/postal codes and LTA bus stops (by name or 5-digit code)
export function usePlaceSearch(query: string, network: BusNetwork | null, searchRemote: SearchRemotePlaces = oneMapClient.search): PlaceSearchState {
  const [state, setState] = useState<PlaceSearchState>({ results: [], status: 'idle', addressSearchFailed: false });

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setState({ results: [], status: 'idle', addressSearchFailed: false });
      return;
    }
    // A 5-digit number is a bus stop code (Singapore postal codes have 6 digits)
    if (isStopCode(q)) {
      setState({ results: localPlaceMatches(q, network), status: 'done', addressSearchFailed: false });
      return;
    }
    setState((prev) => ({ ...prev, status: 'loading' }));

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await searchPlaces(q, network, searchRemote, controller.signal);
      if (controller.signal.aborted) return;
      setState(result);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, network, searchRemote]);

  return state;
}
