import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBusNetwork } from '../src/features/network/domain/buildNetwork';
import { planTrips } from '../src/services/tripPlanner';
import { rankTrips, trackedLegIndex } from '../src/features/journey/selectors';
import { buildJourney, buildTripView, buildAlightHint, buildAlarmRide, buildAfterGetOff } from '../src/features/journey/presentation';
import { busMarker, busPopup, etaCallout } from '../src/features/map/markerElements';
import type { BusRoute, IncomingBus, StopServiceArrivals, UserLocation } from '../src/types/bus';
import { withDocument } from './fixtures/dom';
import type { PlaceResult } from '../src/features/places/model';

const network = buildBusNetwork({
  generatedAt: 'fixture',
  stops: [
    ['10001', 'Start', 'East Rd', 1.3, 103.8], ['10002', 'Middle', 'East Rd', 1.3, 103.805],
    ['10003', 'Change', 'East Rd', 1.3, 103.81], ['10004', 'End', 'East Rd', 1.3, 103.815],
    ['20001', 'North', 'North Rd', 1.305, 103.81], ['20002', 'Destination', 'North Rd', 1.315, 103.81],
  ],
  patterns: [['10', 1, [0, 1, 2, 3], [0, 6, 6, 6]], ['20', 1, [2, 4, 5], [0, 6, 12]]],
});
const userLocation: UserLocation = { ...network.stops[0], source: 'selected-place' };
const destination: PlaceResult = { ...network.stops[5], id: 'destination', kind: 'place' };
const tripPlan = planTrips(network, userLocation, destination);
const selectedTrip = tripPlan.options[0];
const currentRoute: BusRoute = {
  serviceNo: '10', operator: 'SBST', category: 'Trunk',
  direction1: { origin: 'Start', destination: 'End', stops: network.stops.slice(0, 4), path: [] },
};
const selectedStop = network.stops[0];
const services = (minutes: number): StopServiceArrivals[] => [{
  serviceNo: '10', operator: 'SBST', nextBus: { estimatedMinutes: minutes, monitored: true, load: 'SEA', feature: '' },
  nextBus2: null, nextBus3: null,
}];

test('journey ranking uses the tracked stop snapshot rather than older trip polling', () => {
  const ranked = rankTrips({ tripPlan, selectedStop, dataSource: 'LTA_DATAMALL_V3', stopServices: services(5), tripArrivals: { '10001': services(40) } });
  assert.equal(ranked[0].live.status, 'live');
  if (ranked[0].live.status === 'live') assert.equal(ranked[0].live.catchEtaMin, 5);
  const unavailable = rankTrips({ tripPlan, selectedStop, dataSource: 'FALLBACK_SIMULATED', stopServices: services(5), tripArrivals: { '10001': null } });
  assert.equal(unavailable[0].live.status, 'unavailable');
});

test('journey presentation agrees about the transfer, alarm ride and next bus', () => {
  assert.equal(selectedTrip.legs.length, 2);
  const trackedLeg = trackedLegIndex(selectedTrip, '10', currentRoute.direction1, selectedStop.code);
  assert.equal(trackedLeg, 0);
  const tripView = buildTripView({ network, destination, selectedTrip, trackedLeg, notDueAt: () => [] });
  const alightHint = buildAlightHint({ network, destination, selectedTrip, tripView, currentRoute, routeDir: currentRoute.direction1, selectedStop, direction: 1 });
  assert.equal(alightHint?.stop.code, '10003');
  const alarm = buildAlarmRide({ alightHint, currentRoute, routeDir: currentRoute.direction1, selectedStop });
  assert.deepEqual(alarm?.stops.map((s) => s.code), ['10001', '10002', '10003']);
  assert.equal(buildAfterGetOff({ alightHint }), 'then Bus 20 from the same stop');
  assert.equal(trackedLegIndex(selectedTrip, '999', currentRoute.direction1, selectedStop.code), -1);
});

test('geometry from an older trip cannot replace the current journey fallback', () => {
  const overlay = buildJourney({ network, destination, userLocation, selectedTrip, trackedLeg: 0, tripPlan,
    tripPathKey: 'current', tripRoadPaths: { key: 'old', legs: [{ path: [[99, 99]], followsRoads: true }] } });
  assert.equal(overlay?.legs[0].followsRoads, false);
  assert.deepEqual(overlay?.legs[0].path[0], [1.3, 103.8]);
  const walkOnly = buildJourney({ network, destination, userLocation, selectedTrip: null, trackedLeg: -1,
    tripPlan: { ...tripPlan, options: [] }, tripPathKey: '', tripRoadPaths: null });
  assert.deepEqual(walkOnly?.legs, []);
});

test('DOM marker builders preserve literal external text and GPS/ETA presentation', () => withDocument(() => {
  const bus: IncomingBus = { id: 'fixture', serviceNo: '<bus>', ordinal: 1, lat: 1.3, lng: 103.8, etaMinutes: 5, load: 'SEA', type: 'DD', feature: 'WAB' };
  assert.ok(busMarker(bus).textContent?.includes('<bus>'));
  const popup = busPopup(bus, '<img src=x onerror=alert(1)>');
  assert.ok(popup.textContent?.includes('<img'));
  assert.equal(popup.querySelector('img'), null);
  const eta = etaCallout({ serviceNo: '<bus>', minutes: [0, 5, 10], live: true }, true);
  assert.ok(eta.querySelector('[aria-label="Live GPS"]'));
  assert.ok(eta.textContent?.includes('Arr'));
  assert.ok(eta.textContent?.includes('<bus>'));
  assert.equal(eta.querySelector('bus'), null);
}));
