import { readFileSync } from 'node:fs';
import { parseNetwork, parseRoute, parseShapes } from '../shared/transit/parsers';
import { parseWeatherSnapshot, weatherKeys } from '../shared/weather/validation';
import type { WeatherSnapshot, StationReadings } from '../shared/weather/types';
import type { LTABusArrivalResponse } from '../shared/transit/arrivals';
import type { BusRoute } from '../shared/transit/routes';
import type { NetworkFile } from '../shared/transit/network';

export const fixedTime = '2026-10-29T00:00:00.000Z';
export const transit = JSON.parse(readFileSync(new URL('./fixtures/transit.json', import.meta.url), 'utf8')) as {
  network: NetworkFile; routes: Record<string, BusRoute>; shapes: Record<string, unknown>; index: unknown;
};
if (!parseNetwork(transit.network)) throw new Error('Invalid E2E network fixture');
for (const code of ['50', '72']) {
  if (!parseRoute(transit.routes[code], code, fixedTime) || !parseShapes(transit.shapes[code], code)) throw new Error('Invalid E2E route fixture');
}
const station = { id: 'S1', name: 'Ang Mo Kio', lat: 1.38, lng: 103.85 };
const reading = (value: number, unit: string): StationReadings => ({ timestamp: fixedTime, unit, stations: [{ ...station, value }] });
export const weather: WeatherSnapshot = {
  source: 'NEA_DATA_GOV_SG', missing: [], stale: [], fetchedAt: Object.fromEntries(weatherKeys.map(key => [key, fixedTime])),
  forecast2h: { updated: fixedTime, validText: '8 AM – 10 AM', areas: [{ ...station, forecast: 'Fair' }] },
  temperature: reading(30, '°C'), humidity: reading(72, '%'), windSpeed: reading(6, 'knots'), rainfall: reading(0, 'mm'),
  psi: { timestamp: fixedTime, regions: [{ name: 'north', lat: 1.38, lng: 103.85, psi24h: 35, pm25_24h: 10, pm10_24h: 20, o3_8h: 5 }] },
  pm25: { timestamp: fixedTime, regions: [{ name: 'north', lat: 1.38, lng: 103.85, value: 10 }] },
  uv: { timestamp: fixedTime, value: 3 }, lightning: { timestamp: fixedTime, strikes: [] },
  wbgt: { timestamp: fixedTime, stations: [{ ...station, value: 28, heatStress: 'Low' }] },
  forecast24h: { validText: 'Today', forecast: 'Fair', temperature: { low: 25, high: 32 }, humidity: { low: 65, high: 90 },
    wind: { direction: 'NE', low: 4, high: 12 }, periods: [{ text: 'Morning', regions: { north: 'Fair' } }] },
  outlook4d: [{ day: 'Fri', date: '2026-10-30T00:00:00.000Z', forecast: 'Fair', summary: 'Fair', low: 25, high: 32 }],
};
parseWeatherSnapshot(weather);

export function arrivals(stopCode: string): LTABusArrivalResponse {
  const index = transit.network.stops.findIndex(stop => stop[0] === stopCode);
  const patterns = transit.network.patterns.filter(pattern => pattern[2].includes(index));
  const services = [...new Map(patterns.map(pattern => [pattern[0], pattern])).values()];
  return {
    BusStopCode: stopCode, source: 'LTA_DATAMALL_V3',
    Services: services.map(([serviceNo, , stops]) => {
      const stop = transit.network.stops[index];
      const bus = (minutes: number, monitored: 0 | 1) => ({
        EstimatedArrival: new Date(Date.parse(fixedTime) + minutes * 60000).toISOString(),
        OriginCode: transit.network.stops[stops[0]][0], DestinationCode: transit.network.stops[stops.at(-1)!][0],
        Latitude: monitored ? String(stop[3]) : '0', Longitude: monitored ? String(stop[4]) : '0',
        VisitNumber: '1', Load: 'SEA' as const, Type: 'SD' as const, Feature: 'WAB' as const, Monitored: monitored,
      });
      return { ServiceNo: serviceNo, Operator: transit.routes[serviceNo].operator, NextBus: bus(4, 1), NextBus2: bus(12, 0), NextBus3: bus(20, 1) };
    }),
  };
}
