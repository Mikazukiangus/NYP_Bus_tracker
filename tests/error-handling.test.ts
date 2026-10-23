import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { retainedWeather } from '../src/features/weather/freshness';
import { summarizeWeather } from '../src/features/weather/summary';
import { WeatherStrip, NEAWeatherWidget } from '../src/components/NEAWeatherWidget';
import { IncidentFeedNotice } from '../src/features/incidents/IncidentFeedNotice';
import { fetchTrafficIncidents } from '../src/features/incidents/client';
import { PersistenceNotice } from '../src/components/PersistenceNotice';
import { createFavoritesStore } from '../src/features/saved/data/favoritesStore';
import { defaultFavorites } from '../src/features/saved/domain/favorites';
import { saveUserLocation } from '../src/services/userLocation';
import { saveRecentPlaces } from '../src/features/places/data/recentPlacesStore';
import { createLogger, safeError } from '../security/redact';
import { DependencyHttpError } from '../shared/http/circuitBreaker';
import type { WeatherSnapshot } from '../src/types/weather';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const at = Date.parse('2026-10-23T00:00:00Z');
const snapshot: WeatherSnapshot = {
  forecast2h: { updated: new Date(at).toISOString(), validText: 'This morning', areas: [{ name: 'AMK', lat: 1.38, lng: 103.85, forecast: 'Fair' }] },
  fetchedAt: { forecast2h: new Date(at).toISOString(), temperature: new Date(at - 600000).toISOString() },
  temperature: { unit: 'C', timestamp: new Date(at).toISOString(), stations: [] },
  missing: [], stale: [], source: 'NEA_DATA_GOV_SG',
};

test('weather age and refresh failure mark retained datasets stale without mutating the last response', () => {
  const fresh = retainedWeather(snapshot, at, at + 1, 300000);
  assert.deepEqual(fresh.stale, []); // A successful API response may contain older, still-valid cached forecasts.
  const aged = retainedWeather(snapshot, at, at + 300001, 300000);
  assert.deepEqual(aged.stale, ['forecast2h', 'temperature']);
  assert.deepEqual(retainedWeather(fresh, at, at + 1, 300000, true).stale, ['forecast2h', 'temperature']);
  assert.deepEqual(snapshot.stale, []);
  assert.deepEqual(retainedWeather({ ...snapshot, stale: ['temperature'] }, at, at + 1, 300000).stale, ['temperature']);
});

test('weather widgets disclose refresh failure even with readings, and stale data cannot produce an all-clear alert', () => {
  const summary = summarizeWeather(retainedWeather(snapshot, at, at, 300000, true), 1.38, 103.85);
  assert.ok(!summary.alerts.some(alert => alert.kind === 'ok'));
  const strip = renderToStaticMarkup(createElement(WeatherStrip, { weather: summary, error: true, onOpen() {} }));
  const widget = renderToStaticMarkup(createElement(NEAWeatherWidget, { weather: summary, error: true, isLoading: false, onRefreshWeather() {} }));
  assert.match(strip, /Refresh failed/);
  assert.match(widget, /Refresh failed/);
  assert.match(widget, /conditions may have changed/);
  assert.match(widget, /Some readings may be out of date/);
  assert.ok(!strip.includes('Good conditions'));
});

test('incident adapter preserves successful empty feeds and timestamps, but distinguishes unavailable/invalid responses', async () => {
  globalThis.fetch = async () => Response.json({ incidents: [], fetchedAt: new Date(at).toISOString(), source: 'LTA_DATAMALL' });
  assert.deepEqual(await fetchTrafficIncidents(), { incidents: [], fetchedAt: new Date(at).toISOString() });
  for (const response of [new Response('', { status: 503 }), Response.json({ incidents: [], fetchedAt: 'bad', source: 'LTA_DATAMALL' })]) {
    globalThis.fetch = async () => response;
    assert.equal(await fetchTrafficIncidents(), null);
  }
});

test('incident notices separate unavailable, stale empty data and confirmed current empty data', () => {
  const render = (status: 'ready' | 'stale' | 'unavailable') => renderToStaticMarkup(createElement(IncidentFeedNotice, {
    feed: { status, incidents: [], fetchedAt: status === 'unavailable' ? null : new Date(at).toISOString() },
  }));
  assert.match(render('unavailable'), /Current conditions are unknown/);
  assert.match(render('stale'), /last updated 08:00 SGT/);
  assert.equal(render('ready'), '');
});

test('all persistent writers explicitly report denied writes while success remains recoverable', () => {
  const denied = { getItem() { return null; }, setItem() { throw new Error('fixture private storage error'); } };
  const location = { name: 'NYP', lat: 1.38, lng: 103.85, source: 'selected-place' as const };
  const places = [{ id: 'nyp', kind: 'place' as const, name: 'NYP', lat: 1.38, lng: 103.85 }];
  assert.equal(createFavoritesStore(denied).save(defaultFavorites(100)).status, 'session-only');
  assert.equal(saveUserLocation(location, denied).status, 'session-only');
  assert.equal(saveRecentPlaces(places, denied).status, 'session-only');
  assert.equal(saveUserLocation(location, { setItem() {} }).status, 'saved');
  assert.equal(saveRecentPlaces(places, { setItem() {} }).status, 'saved');
  assert.equal(saveUserLocation({ ...location, lat: NaN }, denied).status, 'invalid');
  const notice = renderToStaticMarkup(createElement(PersistenceNotice, { items: ['saved buses', 'your location'] }));
  assert.match(notice, /apply to this visit only/);
  assert.ok(!notice.includes('fixture private'));
});

test('server logs retain only typed numeric HTTP status, never error messages, bodies or causes', () => {
  const lines: string[] = [];
  const logger = createLogger([], (_, line) => lines.push(line));
  for (const status of [401, 429, 503]) {
    const error = new DependencyHttpError(status);
    Object.assign(error, { message: 'private provider details', cause: new Error('private cause'), body: 'private body' });
    logger.warn('nea.dataset_refresh_failed', { dataset: 'temperature', error });
    assert.deepEqual(JSON.parse(lines.at(-1)!).details, { dataset: 'temperature', error: { kind: 'upstream_http_error', httpStatus: status } });
  }
  assert.ok(!lines.join('').includes('private'));
  assert.deepEqual(safeError(Object.assign(new Error('secret'), { status: 401 })), { kind: 'request_failed' });
  assert.deepEqual(safeError(new DependencyHttpError(NaN)), { kind: 'request_failed' });
});
