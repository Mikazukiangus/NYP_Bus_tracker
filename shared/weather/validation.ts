import { z } from '../input/zod.ts';
import { nameSchema as name, textSchema as text, numberSchema as number, numericSchema as numeric, latitudeSchema, longitudeSchema, pointSchema, timeSchema as time, parseBoundary } from '../input/primitives.ts';
import type { WeatherSnapshot } from './types.ts';

import { weatherKeys } from './types.ts';
export { weatherKeys } from './types.ts';
const keySchema = z.enum(weatherKeys);
const region = z.enum(['north','south','east','west','central']);
const providerPoint = z.object({ latitude: numeric.pipe(latitudeSchema), longitude: numeric.pipe(longitudeSchema) });
const range = z.object({ low: number, high: number }).refine(v => v.low <= v.high);
const providerRange = z.object({ low: numeric, high: numeric }).refine(v => v.low <= v.high);
const station = z.object({ id: name, name, location: providerPoint });
const stationData = z.object({
  stations: z.array(station), readingUnit: name,
  readings: z.array(z.object({ timestamp: time, data: z.array(z.object({ stationId: name, value: numeric.nullable() })) })).min(1),
});
const area = z.object({ name, label_location: providerPoint });
const regionMetadata = z.array(z.object({ name: region, labelLocation: providerPoint }));
const regionalNumbers = z.record(z.string(), numeric);
const forecastText = z.object({ text: name });
const period = z.object({ text: name });
const envelope = <T extends z.ZodType>(data: T) => z.object({ code: z.literal(0), data });
const records = <T extends z.ZodType>(schema: T) => z.object({ records: z.array(schema).min(1) });

// Validate provider envelopes/nested fields before the mapping functions inspect them.
export const neaSchemas = {
  forecast2h: envelope(z.object({ area_metadata: z.array(area), items: z.array(z.object({
    update_timestamp: time, valid_period: period, forecasts: z.array(z.object({ area: name, forecast: name })),
  })).min(1) })),
  temperature: envelope(stationData), rainfall: envelope(stationData), humidity: envelope(stationData), windSpeed: envelope(stationData),
  psi: envelope(z.object({ regionMetadata, items: z.array(z.object({ timestamp: time, readings: z.object({
    psi_twenty_four_hourly: regionalNumbers, pm25_twenty_four_hourly: regionalNumbers, pm10_twenty_four_hourly: regionalNumbers, o3_eight_hour_max: regionalNumbers,
  }) })).min(1) })),
  pm25: envelope(z.object({ regionMetadata, items: z.array(z.object({ timestamp: time, readings: z.object({ pm25_one_hourly: regionalNumbers }) })).min(1) })),
  forecast24h: envelope(records(z.object({ general: z.object({
    validPeriod: period, forecast: forecastText, temperature: providerRange, relativeHumidity: providerRange,
    wind: z.object({ direction: name, speed: providerRange }),
  }), periods: z.array(z.object({ timePeriod: period, regions: z.record(z.string(), forecastText) })) }))),
  uv: envelope(records(z.object({ index: z.array(z.object({ hour: time, value: numeric })).min(1) }))),
  lightning: envelope(records(z.object({ datetime: time, item: z.object({ readings: z.array(z.object({ location: providerPoint, text: name, datetime: time })) }) }))),
  wbgt: envelope(records(z.object({ datetime: time, item: z.object({ readings: z.array(z.object({
    station: z.object({ name, townCenter: text.optional() }), location: providerPoint, wbgt: numeric, heatStress: name,
  })) }) }))),
  outlook4d: envelope(records(z.object({ forecasts: z.array(z.object({ day: name, timestamp: time, forecast: z.object({ text: name, summary: text }), temperature: providerRange })) }))),
};

const located = pointSchema.extend({ id: name, name });
const stations = z.object({ timestamp: time, unit: name, stations: z.array(located.extend({ value: number })) });
const history = z.object({ stations: z.array(located), readings: z.array(z.object({ timestamp: time, values: z.array(number.nullable()) })) })
  .refine(value => value.readings.every(reading => reading.values.length === value.stations.length));
export const weatherDatasetSchemas = {
  forecast2h: z.object({ validText: name, updated: time, areas: z.array(pointSchema.extend({ name, forecast: name })) }),
  temperature: stations, humidity: stations, windSpeed: stations,
  rainfall: stations.extend({ history: history.optional() }),
  psi: z.object({ timestamp: time, regions: z.array(pointSchema.extend({ name: region, psi24h: number, pm25_24h: number, pm10_24h: number, o3_8h: number })) }),
  pm25: z.object({ timestamp: time, regions: z.array(pointSchema.extend({ name: region, value: number })) }),
  forecast24h: z.object({ validText: name, forecast: name, temperature: range, humidity: range, wind: range.extend({ direction: name }),
    periods: z.array(z.object({ text: name, regions: z.partialRecord(region, name) })) }),
  uv: z.object({ timestamp: time, value: number }),
  lightning: z.object({ timestamp: time, strikes: z.array(pointSchema.extend({ type: name, time })) }),
  wbgt: z.object({ timestamp: time, stations: z.array(pointSchema.extend({ name, value: number, heatStress: name })) }),
  outlook4d: z.array(z.object({ day: name, date: time, forecast: name, summary: text, low: number, high: number }).refine(value => value.low <= value.high)),
};
const snapshotSchema = z.object({
  forecast2h: weatherDatasetSchemas.forecast2h.optional(), temperature: stations.optional(), humidity: stations.optional(), windSpeed: stations.optional(),
  rainfall: weatherDatasetSchemas.rainfall.optional(), psi: weatherDatasetSchemas.psi.optional(), pm25: weatherDatasetSchemas.pm25.optional(),
  forecast24h: weatherDatasetSchemas.forecast24h.optional(), uv: weatherDatasetSchemas.uv.optional(), lightning: weatherDatasetSchemas.lightning.optional(),
  wbgt: weatherDatasetSchemas.wbgt.optional(), outlook4d: weatherDatasetSchemas.outlook4d.optional(),
  fetchedAt: z.partialRecord(keySchema, time), missing: z.array(keySchema), stale: z.array(keySchema), source: z.literal('NEA_DATA_GOV_SG'),
}).refine(value => new Set(value.missing).size === value.missing.length && new Set(value.stale).size === value.stale.length && weatherKeys.every(key => {
  const present = value[key] !== undefined;
  return value.missing.includes(key) === !present && (value.fetchedAt[key] !== undefined) === present && (!value.stale.includes(key) || present);
}));

export function parseWeatherSnapshot(raw: unknown): WeatherSnapshot {
  return parseBoundary(snapshotSchema, raw) as WeatherSnapshot;
}
