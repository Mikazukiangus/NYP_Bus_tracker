import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header } from '../src/components/Header';
import { NearestStopBanner } from '../src/components/NearestStopBanner';
import { BusTypeIcon } from '../src/components/BusTypeIcon';
import { busMarker, busPopup, etaCallout } from '../src/features/map/markerElements';
import { stopPopup, userPopup, incidentPopup, textPopup, boardingPopup } from '../src/features/map/popupElements';
import { busTypeIcon } from '../src/features/map/svg';
import { oneMapAttribution } from '../src/features/map/attribution';
import { withDocument } from './fixtures/dom';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseLocation } from '../shared/geo/locationValidation.ts';
import { parseRoute } from '../shared/transit/parsers.ts';
import { parseArrivalResponse } from '../shared/transit/arrivals.ts';
import { createPublicConfig } from '../config/public.ts';

const payload = '<img data-xss src=x onerror="window.__xss=1"><svg data-xss onload="window.__xss=1"></svg> & \'"';
const location = parseLocation({ name: payload, lat: 1.38, lng: 103.85, source: 'selected-place' })!;
const stop = { code: '55329', name: payload, road: payload, lat: 1.38, lng: 103.85 };
const bus = { id: '72-1', serviceNo: '72', ordinal: 1 as const, lat: 1.38, lng: 103.85, etaMinutes: 5, load: 'SEA' as const, type: 'DD' as const, feature: 'WAB' as const };

test('saved location markup remains text in the actual header', () => {
  assert.ok(location);
  const html = renderToStaticMarkup(createElement(Header, {
    userLocation: location, onOpenLocationPicker() {}, favoritesCount: 0, onOpenFavorites() {},
    activeTab: 'arrivals', setActiveTab() {}, onRefreshAll() {}, isRefreshing: false,
  }));
  assert.ok(html.includes('&lt;img data-xss'));
  assert.ok(!html.includes('<img data-xss'));
  assert.ok(!html.includes('<svg data-xss'));
});

test('provider stop names and roads remain text in the actual nearest-stop banner', () => {
  const html = renderToStaticMarkup(createElement(NearestStopBanner, {
    nearestStop: stop, selectedStop: stop, onSelectStop() {}, distanceMeters: 100, userLocation: location,
    isFavorite: false, onToggleFavorite() {}, onViewOnMap() {}, onOpenStopsList() {},
  }));
  assert.ok(html.includes('&lt;img data-xss'));
  assert.ok(!html.includes('<img data-xss'));
  assert.ok(!html.includes('<svg data-xss'));
});

test('all DOM map builders keep arbitrary text out of elements and attributes', () => withDocument(() => {
  const leg = { serviceNo: payload, otherServiceNos: [], board: stop, alight: stop, path: [[1.38, 103.85] as [number, number]], followsRoads: false };
  for (const node of [busPopup(bus, payload), busMarker({ ...bus, serviceNo: payload }), etaCallout({ serviceNo: payload, minutes: [0, 5, 10], live: true }, true),
    userPopup(payload), incidentPopup({ type: payload, message: payload, lat: 1.38, lng: 103.85 }), stopPopup(stop, true, payload, () => {}),
    textPopup(payload, payload), boardingPopup(leg), boardingPopup(leg, leg)]) {
    assert.ok(node.textContent?.includes(payload));
    assert.equal(node.querySelector('[data-xss], [onerror], [onload], a[href^="javascript:"]'), null);
  }
}));

test('route text may contain markup, while interpolated stop identities stay constrained', () => {
  const route = { serviceNo: '72', operator: 'GAS', category: 'Trunk', direction1: { origin: payload, destination: payload, stops: [stop], path: [[1.38, 103.85]] } };
  assert.equal(parseRoute(route, '72')?.direction1.stops[0].name, payload);
  assert.equal(parseRoute({ ...route, direction1: { ...route.direction1, stops: [{ ...stop, code: payload }] } }, '72'), null);
});

test('arrival fields that reach raw map number/enum slots reject injected strings', () => {
  const next = { EstimatedArrival: new Date().toISOString(), Load: 'SEA', Type: 'DD', Feature: 'WAB', Latitude: '1.38', Longitude: '103.85', Monitored: 1 };
  for (const field of ['EstimatedArrival', 'Load', 'Type', 'Latitude', 'Longitude', 'Monitored']) {
    const raw = { BusStopCode: '55329', Services: [{ ServiceNo: '72', Operator: 'GAS', NextBus: { ...next, [field]: payload } }] };
    assert.equal(parseArrivalResponse(raw, { expectedStopCode: '55329' }).ok, false, field);
  }
});

test('DOM and React SVG renderers use fixed artwork and reject script URL configuration', () => withDocument(() => {
  for (const type of ['SD', 'DD', 'BD'] as const) {
    const svg = busTypeIcon(type, 16);
    assert.ok(svg.querySelector('rect'));
    assert.equal(svg.querySelector('script, foreignObject, image, [onload]'), null);
    const html = renderToStaticMarkup(createElement(BusTypeIcon, { type }));
    assert.ok(html.includes('<rect'));
    assert.ok(!/<(?:script|foreignObject|image)\b|\bon\w+=|javascript:/i.test(html));
  }
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
    assert.throws(() => createPublicConfig({ VITE_ONEMAP_BASE_URL: url }));
    assert.throws(() => oneMapAttribution(url));
  }
}));

test('stop popup buttons stay scoped across duplicate codes, reopenings and rebuilt popups', () => withDocument(() => {
  const selected: string[] = [];
  const first = stopPopup(stop, false, null, () => selected.push('first'));
  const second = stopPopup(stop, false, null, () => selected.push('second'));
  first.querySelector('button')!.click(); second.querySelector('button')!.click(); first.querySelector('button')!.click();
  assert.deepEqual(selected, ['first', 'second', 'first']);
  assert.equal(first.querySelector('[id]'), null);
  const rebuilt = stopPopup(stop, true, null, () => selected.push('new'));
  rebuilt.querySelector('button')!.click(); assert.equal(selected.at(-1), 'new');
}));

test('wrong runtime numeric/enum props remain inert at the DOM output boundary', () => withDocument(() => {
  const wrong = { ...bus, ordinal: payload, etaMinutes: payload, load: '__proto__', type: '__proto__' } as unknown as typeof bus;
  const marker = busMarker(wrong), popup = busPopup(wrong, payload);
  assert.ok(marker.textContent?.includes(payload));
  assert.ok(marker.textContent?.includes('—'));
  assert.ok(popup.textContent?.includes('Load unavailable'));
  for (const node of [marker, popup, etaCallout({ serviceNo: payload, minutes: [payload as unknown as number], live: true }, true)]) {
    assert.equal(node.querySelector('[data-xss], [onerror], [onload]'), null);
  }
}));

test('attribution encodes URL entities once without adding attributes or changing the URL', () => withDocument(document => {
  const base = 'https://example.com/a&b/&quot;/say\'hello';
  const host = document.createElement('div');
  host.innerHTML = oneMapAttribution(base);
  assert.equal(host.querySelectorAll('img').length, 1);
  assert.equal(host.querySelector('img')!.getAttribute('src'), base + '/web-assets/images/logo/om_logo.png');
  assert.equal(host.querySelectorAll('a').length, 2);
  assert.equal(host.querySelector('[onerror], [onload], [data-xss]'), null);
}));

test('first-party rendering forbids raw HTML APIs and string popup content', () => {
  const root = new URL('../src/', import.meta.url);
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.tsx?$/.test(file)) {
        const source = readFileSync(file, 'utf8');
        assert.ok(!/dangerouslySetInnerHTML|\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML|createContextualFragment|DOMParser|document\.write/.test(source), file);
        assert.ok(!/\.bind(?:Popup|Tooltip)\(\s*['"`]/.test(source), file);
      }
    }
  }
  inspect(root.pathname);
});
