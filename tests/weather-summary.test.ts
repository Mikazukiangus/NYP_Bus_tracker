import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecastAt, summarizeWeather } from '../src/features/weather/summary';
import { psiBand, pm25Band, uvBand, heatBand, forecastIconType, isWetForecast } from '../src/features/weather/bands';
import type { WeatherSnapshot, StationReadings } from '../shared/weather/types';

const place = { lat: 1.38, lng: 103.85 };
const time = '2026-10-28T00:00:00Z';
const base = (): WeatherSnapshot => ({ source: 'NEA_DATA_GOV_SG', missing: [], stale: [], fetchedAt: {},
  forecast2h: { updated: time, validText: 'This morning', areas: [{ ...place, name: 'AMK', forecast: 'Fair' }] },
});
const readings = (...values: [string, number, number][]): StationReadings => ({ timestamp: time, unit: 'fixture',
  stations: values.map(([name, offset, value]) => ({ name, id: name, lat: place.lat + offset, lng: place.lng, value })),
});
const summary = (snapshot: WeatherSnapshot) => summarizeWeather(snapshot, place.lat, place.lng);

test('air and UV bands preserve both sides of every published threshold', () => {
  for (const [classify, rows] of [
    [psiBand, [[50, 'Good'], [51, 'Moderate'], [100, 'Moderate'], [101, 'Unhealthy'], [200, 'Unhealthy'], [201, 'Very Unhealthy'], [300, 'Very Unhealthy'], [301, 'Hazardous']]],
    [pm25Band, [[55, 'Normal'], [56, 'Elevated'], [150, 'Elevated'], [151, 'High'], [250, 'High'], [251, 'Very High']]],
    [uvBand, [[2, 'Low'], [3, 'Moderate'], [5, 'Moderate'], [6, 'High'], [7, 'High'], [8, 'Very High'], [10, 'Very High'], [11, 'Extreme']]],
  ] as const) for (const [value, label] of rows) assert.equal(classify(value).label, label, `${value}: ${label}`);
  assert.equal(heatBand('HIGH'), 'bad'); assert.equal(heatBand('Moderate'), 'warn'); assert.equal(heatBand('Low'), 'good');
});

test('forecast classification recognizes wet conditions and night forecasts without treating haze as rain', () => {
  for (const [text, icon] of [['Thundery Showers', 'thunder'], ['Light Rain', 'rain'], ['Showers', 'rain'], ['Drizzle', 'rain'],
    ['Hazy', 'haze'], ['Mist', 'haze'], ['Fog', 'haze'], ['Fair (Night)', 'fair-night'], ['Sunny', 'fair'], ['Cloudy', 'cloudy']] as const) {
    assert.equal(forecastIconType(text), icon);
    assert.equal(isWetForecast(text), icon === 'rain' || icon === 'thunder');
  }
  assert.equal(isWetForecast(undefined), false);
});

test('location summary chooses nearby observations, converts knots and excludes distant rain', () => {
  const snapshot = base();
  snapshot.forecast2h!.areas.unshift({ name: 'Far away', lat: 1.2, lng: 103.7, forecast: 'Rain' });
  snapshot.temperature = readings(['Far', 0.1, 99], ['Near', 0, 29.26]);
  snapshot.humidity = readings(['Near', 0, 81.6]);
  snapshot.windSpeed = readings(['Near', 0, 10]);
  snapshot.rainfall = readings(['Dry nearest', 0, 0], ['Wet nearby', 0.01, 4], ['Distant storm', 0.1, 30]);
  const result = summary(snapshot);
  assert.equal(forecastAt(snapshot, place.lat, place.lng), 'Fair');
  assert.equal(result.temperature?.value, 29.3); assert.equal(result.temperature?.station, 'Near');
  assert.equal(result.humidity?.value, 82); assert.equal(result.windKmh?.value, 19);
  assert.equal(result.rain?.station, 'Wet nearby'); assert.equal(result.rain?.value, 4);
  assert.equal(result.rain?.nearbyStations, 2); assert.equal(result.rain?.wetStations, 1);
  assert.equal(result.alerts[0].kind, 'rain'); assert.ok(!result.alerts.some(alert => alert.kind === 'ok'));
  snapshot.rainfall = readings(['Only remote gauge', 0.1, 1]);
  assert.equal(summary(snapshot).rain?.rainingNearby, true);
  snapshot.rainfall = readings();
  assert.equal(summary(snapshot).rain, undefined);
});

test('lightning age/radius filters and alert sorting keep severe risks ahead of routine warnings', context => {
  const now = Date.parse(time);
  context.mock.method(Date, 'now', () => now);
  const snapshot = base();
  snapshot.lightning = { timestamp: time, strikes: [
    { ...place, type: 'G', time: new Date(now - 900000).toISOString() },
    { ...place, type: 'G', time: new Date(now - 900001).toISOString() },
    { lat: place.lat + 0.2, lng: place.lng, type: 'G', time },
  ] };
  snapshot.rainfall = readings(['Rain', 0, 5]);
  snapshot.uv = { timestamp: time, value: 8 };
  snapshot.wbgt = { timestamp: time, stations: [{ ...place, name: 'Near', value: 32.16, heatStress: 'Moderate' }] };
  const result = summary(snapshot);
  assert.equal(result.lightning?.count, 1); assert.equal(result.lightning?.nearestKm, 0);
  assert.deepEqual(result.alerts.map(alert => [alert.kind, alert.tone]), [['lightning', 'severe'], ['rain', 'bad'], ['uv', 'bad'], ['heat', 'warn']]);
  snapshot.lightning.strikes = [];
  assert.equal(summary(snapshot).lightning?.count, 0);
  assert.ok(!summary(snapshot).alerts.some(alert => alert.kind === 'lightning'));
});

test('PSI advice escalates at 200/300 and takes precedence over duplicate particle warnings', () => {
  for (const [value, advice] of [[101, 'Reduce prolonged'], [201, 'Avoid prolonged'], [301, 'Minimise outdoor']] as const) {
    const snapshot = base();
    snapshot.psi = { timestamp: time, regions: [{ ...place, name: 'north', psi24h: value, pm25_24h: 0, pm10_24h: 0, o3_8h: 0 }] };
    snapshot.pm25 = { timestamp: time, regions: [{ ...place, name: 'north', value: 251 }] };
    const alerts = summary(snapshot).alerts;
    assert.equal(alerts.length, 1); assert.match(alerts[0].title, /PSI/); assert.ok(alerts[0].detail.startsWith(advice));
    snapshot.psi.regions[0].psi24h = 100;
    assert.match(summary(snapshot).alerts[0].title, /PM2.5/);
    snapshot.pm25.regions[0].value = 55;
    assert.equal(summary(snapshot).alerts[0].kind, 'ok');
  }
});

test('partial and stale weather never presents an all-clear; invalid optional measurements are omitted', () => {
  for (const patch of [{ missing: ['lightning'] }, { stale: ['rainfall'] }, { forecast2h: undefined }] as const) {
    const snapshot = { ...base(), ...patch } as WeatherSnapshot;
    assert.ok(!summary(snapshot).alerts.some(alert => alert.kind === 'ok'));
  }
  const snapshot = base();
  snapshot.uv = { timestamp: time, value: NaN };
  snapshot.pm25 = { timestamp: time, regions: [{ ...place, name: 'north', value: Infinity }] };
  snapshot.wbgt = { timestamp: time, stations: [{ ...place, name: 'Near', value: NaN, heatStress: 'High' }] };
  const result = summary(snapshot);
  assert.equal(result.uv, undefined); assert.equal(result.pm25, undefined); assert.equal(result.heatStress, undefined);
  snapshot.forecast2h!.areas[0].forecast = 'Showers';
  assert.equal(summary(snapshot).alerts[0].tone, 'moderate');
});

test('regional outlook uses the closest reporting region and filters absent period forecasts', () => {
  const snapshot = base();
  snapshot.psi = { timestamp: time, regions: [{ ...place, name: 'north', psi24h: 30, pm25_24h: 0, pm10_24h: 0, o3_8h: 0 }] };
  snapshot.forecast24h = { validText: 'Today', forecast: 'Fair', temperature: { low: 24, high: 32 }, humidity: { low: 50, high: 90 },
    wind: { direction: 'NE', low: 1, high: 10 }, periods: [{ text: 'AM', regions: { north: 'Showers' } }, { text: 'PM', regions: { south: 'Fair' } }] };
  snapshot.outlook4d = [{ day: 'Thu', date: '2026-10-29', forecast: 'Fair', summary: 'Fair', low: 24, high: 32 }];
  const result = summary(snapshot);
  assert.equal(result.region, 'north'); assert.deepEqual(result.today?.regionPeriods, [{ text: 'AM', forecast: 'Showers' }]);
  assert.deepEqual(result.outlook, snapshot.outlook4d);
  snapshot.wbgt = { timestamp: time, stations: [{ ...place, name: 'Near', value: 25, heatStress: '' }] };
  assert.equal(summary(snapshot).heatStress?.label, 'Unknown');
});
