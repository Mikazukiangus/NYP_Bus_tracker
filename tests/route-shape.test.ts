import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legPath, matchStopsToPath } from '../src/services/routeShape';
import type { BusStop, RouteDirection } from '../src/types/bus';

const stop = (code: string, lat: number, lng: number): BusStop => ({ code, name: code, road: 'Test Rd', lat, lng });

// A loop like Svc 269: out east along one road (one long straight segment, no points in between), then back
// west along a parallel road 45 m north drawn with many points. The outbound stops are nearer a point of the
// way back than any point of the way out, though they sit right beside the way out.
const OUT_LAT = 1.35;
const BACK_LAT = 1.3504;
const path: [number, number][] = [[OUT_LAT, 103.85], [OUT_LAT, 103.86]];
for (let lng = 103.86; lng >= 103.85 - 1e-9; lng -= 0.001) path.push([BACK_LAT, Number(lng.toFixed(3))]);

const stops = [
  stop('INT', 1.35, 103.8499),
  stop('OUT1', 1.3499, 103.853),
  stop('OUT2', 1.3499, 103.856),
  stop('TURN', 1.3502, 103.8601),
  stop('BACK1', 1.3505, 103.857),
  stop('BACK2', 1.3505, 103.854),
  stop('INT', 1.35, 103.8499),
];
const loop: RouteDirection = { origin: 'INT', destination: 'INT', stops, path, pathSource: 'OPENSTREETMAP' };

test('stops on a loop are placed on the pass they are served on, in riding order', () => {
  const matched = matchStopsToPath(stops, path);
  assert.ok(matched.every((m) => m !== null));
  const along = matched.map((m) => m!.seg + m!.t);
  assert.deepEqual([...along].sort((a, b) => a - b), along, 'in riding order');
  assert.equal(matched[1]!.seg, 0, 'OUT1 is on the way out, not the nearby way back');
  assert.equal(matched[2]!.seg, 0);
  assert.ok(matched[4]!.seg > 0 && matched[5]!.seg > 0, 'BACK stops are on the way back');
  assert.ok(along[6] > along[5], 'the second visit to the interchange is at the end of the line');
});

test('a ride on a loop follows the road it is on instead of cutting across', () => {
  const out = legPath(loop, 'OUT1', 'OUT2')!;
  assert.equal(out.followsRoads, true);
  assert.ok(out.path.every(([lat]) => lat < 1.3501), 'stays on the way out');

  const round = legPath(loop, 'OUT2', 'BACK1')!;
  assert.equal(round.followsRoads, true);
  assert.ok(round.path.some(([lat, lng]) => lng >= 103.8599 && lat === OUT_LAT), 'goes round the far end');

  const home = legPath(loop, 'BACK2', 'INT')!;
  assert.equal(home.followsRoads, true);
  assert.ok(home.path.slice(1, -1).every(([lat]) => lat === BACK_LAT), 'stays on the way back');
});

test('a stop far from the line is left out and the ride starts at the next stop on it', () => {
  const offLine = [...stops];
  offLine[2] = stop('OUT2', 1.356, 103.856); // ~670 m north of both roads
  const matched = matchStopsToPath(offLine, path);
  assert.equal(matched[2], null);
  assert.ok(matched.filter((m) => m === null).length === 1);

  const ride = legPath({ ...loop, stops: offLine }, 'OUT2', 'BACK1')!;
  assert.equal(ride.followsRoads, true);
  assert.deepEqual(ride.path[0], [1.356, 103.856], 'still starts at the stop itself');
});
