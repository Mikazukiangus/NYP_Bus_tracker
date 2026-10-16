import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NetworkFile } from '../src/types/network';
import type { StopServiceArrivals } from '../src/types/bus';
import { buildBusNetwork, nearestStops, searchStops } from '../src/services/busNetwork';
import { alightFor, expectedTotalMin, legServiceNos, liveDeparture, planTrips, withServices } from '../src/services/tripPlanner';
import { addRecentPlace, loadRecentPlaces, parseOneMapResults, titleCase } from '../src/services/placeSearch';
import { leaveWithin, walkMinutes } from '../src/services/leaveWithin';
import { calculateDistanceMeters } from '../src/data/singaporeBuses';

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

test('nearest stops list every service that can be boarded there, nearest stop first', () => {
  const near = nearestStops(net, LAT + 0.0005, lng(3), 3);
  assert.deepEqual(
    near.map((n) => `${n.stop.code}:${n.services.map((s) => s.serviceNo).join(',')}`),
    // D: 10 continues to E, 20 starts there; 10A ends at D so it can't be boarded there
    ['10004:10,20', '20001:20', '10003:10,10A']
  );
  assert.equal(near[0].services[0].towards, 'Stop E');
  assert.ok(near[0].distanceM < near[1].distanceM && near[1].distanceM < near[2].distanceM);
  // Terminus-only stops (J) are skipped
  assert.ok(!nearestStops(net, 1.315, lng(3), 8).some((n) => n.stop.code === '20003'));
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

test('every other bus between the same stops can be chosen instead, unless it takes much longer', () => {
  // 30 and 31 both run stops 0 to 3 (31 goes on to 4); 39 also gets from 0 to 3, but by way of a stop 5 km away
  const stop = (i: number): NetworkFile['stops'][number] => [`3000${i}`, `Stop ${i}`, 'West Rd', LAT, lng(i)];
  const lineNet = buildBusNetwork({
    generatedAt: '2026-10-10T00:00:00Z',
    stops: [stop(0), stop(1), stop(2), stop(3), stop(4), ['30009', 'Far Stop', 'Far Rd', 1.35, lng(1)]],
    patterns: [
      ['30', 1, [0, 1, 2, 3], [0, 6, 6, 6]],
      ['31', 1, [0, 1, 2, 3, 4], [0, 6, 6, 6, 6]],
      ['39', 1, [0, 5, 3], [0, 55, 55]],
    ],
  });
  // Between stops 3 and 4: 31's own best trip gets off at 4, but it also runs 30's stops
  const plan = planTrips(lineNet, { lat: LAT, lng: lng(0) }, { lat: LAT, lng: lng(3.6) });
  const option = plan.options.find((o) => o.legs[0].serviceNo === '30');
  assert.ok(option);
  const [leg] = option.legs;
  assert.deepEqual([leg.board.code, leg.alight.code], ['30000', '30003']);
  assert.deepEqual(leg.alsoServiceNos, ['31']);
  assert.deepEqual(leg.alternatives.map((a) => [a.serviceNo, a.stopCount, a.alight.code]), [['31', 3, '30003']]);

  // Choosing 31 keeps the trip (same id) with 31's leg; 30 becomes the other choice
  const chosen = withServices(option, ['31']);
  assert.equal(chosen.id, option.id);
  assert.equal(chosen.legs[0].serviceNo, '31');
  assert.deepEqual(chosen.legs[0].alsoServiceNos, ['30']);
  assert.equal(chosen.legs[0].towards, 'Stop 4');
  assert.deepEqual(legServiceNos(chosen.legs[0]), ['30', '31']);
  assert.equal(withServices(chosen, ['30']).legs[0].serviceNo, '30');
  // Unknown or unchanged choices keep the trip as it is
  assert.equal(withServices(option, ['99']), option);
  assert.equal(withServices(option, [undefined]), option);
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

test('the stop to get off a tracked bus is the one nearest the destination in riding + walking time', () => {
  const advice = alightFor(net, '10', 1, '10001', { lat: LAT + 0.001, lng: lng(3) }); // ~110 m from Stop D
  assert.equal(advice?.status, 'alight');
  if (advice?.status !== 'alight') return;
  assert.equal(advice.leg.alight.code, '10004');
  assert.equal(advice.leg.stopCount, 3);
  assert.ok(advice.walkEndM > 100 && advice.walkEndM < 120);

  // Bus 10 never comes within walking distance of Stop J: its closest stop is reported instead
  const far = alightFor(net, '10', 1, '10001', at('20003'));
  assert.equal(far?.status, 'not-near');
  if (far?.status === 'not-near') assert.equal(far.closest.code, '10004');

  // Nothing to suggest when walking from the boarding stop is as quick, or for an unknown bus or stop
  assert.equal(alightFor(net, '10', 1, '10001', { lat: LAT, lng: lng(0) + 0.0027 }), null);
  assert.equal(alightFor(net, '99', 1, '10001', at('10004')), null);
  assert.equal(alightFor(net, '10A', 1, '10004', at('10001')), null); // 10A ends at D
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
  assert.deepEqual(live.nextBuses, [
    { serviceNo: '10A', etaMin: 1 },
    { serviceNo: '10', etaMin: 5 },
    { serviceNo: '10A', etaMin: 9 },
  ]);
  assert.ok(Math.abs(expectedTotalMin(option, live) - (option.travelMin + 5 - option.walkStartMin)) < 1e-9);

  // The leave time is the arrivals card's: Bus 10 in 5 min, ~3 min walk
  assert.deepEqual(live.leave, { status: 'leave', inMin: 2, walkMin: 3, busMin: 5, monitored: true });

  assert.equal(liveDeparture(option, undefined).status, 'loading');
  assert.equal(liveDeparture(option, null).status, 'unavailable');
  assert.equal(liveDeparture(option, [{ ...arrivals[0], serviceNo: '99' }]).status, 'not-running');
  assert.equal(expectedTotalMin(option, { status: 'not-running' }), Infinity);
});

test('a trip and the arrivals card for its bus give the same walk and leave time, at any distance', () => {
  const bus = (estimatedMinutes: number) => ({
    estimatedMinutes, load: 'SEA' as const, type: 'SD' as const, feature: '' as const, monitored: true,
  });
  const busSets = [[1, 9, 17], [2, 9, 16], [0, 3, 6], [4, 11, 30], [12, 20, 28]];
  let compared = 0;
  for (let k = 0; k <= 30; k++) {
    const from = { lat: LAT + 0.00004 * k, lng: lng(0) - 0.00025 * k }; // 0 to ~850 m from Stop A
    const option = planTrips(net, from, at('10004')).options.find((o) => o.legs[0].board.code === '10001');
    if (!option) continue;
    // The card measures from the same place to the same stop
    const cardWalkM = calculateDistanceMeters(from.lat, from.lng, at('10001').lat, at('10001').lng);
    assert.equal(Math.max(1, Math.round(option.walkStartMin)), Math.max(1, walkMinutes(cardWalkM)), `walk at ${cardWalkM} m`);
    for (const times of busSets) {
      const [b1, b2, b3] = times.map(bus);
      const arrivals: StopServiceArrivals[] = [{ serviceNo: '10', operator: 'SBST', nextBus: b1, nextBus2: b2, nextBus3: b3 }];
      const live = liveDeparture(option, arrivals);
      assert.ok(live.status === 'live');
      assert.deepEqual(live.leave, leaveWithin(cardWalkM, [b1, b2, b3]), `${cardWalkM} m, buses in ${times.join(', ')} min`);
      compared++;
    }
  }
  assert.ok(compared >= 50, `${compared} cases compared`);
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

  // Places with a postal code come before flyovers and exits, even when those match the name better
  const changi = parseOneMapResults(
    [
      { SEARCHVAL: 'CHANGI AIRPORT AIRCRAFT FLYOVER', LATITUDE: '1.3540', LONGITUDE: '103.9800' },
      { SEARCHVAL: 'CHANGI AIRPORT LIFT PUMPING STATION', ROAD_NAME: 'AIRPORT BOULEVARD', LATITUDE: '1.3550', LONGITUDE: '103.9810' },
      { SEARCHVAL: 'CHANGI AIRPORT MRT STATION (CG2)', BLK_NO: '70', ROAD_NAME: 'AIRPORT BOULEVARD', POSTAL: '819661', LATITUDE: '1.3573', LONGITUDE: '103.9886' },
      { SEARCHVAL: 'CHANGI AIRPORT MRT STATION EXIT A', LATITUDE: '1.3574', LONGITUDE: '103.9887' },
      { SEARCHVAL: 'JEWEL CHANGI AIRPORT', BLK_NO: '78', ROAD_NAME: 'AIRPORT BOULEVARD', POSTAL: '819666', LATITUDE: '1.3602', LONGITUDE: '103.9898' },
    ],
    'changi airport'
  );
  assert.deepEqual(changi.map((r) => r.name), [
    'Changi Airport MRT Station (CG2)',
    'Jewel Changi Airport',
    'Changi Airport Aircraft Flyover',
    'Changi Airport Lift Pumping Station',
    'Changi Airport MRT Station Exit A',
  ]);

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
