import { useEffect, useState } from 'react';
import type { UserLocation } from '../types/bus';
import { isSingaporeLocation } from './userLocation';
import { BusNetwork, searchStops } from './busNetwork';

export type PlaceKind = 'place' | 'address' | 'postal' | 'stop';

export interface PlaceResult {
  id: string;
  kind: PlaceKind;
  name: string;
  subtitle?: string;
  lat: number;
  lng: number;
}

// OneMap (Singapore Land Authority) search: addresses, buildings and 6-digit postal codes.
// Works without a token from the browser (CORS allowed); first page only, so up to 10 results.
const ONEMAP_SEARCH = 'https://www.onemap.gov.sg/api/common/elastic/search';

export const isPostalCode = (query: string) => /^\d{6}$/.test(query.trim());
export const isStopCode = (query: string) => /^\d{5}$/.test(query.trim());

// Kept upper-case when title-casing OneMap's ALL-CAPS names
const ACRONYMS = new Set(
  'MRT LRT HDB NTUC NUS NTU SMU SUTD SIT SUSS ITE NYP SP TP RP NP CC CBD ECP PIE CTE AYE BKE KJE SLE TPE MCE KPE ICA MOE MOM CPF IRAS GV YMCA YWCA SAFRA AMK YCK SGH KKH NUH TTSH CGH SKH KTPH NHB ACS SJI RI HCI VJC DHL UOB OCBC DBS POSB IMM JEM NEX ION SG'.split(
    ' '
  )
);

export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/(\s+|\/|-|\()/)
    .map((part) => {
      const bare = part.replace(/[^a-z0-9]/g, '').toUpperCase();
      if (!bare) return part;
      // Codes such as CG2, NS16 or B1 stay upper-case, as do known acronyms
      if (ACRONYMS.has(bare) || (/\d/.test(bare) && /[A-Z]/.test(bare))) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

interface OneMapResult {
  SEARCHVAL?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  BUILDING?: string;
  ADDRESS?: string;
  POSTAL?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
}

const present = (value?: string) => (value && value !== 'NIL' ? value.trim() : '');

export function parseOneMapResults(results: OneMapResult[], query: string): PlaceResult[] {
  const seen = new Set<string>();
  const places: PlaceResult[] = [];
  for (const r of results) {
    const lat = Number(r.LATITUDE);
    const lng = Number(r.LONGITUDE);
    if (!isSingaporeLocation(lat, lng)) continue;

    const postal = present(r.POSTAL);
    const street = [present(r.BLK_NO), titleCase(present(r.ROAD_NAME))].filter(Boolean).join(' ');
    const searchVal = present(r.SEARCHVAL);
    // SEARCHVAL is the matched landmark/building name, or the whole address for plain addresses
    const isAddressOnly = !searchVal || (postal !== '' && searchVal.endsWith(postal));
    const name = isAddressOnly ? street || titleCase(searchVal) : titleCase(searchVal);
    const subtitle = [isAddressOnly ? '' : street, postal ? `Singapore ${postal}` : ''].filter(Boolean).join(', ');
    if (!name) continue;

    const key = `${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      id: `onemap:${key}`,
      kind: isPostalCode(query) ? 'postal' : isAddressOnly ? 'address' : 'place',
      name,
      subtitle: subtitle || undefined,
      lat,
      lng,
    });
  }
  // OneMap's order is loose (e.g. "Jurong Point" lists a clinic first): put exact and prefix name matches first
  const q = query.trim().toLowerCase();
  const rank = (p: PlaceResult) => {
    const name = p.name.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) return 2;
    return 3;
  };
  return places.map((p, i) => ({ p, i, r: rank(p) })).sort((a, b) => a.r - b.r || a.i - b.i).map(({ p }) => p);
}

// null when OneMap can't be reached or rate-limits us
export async function searchOneMap(query: string, signal?: AbortSignal): Promise<PlaceResult[] | null> {
  try {
    const url = `${ONEMAP_SEARCH}?searchVal=${encodeURIComponent(query.trim())}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: OneMapResult[] };
    return Array.isArray(body?.results) ? parseOneMapResults(body.results, query) : null;
  } catch {
    return null;
  }
}

export function stopToPlace(stop: { code: string; name: string; road: string; lat: number; lng: number }): PlaceResult {
  return {
    id: `stop:${stop.code}`,
    kind: 'stop',
    name: stop.name,
    subtitle: `Bus stop ${stop.code} · ${stop.road}`,
    lat: stop.lat,
    lng: stop.lng,
  };
}

export function placeToLocation(place: PlaceResult): UserLocation {
  return {
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    isSimulated: true, // a chosen place, not the device's GPS position
    kind: place.kind,
    ...(place.subtitle ? { address: place.subtitle } : {}),
  };
}

export type PlaceSearchStatus = 'idle' | 'loading' | 'done';

export interface PlaceSearchState {
  results: PlaceResult[];
  status: PlaceSearchStatus;
  addressSearchFailed: boolean; // OneMap unavailable: only bus stops are shown
}

const SEARCH_DEBOUNCE_MS = 350;

// Debounced search across OneMap places/postal codes and LTA bus stops (by name or 5-digit code)
export function usePlaceSearch(query: string, network: BusNetwork | null): PlaceSearchState {
  const [state, setState] = useState<PlaceSearchState>({ results: [], status: 'idle', addressSearchFailed: false });

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setState({ results: [], status: 'idle', addressSearchFailed: false });
      return;
    }
    const stops = network ? searchStops(network, q, isStopCode(q) ? 5 : 3).map(stopToPlace) : [];
    // A 5-digit number is a bus stop code (Singapore postal codes have 6 digits)
    if (isStopCode(q)) {
      setState({ results: stops, status: 'done', addressSearchFailed: false });
      return;
    }
    setState((prev) => ({ ...prev, status: 'loading' }));

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const places = await searchOneMap(q, controller.signal);
      if (controller.signal.aborted) return;
      setState({
        results: [...(places ?? []).slice(0, 6), ...stops],
        status: 'done',
        addressSearchFailed: places === null,
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, network]);

  return state;
}

// Recently chosen places (start or destination), most recent first
export const RECENT_PLACES_KEY = 'bustrackersg_recent_places_v1';
const MAX_RECENT = 6;

const isPlace = (value: unknown): value is PlaceResult => {
  const p = value as Partial<PlaceResult> | null;
  return (
    !!p &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    p.name.length > 0 &&
    ['place', 'address', 'postal', 'stop'].includes(p.kind as string) &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    isSingaporeLocation(p.lat, p.lng) &&
    (p.subtitle === undefined || typeof p.subtitle === 'string')
  );
};

export function loadRecentPlaces(storage?: Pick<Storage, 'getItem'>): PlaceResult[] {
  try {
    const raw = (storage ?? window.localStorage).getItem(RECENT_PLACES_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isPlace).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function addRecentPlace(place: PlaceResult, current: PlaceResult[], storage?: Pick<Storage, 'setItem'>): PlaceResult[] {
  const next = [place, ...current.filter((p) => p.id !== place.id)].slice(0, MAX_RECENT);
  try {
    (storage ?? window.localStorage).setItem(RECENT_PLACES_KEY, JSON.stringify(next));
  } catch {
    // Not remembering a recent place is harmless
  }
  return next;
}
