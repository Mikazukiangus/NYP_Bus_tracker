import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NetworkFile } from '../src/types/network';
import type { StopServiceArrivals } from '../src/types/bus';
import { buildBusNetwork, searchStops, servicesNear } from '../src/services/busNetwork';
import { expectedTotalMin, liveDeparture, planTrips } from '../src/services/tripPlanner';
import { addRecentPlace, loadRecentPlaces, parseOneMapResults, titleCase } from '../src/services/placeSearch';

// A small made-up network: an east-west line A-F along lat 1.30 (~550 m apart) served by 10 and 10A,
// and a north-south line from D up to J served by 20. Getting from A to J needs a change at D.
const LAT = 1.3;
const lng = (i: number) => 103.8 + i * 0.005;
const file: NetworkFile = {
  generatedAt: '2026-10-10T00:00:00Z',
  stops: [
    ['10001', 'Stop A', 'East Rd', LAT, lng(0)],
    ['10002', 'Stop B', 'East Rd', LAT, lng(1)],
    ['10003', 'Stop C', 'East Rd', LAT, lng(2)],
    ['10004', 'Stop D', 'East Rd', LAT, lng(3)],
    ['10005', 'Stop E', 'East Rd', LAT, lng(4)],
    ['20001', 'Stop H', 'North Ave', 1.305, lng(3)],
    ['20002', 'Stop I', 'North Ave', 1.31, lng(3)],
    ['20003', 'Stop J', 'North Ave', 1.315, lng(3)],
  ],
  patterns: [
    ['10', 1, [0, 1, 2, 3, 4], [0, 6, 6, 6, 6]],
    ['10A', 1, [0, 1, 2, 3], [0, 6, 6, 6]],
    ['20', 1, [3, 5, 6, 7], [0, 6, 6, 6]],
  ],
};
const net = buildBusNetwork(file);
const at = (code: string) => {
  const s = net.byCode.get(code)!;
  return { lat: s.lat, lng: s.lng };
};

test('buses near a point list each service once, from its nearest stop, and skip termini', () => {
  const near = servicesNear(net, LAT, lng(3));
  assert.deepEqual(
    near.services.map((s) => `${s.serviceNo}@${s.stop.code}`),
    ['10@10004', '20@10004']
  );
  // 10A ends at D, so it can't be boarded there
  assert.ok(!near.services.some((s) => s.serviceNo === '10A'));
});

test('stop search matches 5-digit codes and names', () => {
  assert.deepEqual(searchStops(net, '2000').map((s) => s.code), ['20001', '20002', '20003']);
  assert.deepEqual(searchStops(net, 'stop c').map((s) => s.code), ['10003']);
  assert.deepEqual(searchStops(net, 'x'), []);
});

test('direct trips merge services that share the same stops', () => {
  const plan = planTrips(net, at('10001'), at('10004'));
  assert.equal(plan.options.length, 1);
  const [leg] = plan.options[0].legs;
  assert.equal(leg.serviceNo, '10');
  assert.deepEqual(leg.alsoServiceNos, ['10A']);
  assert.equal(leg.board.code, '10001');
  assert.equal(leg.alight.code, '10004');
  assert.equal(leg.stopCount, 3);
  assert.equal(leg.distanceM, 1800);
  assert.equal(leg.towards, 'Stop E');
});

test('a change of bus is found when no single bus goes there', () => {
  const plan = planTrips(net, at('10001'), at('20003'));
  assert.ok(plan.options.length >= 1);
  const best = plan.options[0];
  assert.deepEqual(best.legs.map((l) => l.serviceNo), ['10', '20']);
  assert.equal(best.legs[0].alight.code, '10004');
  assert.equal(best.legs[1].board.code, '10004');
  assert.equal(best.transferWalkM, 0);
});

test('short trips suggest walking instead of a bus', () => {
  const plan = planTrips(net, at('10001'), { lat: LAT, lng: lng(0) + 0.0027 }); // ~300 m away
  assert.equal(plan.options.length, 0);
  assert.ok(plan.walkOnlyMin < 6);
});

test('live departures pick the first bus you can still catch, across merged services', () => {
  const plan = planTrips(net, { lat: LAT, lng: lng(0) - 0.0018 }, at('10004')); // ~200 m walk to Stop A
  const option = plan.options[0];
  const bus = (estimatedMinutes: number, monitored = true) => ({
    estimatedMinutes, load: 'SEA' as const, type: 'SD' as const, feature: '' as const, monitored,
  });
  const arrivals: StopServiceArrivals[] = [
    { serviceNo: '10A', operator: 'SBST', nextBus: bus(1), nextBus2: bus(9, false), nextBus3: null },
    { serviceNo: '10', operator: 'SBST', nextBus: bus(5), nextBus2: null, nextBus3: null },
  ];
  const live = liveDeparture(option, arrivals);
  assert.equal(live.status, 'live');
  if (live.status !== 'live') return;
  // The 1-minute bus leaves before you can walk ~3 minutes to the stop
  assert.equal(live.catchEtaMin, 5);
  assert.equal(live.catchServiceNo, '10');
  assert.deepEqual(live.nextEtas, [1, 5, 9]);
  assert.ok(Math.abs(expectedTotalMin(option, live) - (option.travelMin + 5 - option.walkStartMin)) < 1e-9);

  assert.equal(liveDeparture(option, undefined).status, 'loading');
  assert.equal(liveDeparture(option, null).status, 'unavailable');
  assert.equal(liveDeparture(option, [{ ...arrivals[0], serviceNo: '99' }]).status, 'not-running');
  assert.equal(expectedTotalMin(option, { status: 'not-running' }), Infinity);
});

test('OneMap names are title-cased, de-duplicated and ranked by how well they match', () => {
  assert.equal(titleCase('CHANGI AIRPORT MRT STATION (CG2)'), 'Changi Airport MRT Station (CG2)');
  const results = parseOneMapResults(
    [
      { SEARCHVAL: 'FAMILY CLINIC JURONG POINT', BLK_NO: '1', ROAD_NAME: 'JURONG WEST CENTRAL 2', POSTAL: '648886', LATITUDE: '1.3397', LONGITUDE: '103.7067' },
      { SEARCHVAL: 'JURONG POINT', BLK_NO: '1', ROAD_NAME: 'JURONG WEST CENTRAL 2', POSTAL: '648886', LATITUDE: '1.3397', LONGITUDE: '103.7067' },
      { SEARCHVAL: 'JURONG POINT', BLK_NO: '1', ROAD_NAME: 'JURONG WEST CENTRAL 2', POSTAL: '648886', LATITUDE: '1.33971', LONGITUDE: '103.70671' },
      { SEARCHVAL: 'LONDON', LATITUDE: '51.5', LONGITUDE: '-0.1' },
    ],
    'jurong point'
  );
  assert.deepEqual(results.map((r) => r.name), ['Jurong Point', 'Family Clinic Jurong Point']);
  assert.equal(results[0].subtitle, '1 Jurong West Central 2, Singapore 648886');
  assert.equal(results[0].kind, 'place');

  const [postal] = parseOneMapResults(
    [{ SEARCHVAL: '123 ANG MO KIO AVENUE 6 SINGAPORE 560123', BLK_NO: '123', ROAD_NAME: 'ANG MO KIO AVENUE 6', BUILDING: 'NIL', POSTAL: '560123', LATITUDE: '1.37048', LONGITUDE: '103.84481' }],
    '560123'
  );
  assert.deepEqual([postal.kind, postal.name, postal.subtitle], ['postal', '123 Ang Mo Kio Avenue 6', 'Singapore 560123']);
});

test('recent places keep the latest six, most recent first, and survive bad storage', () => {
  let saved = '';
  const storage = { setItem: (_: string, v: string) => { saved = v; }, getItem: () => saved };
  let list = loadRecentPlaces(storage);
  for (let i = 0; i < 8; i++) {
    list = addRecentPlace({ id: `p${i}`, kind: 'place', name: `Place ${i}`, lat: 1.3, lng: 103.8 + i / 1000 }, list, storage);
  }
  list = addRecentPlace(list[3], list, storage);
  assert.deepEqual(loadRecentPlaces(storage).map((p) => p.id), ['p4', 'p7', 'p6', 'p5', 'p3', 'p2']);
  assert.deepEqual(loadRecentPlaces({ getItem: () => '{bad' }), []);
  assert.deepEqual(loadRecentPlaces({ getItem: () => JSON.stringify([{ id: 'x', name: 'Far', kind: 'place', lat: 51, lng: 0 }]) }), []);
});
