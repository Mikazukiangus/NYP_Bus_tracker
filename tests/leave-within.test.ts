import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leaveWithin, walkMinutes } from '../src/services/leaveWithin';

const bus = (estimatedMinutes: number, monitored = true) => ({ estimatedMinutes, monitored });

test('leave within: the time to spare before walking to the first bus you can reach', () => {
  // A 3 min walk (240 m): the bus in 1 min is gone, so it's the one in 9 min, with 6 min to spare
  assert.deepEqual(leaveWithin(240, [bus(1), bus(9, false), bus(17)]), {
    status: 'leave', inMin: 6, walkMin: 3, busMin: 9, monitored: false,
  });
  // A minute's slack: the bus in 2 min can still be caught on a 3 min walk, by leaving now
  assert.deepEqual(leaveWithin(240, [bus(9), bus(2)]), {
    status: 'leave', inMin: 0, walkMin: 3, busMin: 2, monitored: true,
  });
});

test('leave within: at the stop, every bus too soon, and no buses', () => {
  assert.deepEqual(leaveWithin(40, [bus(5)]), { status: 'at-stop' });
  assert.deepEqual(leaveWithin(800, [bus(3), bus(6)]), { status: 'too-soon', walkMin: 10 });
  assert.equal(leaveWithin(240, [null, null]), null);
  assert.equal(walkMinutes(50), 0);
  assert.equal(walkMinutes(51), 1);
  assert.equal(walkMinutes(220), 3);
});
