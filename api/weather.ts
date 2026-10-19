import type { Request, Response } from 'express';
import { config } from '../config/server.ts';
import { cdnCache } from '../config/schema.ts';
import { logger } from '../security/logger.ts';
import type { LatLng, StationReadings, WeatherDatasetKey as DatasetKey, WeatherSnapshot } from '../src/types/weather';

// Singapore-wide weather & air-quality snapshot from NEA's real-time APIs (data.gov.sg v2).
// The response is location-independent so the CDN can cache it for everyone; the client picks the
// nearest station/region. data.gov.sg allows only 6 keyless calls per 10 s (12 with a dev key), so each
// dataset is cached in memory with its own TTL, only a few are refreshed per request (most important
// first), and the last good value is served if a refresh fails.
const BASE = config.public.urls.neaBase;

const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v)));

function parseStations(raw: any): StationReadings {
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
export function parseRainfall(raw: any): NonNullable<WeatherSnapshot['rainfall']> {
  const d = raw.data;
  const stations: any[] = d.stations ?? [];
  const readings = (d.readings ?? []).filter((r: any) => (r.data?.length ?? 0) >= stations.length / 2);
  if (readings.length === 0) throw new Error('rainfall: no complete reading yet'); // just after midnight
  const valuesOf = (r: any) => new Map<string, number>(r.data.map((x: any) => [x.stationId, num(x.value)]));
  return {
    ...parseStations({ data: { ...d, readings } }),
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

// Today's date in Singapore, for the day queries
const sgToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

function regionLocations(raw: any): Map<string, LatLng> {
  return new Map(
    (raw.data.regionMetadata ?? []).map((r: any) => [r.name, { lat: r.labelLocation.latitude, lng: r.labelLocation.longitude }])
  );
}

// Ordered by importance: when the rate-limit budget runs out, later datasets wait for the next request
const DATASETS: { key: DatasetKey; path: string | (() => string); ttlMs: number; parse: (raw: any) => any }[] = [
  {
    key: 'forecast2h',
    path: 'two-hr-forecast',
    ttlMs: config.weather.summaryTtlMs,
    parse: (raw) => {
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
    },
  },
  { key: 'temperature', path: 'air-temperature', ttlMs: config.weather.observationTtlMs, parse: parseStations },
  { key: 'rainfall', path: () => `rainfall?date=${sgToday()}`, ttlMs: config.weather.observationTtlMs, parse: parseRainfall },
  {
    key: 'psi',
    path: 'psi',
    ttlMs: config.weather.summaryTtlMs,
    parse: (raw) => {
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
    },
  },
  {
    key: 'pm25',
    path: 'pm25',
    ttlMs: config.weather.summaryTtlMs,
    parse: (raw) => {
      const item = raw.data.items[0];
      return {
        timestamp: item.timestamp,
        regions: [...regionLocations(raw)].map(([name, loc]) => ({
          name,
          ...loc,
          value: item.readings.pm25_one_hourly?.[name],
        })),
      };
    },
  },
  { key: 'humidity', path: 'relative-humidity', ttlMs: config.weather.observationTtlMs, parse: parseStations },
  {
    key: 'forecast24h',
    path: 'twenty-four-hr-forecast',
    ttlMs: config.weather.forecast24hTtlMs,
    parse: (raw) => {
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
    },
  },
  {
    key: 'uv',
    path: 'uv',
    ttlMs: config.weather.summaryTtlMs,
    parse: (raw) => {
      const latest = raw.data.records[0]?.index?.[0];
      return { timestamp: latest?.hour, value: latest?.value };
    },
  },
  {
    key: 'lightning',
    path: 'weather?api=lightning',
    ttlMs: config.weather.observationTtlMs,
    parse: (raw) => {
      const rec = raw.data.records[0];
      return {
        timestamp: rec?.datetime,
        // Keep strikes over and around Singapore only
        strikes: (rec?.item?.readings ?? [])
          .map((s: any) => ({ lat: num(s.location.latitude), lng: num(s.location.longitude), type: s.text, time: s.datetime }))
          .filter((s: any) => s.lat > 1.05 && s.lat < 1.6 && s.lng > 103.5 && s.lng < 104.2)
          .slice(0, 300),
      };
    },
  },
  {
    key: 'wbgt',
    path: 'weather?api=wbgt',
    ttlMs: config.weather.summaryTtlMs,
    parse: (raw) => {
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
    },
  },
  { key: 'windSpeed', path: 'wind-speed', ttlMs: config.weather.observationTtlMs, parse: parseStations },
  {
    key: 'outlook4d',
    path: 'four-day-outlook',
    ttlMs: config.weather.outlookTtlMs,
    parse: (raw) =>
      (raw.data.records[0]?.forecasts ?? []).map((f: any) => ({
        day: f.day,
        date: f.timestamp,
        forecast: f.forecast?.text,
        summary: f.forecast?.summary,
        low: f.temperature?.low,
        high: f.temperature?.high,
      })),
  },
];

const cache = new Map<DatasetKey, { at: number; value: unknown }>();
// Start times of this instance's recent data.gov.sg calls, to stay inside the 10-second rate-limit window
const recentCalls: number[] = [];
const RATE_WINDOW_MS = config.weather.rateWindowMs;

async function fetchDataset(path: string, apiKey?: string) {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { Accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
    signal: AbortSignal.timeout(config.weather.timeoutMs),
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error('NEA returned an upstream error');
  return body;
}

export default async function handler(req: Request | any, res: Response | any) {
  const apiKey = config.weather.apiKey || undefined;
  // Stay under the 10-second rate limit (6 keyless / 12 dev key), leaving headroom for other instances
  const budget = apiKey ? config.weather.keyedBudget : config.weather.keylessBudget;
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0] > RATE_WINDOW_MS) recentCalls.shift();

  const due = DATASETS.filter((d) => {
    const hit = cache.get(d.key);
    return !hit || now - hit.at > d.ttlMs;
  }).slice(0, Math.max(0, budget - recentCalls.length));
  recentCalls.push(...due.map(() => now));

  await Promise.all(
    due.map(async (d) => {
      try {
        const path = typeof d.path === 'function' ? d.path() : d.path;
        cache.set(d.key, { at: Date.now(), value: d.parse(await fetchDataset(path, apiKey)) });
      } catch (err) {
        logger.warn('nea.dataset_refresh_failed', { dataset: d.key, error: err });
      }
    })
  );

  const body: WeatherSnapshot = { fetchedAt: {}, missing: [], stale: [], source: 'NEA_DATA_GOV_SG' };
  for (const d of DATASETS) {
    const hit = cache.get(d.key);
    if (!hit) {
      body.missing.push(d.key);
      continue;
    }
    (body as any)[d.key] = hit.value;
    body.fetchedAt[d.key] = new Date(hit.at).toISOString();
    if (Date.now() - hit.at > d.ttlMs) body.stale.push(d.key);
  }

  const complete = body.missing.length === 0 && body.stale.length === 0;
  // Incomplete snapshots expire quickly so the client's follow-up request (after the rate-limit window) fills the gaps
  const cacheControl = complete
    ? cdnCache(config.weather.cacheSeconds, config.weather.staleSeconds)
    : cdnCache(config.weather.incompleteCacheSeconds);
  const status = body.missing.length === DATASETS.length ? 502 : 200;

  if (res.setHeader) res.setHeader('Cache-Control', cacheControl);
  if (res.status && typeof res.status === 'function') {
    return res.status(status).json(body);
  }
  if (res.writeHead) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': cacheControl });
    return res.end(JSON.stringify(body));
  }
  return body;
}
