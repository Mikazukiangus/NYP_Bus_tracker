import type { BusOperator } from './routes.ts';

export type BusLoad = 'SEA' | 'SDA' | 'LSD';
export type BusType = 'SD' | 'DD' | 'BD';
export interface LTABusArrival {
  OriginCode?: string;
  DestinationCode?: string;
  EstimatedArrival: string;
  Latitude?: string;
  Longitude?: string;
  VisitNumber?: string;
  Load: BusLoad;
  Feature: 'WAB' | '';
  Type: BusType;
  Monitored?: 0 | 1;
}
export type LTAEmptyArrival = Partial<Omit<LTABusArrival, 'EstimatedArrival' | 'Load' | 'Type' | 'Monitored'>> & {
  EstimatedArrival?: '';
  Load?: LTABusArrival['Load'] | '';
  Type?: LTABusArrival['Type'] | '';
  Monitored?: 0 | 1 | '';
};
export type LTAArrivalSlot = LTABusArrival | LTAEmptyArrival | null;
export interface LTAService {
  ServiceNo: string;
  Operator: BusOperator;
  NextBus?: LTAArrivalSlot;
  NextBus2?: LTAArrivalSlot;
  NextBus3?: LTAArrivalSlot;
}
export interface LTABusArrivalResponse {
  'odata.metadata'?: string;
  BusStopCode: string;
  Services: LTAService[];
  source?: 'LTA_DATAMALL_V3' | 'FALLBACK_SIMULATED';
  warning?: string;
}
export interface ArrivalIssue { path: string; message: string }
export type ArrivalValidation = { ok: true; value: LTABusArrivalResponse } | { ok: false; issues: ArrivalIssue[] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const STOP_CODE = /^\d{5}$/;
const SERVICE_NO = /^[0-9A-Za-z]{1,6}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === value.slice(0, 10);
}
const busFields = ['OriginCode', 'DestinationCode', 'EstimatedArrival', 'Latitude', 'Longitude', 'VisitNumber', 'Load', 'Feature', 'Type', 'Monitored'] as const;
function pick(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}

// Validate untrusted JSON once at each I/O boundary. Issues contain paths/constraints, never input values.
// Unknown additive fields are ignored. Missing/null/empty slots and blank ETAs are legitimate no-bus data.
export function parseArrivalResponse(raw: unknown, options: { expectedStopCode: string; requireSource?: boolean }): ArrivalValidation {
  const issues: ArrivalIssue[] = [];
  const issue = (path: string, message: string) => { if (issues.length < 8) issues.push({ path, message }); };
  if (!object(raw)) return { ok: false, issues: [{ path: '$', message: 'must be an object' }] };
  if (typeof raw.BusStopCode !== 'string' || !STOP_CODE.test(raw.BusStopCode)) issue('BusStopCode', 'must be a five-digit string');
  else if (raw.BusStopCode !== options.expectedStopCode) issue('BusStopCode', 'must match the requested stop');
  if (raw['odata.metadata'] !== undefined && typeof raw['odata.metadata'] !== 'string') issue('odata.metadata', 'must be a string when present');
  if (options.requireSource) {
    if (raw.source !== 'LTA_DATAMALL_V3' && raw.source !== 'FALLBACK_SIMULATED') issue('source', 'must be a recognised arrival source');
    if (raw.warning !== undefined && typeof raw.warning !== 'string') issue('warning', 'must be a string when present');
  }
  if (!Array.isArray(raw.Services)) issue('Services', 'must be an array');
  const services: Record<string, unknown>[] = [];
  for (const [index, row] of (Array.isArray(raw.Services) ? raw.Services : []).entries()) {
    const path = `Services[${index}]`;
    if (!object(row)) { issue(path, 'must be an object'); continue; }
    if (typeof row.ServiceNo !== 'string' || !SERVICE_NO.test(row.ServiceNo)) issue(`${path}.ServiceNo`, 'must be an alphanumeric service string');
    if (!['SBST', 'SMRT', 'TTS', 'GAS'].includes(row.Operator as string)) issue(`${path}.Operator`, 'must be a recognised operator');
    const service = pick(row, ['ServiceNo', 'Operator']);
    for (const slot of ['NextBus', 'NextBus2', 'NextBus3']) {
      const bus = row[slot];
      if (bus === undefined) continue;
      if (bus === null) { service[slot] = null; continue; }
      const at = `${path}.${slot}`;
      if (!object(bus)) { issue(at, 'must be a bus object or null'); continue; }
      const empty = bus.EstimatedArrival === '' || Object.keys(bus).length === 0;
      if (!empty && !validTimestamp(bus.EstimatedArrival)) {
        issue(`${at}.EstimatedArrival`, 'must be an ISO timestamp with a timezone, or blank for no bus');
      }
      for (const key of ['OriginCode', 'DestinationCode']) {
        const value = bus[key];
        if (value !== undefined && (typeof value !== 'string' || (value !== '' && !STOP_CODE.test(value)))) issue(`${at}.${key}`, 'must be a five-digit string or blank');
      }
      for (const [key, limit] of [['Latitude', 90], ['Longitude', 180]] as const) {
        const value = bus[key];
        if (value !== undefined && (typeof value !== 'string' || (value !== '' && (!DECIMAL.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > limit)))) {
          issue(`${at}.${key}`, 'must be a bounded decimal string or blank');
        }
      }
      if (bus.VisitNumber !== undefined && (typeof bus.VisitNumber !== 'string' || (bus.VisitNumber !== '' && !/^[1-9]\d*$/.test(bus.VisitNumber)))) issue(`${at}.VisitNumber`, 'must be a positive integer string or blank');
      for (const [key, allowed] of [['Load', ['SEA', 'SDA', 'LSD']], ['Type', ['SD', 'DD', 'BD']], ['Feature', ['WAB', '']]] as const) {
        const value = bus[key];
        if (!(empty && (value === undefined || value === '')) && !(allowed as readonly unknown[]).includes(value)) issue(`${at}.${key}`, 'must be a recognised value');
      }
      if (bus.Monitored !== undefined && bus.Monitored !== 0 && bus.Monitored !== 1 && !(empty && bus.Monitored === '')) issue(`${at}.Monitored`, 'must be 0 or 1 when present');
      service[slot] = pick(bus, busFields);
    }
    services.push(service);
  }
  if (issues.length) return { ok: false, issues };
  const value = { ...pick(raw, ['odata.metadata', 'BusStopCode', ...(options.requireSource ? ['source', 'warning'] : [])]), Services: services };
  return { ok: true, value: value as unknown as LTABusArrivalResponse };
}
