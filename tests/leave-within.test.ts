import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leaveLabel, leaveWithin, walkMinutes } from '../src/services/leaveWithin';

const bus = (estimatedMinutes: number, monitored = true) => ({ estimatedMinutes, monitored });

test('leave within: the time to spare before walking to the first bus you can reach', () => {
  // 185 m in a straight line is a ~3 min walk (with the detour): the bus in 1 min is gone, so it's the one in 9 min
  assert.deepEqual(leaveWithin(185, [bus(1), bus(9, false), bus(17)]), {
    status: 'leave', inMin: 6, walkMin: 3, busMin: 9, monitored: false,
  });
  // A minute's slack: the bus in 2 min can still be caught on a 3 min walk, by leaving now
  assert.deepEqual(leaveWithin(185, [bus(9), bus(2)]), {
    status: 'leave', inMin: 0, walkMin: 3, busMin: 2, monitored: true,
  });
  assert.equal(leaveLabel(leaveWithin(185, [bus(1), bus(9), bus(17)])), 'Leave within 6 min');
  assert.equal(leaveLabel(leaveWithin(185, [bus(4)])), 'Leave now');
});

test('leave within: at the stop, every bus too soon, and no buses', () => {
  assert.deepEqual(leaveWithin(40, [bus(5)]), { status: 'at-stop' });
  assert.deepEqual(leaveWithin(620, [bus(3), bus(6)]), { status: 'too-soon', walkMin: 10 });
  assert.equal(leaveWithin(185, [null, null]), null);
  assert.equal(leaveLabel(leaveWithin(40, [bus(5)])), null);
});

test('walking time is the straight line plus 30% at 80 m a minute, the same everywhere', () => {
  assert.equal(walkMinutes(50), 0, 'at the stop');
  assert.equal(walkMinutes(51), 1);
  assert.equal(walkMinutes(220), 4); // 286 m on foot
  assert.equal(walkMinutes(185), 3);
});
