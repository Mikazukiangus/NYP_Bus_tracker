import type { LatLng, StationReadings, WeatherSnapshot, WeatherDatasetKey } from './types.ts';
import { parseBoundary } from '../input/primitives';
import { neaSchemas, weatherDatasetSchemas } from './validation';

const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)));

function normalizeStations(raw: any): StationReadings {
  const d = raw.data;
  const reading = d.readings?.[0];
  const values = new Map<string, number>((reading?.data ?? []).map((r: any) => [r.stationId, num(r.value)]));
  return {
  timestamp: reading?.timestamp,
  unit: d.readingUnit,
  stations: (d.stations ?? [])
    .filter((s: any) => values.has(s.id) && Number.isFinite(values.get(s.id)))
    .map((s: any) => ({
      id: s.id,
      name: s.name,
      lat: s.location.latitude,
      lng: s.location.longitude,
      value: values.get(s.id)!,
    })),
};
}

// Readings kept for the rain nowcast: the last hour
const RAIN_HISTORY_READINGS = 13;

// Rainfall comes from the day's readings (newest first), one call giving both the latest reading and the last hour,
// which shows where rain is moving. The newest reading is often still coming in (a handful of gauges in its first
// minutes), so start from the newest one most gauges have reported, as the plain latest-reading endpoint does.
function normalizeRainfall(raw: any): NonNullable<WeatherSnapshot['rainfall']> {
  const d = raw.data;
  const stations: any[] = d.stations ?? [];
  const readings = (d.readings ?? []).filter((r: any) => (r.data?.length ?? 0) >= stations.length / 2);
  if (readings.length === 0) throw new Error('rainfall: no complete reading yet'); // just after midnight
  const valuesOf = (r: any) => new Map<string, number>(r.data.map((x: any) => [x.stationId, num(x.value)]));
  return {
  ...normalizeStations({ data: { ...d, readings } }),
  history: {
    stations: stations.map((s) => ({ id: s.id, name: s.name, lat: s.location.latitude, lng: s.location.longitude })),
    readings: readings
      .slice(0, RAIN_HISTORY_READINGS)
      .reverse()
      .map((r: any) => {
        const values = valuesOf(r);
        return {
          timestamp: r.timestamp,
          values: stations.map((s) => (Number.isFinite(values.get(s.id)) ? values.get(s.id)! : null)),
        };
      }),
  },
};
}

function regionLocations(raw: any): Map<string, LatLng> {
  return new Map(
    (raw.data.regionMetadata ?? []).map((r: any) => [r.name, { lat: r.labelLocation.latitude, lng: r.labelLocation.longitude }])
  );
}


function normalizeForecast2h(raw: any) {
  const item = raw.data.items[0];
  const forecasts = new Map<string, string>(item.forecasts.map((f: any) => [f.area, f.forecast]));
  return {
    validText: item.valid_period?.text,
    updated: item.update_timestamp,
    areas: raw.data.area_metadata
      .filter((a: any) => forecasts.has(a.name))
      .map((a: any) => ({
        name: a.name,
        lat: a.label_location.latitude,
        lng: a.label_location.longitude,
        forecast: forecasts.get(a.name),
      })),
  };
}

function normalizePsi(raw: any) {
  const item = raw.data.items[0];
  const r = item.readings;
  return {
    timestamp: item.timestamp,
    regions: [...regionLocations(raw)].map(([name, loc]) => ({
      name,
      ...loc,
      psi24h: r.psi_twenty_four_hourly?.[name],
      pm25_24h: r.pm25_twenty_four_hourly?.[name],
      pm10_24h: r.pm10_twenty_four_hourly?.[name],
      o3_8h: r.o3_eight_hour_max?.[name],
    })),
  };
}

function normalizePm25(raw: any) {
  const item = raw.data.items[0];
  return {
    timestamp: item.timestamp,
    regions: [...regionLocations(raw)].map(([name, loc]) => ({
      name,
      ...loc,
      value: item.readings.pm25_one_hourly?.[name],
    })),
  };
}

function normalizeForecast24h(raw: any) {
  const rec = raw.data.records[0];
  const g = rec.general;
  return {
    validText: g.validPeriod?.text,
    forecast: g.forecast?.text,
    temperature: { low: g.temperature?.low, high: g.temperature?.high },
    humidity: { low: g.relativeHumidity?.low, high: g.relativeHumidity?.high },
    wind: { direction: g.wind?.direction, low: g.wind?.speed?.low, high: g.wind?.speed?.high },
    periods: (rec.periods ?? []).map((p: any) => ({
      text: p.timePeriod?.text,
      regions: Object.fromEntries(Object.entries(p.regions ?? {}).map(([k, v]: [string, any]) => [k, v?.text])),
    })),
  };
}

function normalizeUv(raw: any) {
  const latest = raw.data.records[0]?.index?.[0];
  return { timestamp: latest?.hour, value: latest?.value };
}

function normalizeLightning(raw: any) {
  const rec = raw.data.records[0];
  return {
    timestamp: rec?.datetime,
    // Keep strikes over and around Singapore only
    strikes: (rec?.item?.readings ?? [])
      .map((s: any) => ({ lat: num(s.location.latitude), lng: num(s.location.longitude), type: s.text, time: s.datetime }))
      .filter((s: any) => s.lat > 1.05 && s.lat < 1.6 && s.lng > 103.5 && s.lng < 104.2)
      .slice(0, 300),
  };
}

function normalizeWbgt(raw: any) {
  const rec = raw.data.records[0];
  return {
    timestamp: rec?.datetime,
    stations: (rec?.item?.readings ?? []).map((s: any) => ({
      name: s.station?.townCenter || s.station?.name,
      lat: num(s.location.latitude),
      lng: num(s.location.longitude),
      value: num(s.wbgt),
      heatStress: s.heatStress,
    })),
  };
}

function normalizeOutlook4d(raw: any) {
  return (raw.data.records[0]?.forecasts ?? []).map((f: any) => ({
  day: f.day,
  date: f.timestamp,
  forecast: f.forecast?.text,
  summary: f.forecast?.summary,
  low: f.temperature?.low,
  high: f.temperature?.high,
}));
}

function decode<K extends WeatherDatasetKey>(key: K, raw: unknown, normalize: (raw: any) => unknown): NonNullable<WeatherSnapshot[K]> {
  const input = parseBoundary<unknown>(neaSchemas[key], raw);
  return parseBoundary<unknown>(weatherDatasetSchemas[key], normalize(input)) as NonNullable<WeatherSnapshot[K]>;
}
export const parseStations = (raw: unknown) => decode('temperature', raw, normalizeStations);
export const parseRainfall = (raw: unknown) => decode('rainfall', raw, normalizeRainfall);
export const parseForecast2h = (raw: unknown) => decode('forecast2h', raw, normalizeForecast2h);
export const parsePsi = (raw: unknown) => decode('psi', raw, normalizePsi);
export const parsePm25 = (raw: unknown) => decode('pm25', raw, normalizePm25);
export const parseForecast24h = (raw: unknown) => decode('forecast24h', raw, normalizeForecast24h);
export const parseUv = (raw: unknown) => decode('uv', raw, normalizeUv);
export const parseLightning = (raw: unknown) => decode('lightning', raw, normalizeLightning);
export const parseWbgt = (raw: unknown) => decode('wbgt', raw, normalizeWbgt);
export const parseOutlook4d = (raw: unknown) => decode('outlook4d', raw, normalizeOutlook4d);
