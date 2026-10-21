import type { PlaceResult } from '../model';
import { isSingaporeLocation } from '../../../../shared/geo/singapore';
import { isPostalCode, rankPlaces } from '../domain/searchPolicy';
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

export interface OneMapResult {
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
  const places: { place: PlaceResult; hasPostal: boolean }[] = [];
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
      place: {
        id: `onemap:${key}`,
        placeRef: { provider: 'onemap', id: key, ...(/^\d{6}$/.test(postal) ? { postalCode: postal } : {}) },
        kind: isPostalCode(query) ? 'postal' : isAddressOnly ? 'address' : 'place',
        name,
        subtitle: subtitle || undefined,
        lat,
        lng,
      },
      hasPostal: postal !== '',
    });
  }
  return rankPlaces(places, query);
}
