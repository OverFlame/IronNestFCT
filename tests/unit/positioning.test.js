const test = require('node:test');
const assert = require('node:assert/strict');
const positioning = require('../../src/shared/positioning');

test('军事方位角以北为零并顺时针增加', () => {
  assert.deepEqual(positioning.directionFromBearing(0), { x: 0, y: 1 });
  assert.ok(Math.abs(positioning.directionFromBearing(90).x - 1) < 1e-9);
  assert.ok(Math.abs(positioning.directionFromBearing(180).y + 1) < 1e-9);
  assert.equal(positioning.normalizeBearing(360), 0);
  assert.equal(positioning.normalizeBearing(-90), 270);
});

test('方位角加距离单点计算沿观测点前向定位', () => {
  assert.deepEqual(positioning.pointFromBearingDistance({ xKm: 1, yKm: 1 }, 90, 2), { xKm: 3, yKm: 1 });
  assert.throws(() => positioning.pointFromBearingDistance({ xKm: 1, yKm: 1 }, 90, 0), RangeError);
});

test('双半箭头取跨越 0 度的短弧中线，并拒绝无唯一中线的相反方位', () => {
  assert.equal(positioning.bisectBearings(350, 10), 0);
  assert.equal(positioning.bisectBearings(30, 90), 60);
  assert.throws(() => positioning.bisectBearings(0, 180), RangeError);
});

test('双方位角交会得到唯一前向交点', () => {
  assert.deepEqual(
    positioning.intersectBearings({ xKm: 0, yKm: 0 }, 45, { xKm: 2, yKm: 0 }, 315),
    [{ xKm: 1, yKm: 1 }]
  );
});

test('平行方位线和反向交点不产生目标', () => {
  assert.deepEqual(positioning.intersectBearings({ xKm: 0, yKm: 0 }, 0, { xKm: 2, yKm: 0 }, 0), []);
  assert.deepEqual(positioning.intersectBearings({ xKm: 0, yKm: 0 }, 225, { xKm: 2, yKm: 0 }, 135), []);
});

test('方位角加距离允许两个前向目标点', () => {
  assert.deepEqual(
    positioning.intersectBearingDistance({ xKm: 0, yKm: 1 }, 90, { xKm: 2, yKm: 1 }, 1),
    [{ xKm: 1, yKm: 1 }, { xKm: 3, yKm: 1 }]
  );
});

test('方位角加距离的切点只返回一次', () => {
  assert.deepEqual(
    positioning.intersectBearingDistance({ xKm: 0, yKm: 0 }, 90, { xKm: 2, yKm: 1 }, 1),
    [{ xKm: 2, yKm: 0 }]
  );
});

test('双距离交会返回两个对称解', () => {
  assert.deepEqual(
    positioning.intersectDistances({ xKm: 0, yKm: 1 }, Math.SQRT2, { xKm: 2, yKm: 1 }, Math.SQRT2),
    [{ xKm: 1, yKm: 2 }, { xKm: 1, yKm: 0 }]
  );
});

test('第三个距离观测能从双距离候选中筛选唯一解', () => {
  const candidates = positioning.intersectDistances({ xKm: 0, yKm: 1 }, Math.SQRT2, { xKm: 2, yKm: 1 }, Math.SQRT2);
  const verified = candidates.filter(point => Math.abs(positioning.distanceBetween({ xKm: 1, yKm: 0 }, point) - 2) <= 0.01);
  assert.deepEqual(verified, [{ xKm: 1, yKm: 2 }]);
});

test('双距离圆相切时只返回一个交会点', () => {
  const points = positioning.intersectDistances(
    { xKm: 0.05, yKm: 1.05 }, 1,
    { xKm: 2.05, yKm: 1.05 }, 1
  );
  assert.equal(points.length, 1);
  assert.ok(Math.abs(points[0].xKm - 1.05) < 1e-9);
  assert.ok(Math.abs(points[0].yKm - 1.05) < 1e-9);
});

test('不相交圆和无效距离返回或抛出明确结果', () => {
  assert.deepEqual(positioning.intersectDistances({ xKm: 0, yKm: 0 }, 1, { xKm: 3, yKm: 0 }, 1), []);
  assert.throws(() => positioning.intersectDistances({ xKm: 0, yKm: 0 }, 0, { xKm: 3, yKm: 0 }, 1), RangeError);
});

test('两点间距离和方位角计算正确', () => {
  assert.equal(positioning.distanceBetween({ xKm: 1, yKm: 1 }, { xKm: 4, yKm: 5 }), 5);
  assert.equal(positioning.bearingBetween({ xKm: 1, yKm: 1 }, { xKm: 2, yKm: 1 }), 90);
});

test('多解定位自动排除地图之外的结果', () => {
  const solutions = positioning.intersectBearingDistance(
    { xKm: 0, yKm: 1 }, 90,
    { xKm: 19, yKm: 1 }, 2
  );
  assert.deepEqual(solutions, [{ xKm: 17, yKm: 1 }, { xKm: 21, yKm: 1 }]);
  assert.deepEqual(positioning.filterPointsToBounds(solutions, 20, 10), [{ xKm: 17, yKm: 1 }]);
  assert.equal(positioning.isPointInsideBounds({ xKm: 20, yKm: 9.99 }, 20, 10), false);
  assert.equal(positioning.isPointInsideBounds({ xKm: 19.99, yKm: 10 }, 20, 10), false);
});

test('铁巢到目标的火控方位角和距离按统一坐标系计算', () => {
  assert.deepEqual(
    positioning.calculateFireSolution({ xKm: 1, yKm: 1 }, { xKm: 4, yKm: 5 }),
    { bearingDeg: 36.8698976458, distanceKm: 5 }
  );
  assert.deepEqual(
    positioning.calculateFireSolution({ xKm: 4, yKm: 5 }, { xKm: 1, yKm: 1 }),
    { bearingDeg: 216.8698976458, distanceKm: 5 }
  );
});
