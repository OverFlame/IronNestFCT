const test = require('node:test');
const assert = require('node:assert/strict');
const ballistics = require('../../src/shared/ballistics.js');

test('弹道核心筛选不超过 60 度的装药方案', () => {
  const result = ballistics.calculateSolutions(12.5);
  assert.equal(result.minimum.charges, 3);
  assert.equal(result.minimum.elevationDeg, 50);
  assert.equal(result.sixCharge.elevationDeg, 25);
  assert.deepEqual(result.solutions.map(item => item.charges), [3, 4, 5, 6]);
});

test('飞行时间使用分装药系数并四舍五入到整秒', () => {
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => ballistics.flightTime(10, index + 1)), [47, 38, 26, 19, 16, 14]);
});

test('30 km 边界仅保留 6 包且更远时无方案', () => {
  assert.deepEqual(ballistics.calculateSolutions(30).solutions.map(item => item.charges), [6]);
  assert.equal(ballistics.calculateSolutions(30.01).solutions.length, 0);
  assert.throws(() => ballistics.calculateSolutions(0), /大于 0/);
});
