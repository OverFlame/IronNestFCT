const test = require('node:test');
const assert = require('node:assert/strict');
const tot = require('../../src/shared/tot.js');

test('TOT 平滑转向公式在十度阈值处连续', () => {
  assert.deepEqual(tot.turnProfile(0, 10), { turnDeg: 10, rotationTimeSec: 5, bufferSec: 7, readyTimeSec: 12 });
  const above = tot.turnProfile(0, 10.1);
  assert.equal(Number(above.rotationTimeSec.toFixed(3)), 5.025);
  assert.equal(above.bufferSec, 10);
  assert.equal(tot.shortestTurnDeg(350, 10), 20);
});

test('TOT 首发从当前炮向就绪，次发按首发与次发方位角差转向', () => {
  const result = tot.recommendTot({
    currentBearing: 0,
    left: { bearingDeg: 20, distanceKm: 10 },
    right: { bearingDeg: 90, distanceKm: 5 },
    strategy: 'fastest'
  });
  assert.equal(result.left.rotationTimeSec, 7.5);
  assert.equal(result.left.bufferSec, 10);
  assert.equal(result.right.turnDeg, 70);
  assert.equal(result.right.rotationTimeSec, 20);
  assert.equal(result.right.bufferSec, 10);
  assert.equal(result.left.fireAtSec, 17.5);
  assert.equal(result.right.fireAtSec, 47.5);
  assert.equal(result.right.turnStartsAtSec, result.left.fireAtSec);
  assert.equal(result.left.fireAtSec + result.left.flightTimeSec, result.impactAtSec);
  assert.equal(result.right.fireAtSec + result.right.flightTimeSec, result.impactAtSec);
  assert.equal(result.firstGunId, 'gun-a');
  assert.equal(result.laterFlightTimeSec, result.right.flightTimeSec);
});

test('TOT 排除无法在首发至次发间完成转向与缓冲的药号组合', () => {
  const result = tot.recommendTot({
    currentBearing: 0,
    left: { bearingDeg: 0, distanceKm: 10 },
    right: { bearingDeg: 70, distanceKm: 5 },
    strategy: 'fastest'
  });
  assert.ok(result.launchGapSec >= result.right.readyTimeSec);
  assert.equal(result.firstGunId, 'gun-a');
});

test('TOT 最短开火策略优先选择最短开火间隔', () => {
  const result = tot.recommendTot({
    currentBearing: 0,
    left: { bearingDeg: 0, distanceKm: 5 },
    right: { bearingDeg: 0, distanceKm: 5 },
    strategy: 'shortest-launch-gap'
  });
  assert.equal(result.launchGapSec, 0);
  assert.equal(result.firstGunId, 'both');
});

test('TOT 最易执行策略选择有效组合中的最长开火间隔', () => {
  const input = {
    currentBearing: 0,
    left: { bearingDeg: 0, distanceKm: 10 },
    right: { bearingDeg: 0, distanceKm: 5 }
  };
  const easiest = tot.recommendTot({ ...input, strategy: 'easiest' });
  const fastest = tot.recommendTot({ ...input, strategy: 'fastest' });
  assert.equal(easiest.launchGapSec, Math.max(...easiest.candidates.map(candidate => candidate.launchGapSec)));
  assert.ok(easiest.launchGapSec >= fastest.launchGapSec);
});
