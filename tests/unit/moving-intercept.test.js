const test = require('node:test');
const assert = require('node:assert/strict');
const intercept = require('../../src/shared/moving-intercept.js');

const ironNest = { xKm: 10, yKm: 5 };
const northbound = { xKm: 10, yKm: 7, headingDeg: 0, speedKmPerSec: 0.005 };
const eastbound = { xKm: 8, yKm: 5, headingDeg: 90, speedKmPerSec: 0.005 };

test('单炮拦截在转炮后保留固定 80 秒装填缓冲', () => {
  const result = intercept.recommendSingle({ ironNest, track: northbound, currentBearing: 0 });
  assert.ok(result.shot.fireAtSec >= 80);
  assert.equal(result.shot.bufferSec, 80);
  assert.ok(result.shot.impactElapsedSec > result.shot.fireAtSec);
  assert.ok(result.shot.elevationDeg <= 60);
  assert.ok(Number.isInteger(result.shot.charge));
  assert.ok(result.shot.charge >= 1 && result.shot.charge <= 6);
});

test('单炮拦截支持最早弹着与最低药号两种推荐方式', () => {
  const fastest = intercept.recommendSingle({ ironNest, track: northbound, currentBearing: 0, strategy: 'fastest' });
  const lowestCharge = intercept.recommendSingle({ ironNest, track: northbound, currentBearing: 0, strategy: 'lowest-charge' });
  assert.equal(fastest.shot.charge, 6);
  assert.equal(lowestCharge.shot.charge, 1);
  assert.deepEqual(lowestCharge.candidates.map(candidate => candidate.charge), [1, 2, 3, 4, 5, 6]);
});

test('双炮拦截让次发从首发开火时点开始转炮并保留 20 秒缓冲', () => {
  const result = intercept.recommendDual({ ironNest, gunA: northbound, gunB: eastbound, currentBearing: 0 });
  const first = result.firstGunId === 'gun-a' ? result.gunA : result.gunB;
  const second = result.firstGunId === 'gun-a' ? result.gunB : result.gunA;
  assert.equal(first.turnStartsAtSec, 0);
  assert.equal(second.turnStartsAtSec, first.fireAtSec);
  assert.equal(second.bufferSec, 20);
  assert.ok(second.fireAtSec >= first.fireAtSec + 20);
});

test('双炮最易执行推荐选择可行组合中最长的开火间隔', () => {
  const result = intercept.recommendDual({ ironNest, gunA: northbound, gunB: eastbound, currentBearing: 0, strategy: 'easiest' });
  assert.equal(result.launchGapSec, Math.max(...result.candidates.map(candidate => candidate.launchGapSec)));
});
