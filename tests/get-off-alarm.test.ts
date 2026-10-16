import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rideProgress } from '../src/services/getOffAlarm';

// Metres to degrees around Singapore, matching the module's flat approximation
const LAT0 = 1.35;
const LNG0 = 103.85;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const at = (eastM: number, northM: number) => ({ lat: LAT0 + northM / 110_540, lng: LNG0 + eastM / KX });

const phaseAt = (stops: ReturnType<typeof at>[], eastM: number, northM: number, fromSegment = 0) => {
  const p = rideProgress(stops, at(eastM, northM), fromSegment);
  return p && { phase: p.phase, stopsToGo: p.stopsToGo, remainingM: Math.round(p.remainingM) };
};

test('get-off alarm: stops to go, then "your stop is next", then "get off now"', () => {
  // Five stops 400 m apart, heading north; you get off at the last
  const stops = [0, 400, 800, 1200, 1600].map((n) => at(0, n));
  assert.deepEqual(phaseAt(stops, 0, 0), { phase: 'riding', stopsToGo: 4, remainingM: 1600 });
  assert.deepEqual(phaseAt(stops, 0, 600), { phase: 'riding', stopsToGo: 3, remainingM: 1000 });
  // At the stop before yours (the bus is stopping or leaving): ring the bell for the next one
  assert.deepEqual(phaseAt(stops, 0, 1190), { phase: 'next-stop', stopsToGo: 1, remainingM: 410 });
  assert.deepEqual(phaseAt(stops, 0, 1300), { phase: 'next-stop', stopsToGo: 1, remainingM: 300 });
  assert.deepEqual(phaseAt(stops, 0, 1400), { phase: 'get-off', stopsToGo: 1, remainingM: 200 });
  assert.deepEqual(phaseAt(stops, 0, 1600), { phase: 'get-off', stopsToGo: 1, remainingM: 0 });
  // GPS drift to the side of the road is still on the ride; a street away isn't
  assert.equal(phaseAt(stops, 120, 600)?.phase, 'riding');
  assert.equal(phaseAt(stops, 600, 800)?.phase, 'off-route');
  // A coarse fix (wifi, phone masts) is ignored
  assert.equal(rideProgress(stops, { ...at(0, 1500), accuracyM: 500 }), null);
});

test('get-off alarm: never "get off now" while the bus is still at the stop before yours', () => {
  // The last two stops are only 100 m apart
  const stops = [0, 400, 500, 600].map((n) => at(0, n));
  assert.deepEqual(phaseAt(stops, 0, 400), { phase: 'riding', stopsToGo: 2, remainingM: 200 });
  assert.equal(phaseAt(stops, 0, 480)?.phase, 'next-stop'); // pulling in to the stop before
  assert.equal(phaseAt(stops, 0, 510)?.phase, 'next-stop'); // at it
  assert.equal(phaseAt(stops, 0, 540)?.phase, 'get-off'); // on the way to yours
});

test('get-off alarm: a route that loops back past where you got on', () => {
  // Up, across and back down, ending 50 m from the stop where you got on
  const stops = [at(0, 0), at(0, 800), at(500, 800), at(500, 0), at(50, 0)];
  // At the start (GPS a little off, nearer the end of the loop): still the start of the ride
  assert.deepEqual(phaseAt(stops, 30, 0), { phase: 'riding', stopsToGo: 4, remainingM: 2550 });
  // Once the bus is round the loop (the last fix was on the last part), it's your stop
  assert.equal(phaseAt(stops, 30, 0, 3)?.phase, 'get-off');
  // Progress never goes back: a stray fix by an earlier stop once the bus is on the way down isn't the start again
  assert.deepEqual(phaseAt(stops, 0, 790, 2), { phase: 'off-route', stopsToGo: 2, remainingM: 1250 });
});
