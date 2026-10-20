import type { AppConfig } from '../../config/schema.ts';
import type { WeatherDatasetKey as DatasetKey } from '../../shared/weather/types.ts';
import { parseForecast2h, parseStations, parseRainfall, parsePsi, parsePm25, parseForecast24h, parseUv, parseLightning, parseWbgt, parseOutlook4d } from '../../shared/weather/parsers.ts';
const sgToday = (now: number) => new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);

export function weatherCatalog(settings: AppConfig['weather'], now: () => number) {
  // Ordered by importance: when the rate-limit budget runs out, later datasets wait for the next request
  const datasets: { key: DatasetKey; path: string | (() => string); ttlMs: number; parse: (raw: any) => any }[] = [
    {
      key: 'forecast2h',
      path: 'two-hr-forecast',
      ttlMs: settings.summaryTtlMs,
      parse: parseForecast2h,
    },
    { key: 'temperature', path: 'air-temperature', ttlMs: settings.observationTtlMs, parse: parseStations },
    { key: 'rainfall', path: () => `rainfall?date=${sgToday(now())}`, ttlMs: settings.observationTtlMs, parse: parseRainfall },
    {
      key: 'psi',
      path: 'psi',
      ttlMs: settings.summaryTtlMs,
      parse: parsePsi,
    },
    {
      key: 'pm25',
      path: 'pm25',
      ttlMs: settings.summaryTtlMs,
      parse: parsePm25,
    },
    { key: 'humidity', path: 'relative-humidity', ttlMs: settings.observationTtlMs, parse: parseStations },
    {
      key: 'forecast24h',
      path: 'twenty-four-hr-forecast',
      ttlMs: settings.forecast24hTtlMs,
      parse: parseForecast24h,
    },
    {
      key: 'uv',
      path: 'uv',
      ttlMs: settings.summaryTtlMs,
      parse: parseUv,
    },
    {
      key: 'lightning',
      path: 'weather?api=lightning',
      ttlMs: settings.observationTtlMs,
      parse: parseLightning,
    },
    {
      key: 'wbgt',
      path: 'weather?api=wbgt',
      ttlMs: settings.summaryTtlMs,
      parse: parseWbgt,
    },
    { key: 'windSpeed', path: 'wind-speed', ttlMs: settings.observationTtlMs, parse: parseStations },
    {
      key: 'outlook4d',
      path: 'four-day-outlook',
      ttlMs: settings.outlookTtlMs,
      parse: parseOutlook4d,
    },
  ];

  return datasets;
}
