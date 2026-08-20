const test = require('node:test');
const assert = require('node:assert/strict');
const derivation = require('../../src/shared/derivation.js');

const observerA = { xKm: 2, yKm: 2 };
const observerB = { xKm: 8, yKm: 2 };

function resolverFor(map) {
  return key => map[key] || null;
}

test('双方位角依赖可解析，源点移动后派生点随之更新', () => {
  // Bearing convention: 0=N, 90=E. A→(5,5)=45°(NE), B→(5,5)=315°(NW).
  const d = derivation.crossingDerivation('bearing-bearing', [
    { key: 'observer:1', bearingDeg: 45 },
    { key: 'observer:2', bearingDeg: 315 }
  ]);

  assert.deepEqual([...derivation.dependentKeys(d)].sort(), ['observer:1', 'observer:2']);

  const before = derivation.resolve(d, resolverFor({ 'observer:1': observerA, 'observer:2': observerB }));
  assert.equal(before.length, 1);
  assert.ok(Math.abs(before[0].xKm - 5) < 1e-6);
  assert.ok(Math.abs(before[0].yKm - 5) < 1e-6);

  // Move observer A north by 2 km (off its bearing ray); the intersection shifts to (4,6).
  const moved = derivation.resolve(d, resolverFor({ 'observer:1': { xKm: 2, yKm: 4 }, 'observer:2': observerB }));
  assert.equal(moved.length, 1);
  assert.ok(Math.abs(moved[0].xKm - 4) < 1e-6);
  assert.ok(Math.abs(moved[0].yKm - 6) < 1e-6);
});

test('方位+距离与双距离派生均可解析', () => {
  // A=(2,2) bearing 0 (north, x=2); B=(5,6) distance 3 → (2,6).
  const bd = derivation.crossingDerivation('bearing-distance', [
    { key: 'observer:1', bearingDeg: 0 },
    { key: 'observer:2', distanceKm: 3 }
  ]);
  const bdPoints = derivation.resolve(bd, resolverFor({ 'observer:1': observerA, 'observer:2': { xKm: 5, yKm: 6 } }));
  assert.equal(bdPoints.length, 1);
  assert.ok(Math.abs(bdPoints[0].xKm - 2) < 1e-6);
  assert.ok(Math.abs(bdPoints[0].yKm - 6) < 1e-6);

  const dd = derivation.crossingDerivation('distance-distance', [
    { key: 'observer:1', distanceKm: 5 },
    { key: 'observer:2', distanceKm: 5 }
  ]);
  const ddPoints = derivation.resolve(dd, resolverFor({ 'observer:1': observerA, 'observer:2': observerB }));
  assert.equal(ddPoints.length, 2); // two circles intersect at two points
});

test('单点方位+距离派生', () => {
  const d = derivation.crossingDerivation('bearing-distance-single', [
    { key: 'observer:1', bearingDeg: 0, distanceKm: 3 }
  ]);
  const points = derivation.resolve(d, resolverFor({ 'observer:1': observerA }));
  assert.equal(points.length, 1);
  assert.ok(Math.abs(points[0].xKm - 2) < 1e-6);
  assert.ok(Math.abs(points[0].yKm - 5) < 1e-6);
});

test('反推派生随已知点移动', () => {
  const d = derivation.reverseDerivation('target:7', 90, 4);
  assert.deepEqual(derivation.dependentKeys(d), ['target:7']);
  const points = derivation.resolve(d, resolverFor({ 'target:7': { xKm: 10, yKm: 5 } }));
  // Reversed bearing = 90+180 = 270 (west). Point moves west by 4 km.
  assert.equal(points.length, 1);
  assert.ok(Math.abs(points[0].xKm - 6) < 1e-6);
  assert.ok(Math.abs(points[0].yKm - 5) < 1e-6);
});

test('缺少源点时 resolve 返回 null（不刷新）', () => {
  const d = derivation.crossingDerivation('bearing-bearing', [
    { key: 'observer:1', bearingDeg: 45 },
    { key: 'observer:2', bearingDeg: 315 }
  ]);
  assert.equal(derivation.resolve(d, resolverFor({ 'observer:1': observerA })), null);
});

test('第三源校验过滤派生点', () => {
  const d = derivation.crossingDerivation('bearing-bearing', [
    { key: 'observer:1', bearingDeg: 45 },
    { key: 'observer:2', bearingDeg: 315 }
  ], { key: 'observer:3', measure: 0, measureType: 'bearing' });
  // observer:3 at (5,0): bearing to (5,5) is 0°, passes.
  const passes = derivation.resolve(d, resolverFor({ 'observer:1': observerA, 'observer:2': observerB, 'observer:3': { xKm: 5, yKm: 0 } }));
  assert.equal(passes.length, 1);
  // observer:3 at (0,5): bearing to (5,5) is 90°, fails the 0°±0.15 filter.
  const filtered = derivation.resolve(d, resolverFor({ 'observer:1': observerA, 'observer:2': observerB, 'observer:3': { xKm: 0, yKm: 5 } }));
  assert.equal(filtered.length, 0);
});

test('无效 derivation 规范化返回 null', () => {
  assert.equal(derivation.normalizeDerivation(null), null);
  assert.equal(derivation.normalizeDerivation({ kind: 'crossing', method: 'bad' }), null);
  assert.equal(derivation.normalizeDerivation({ kind: 'reverse', sourceKey: 'x', bearingDeg: 0, distanceKm: -1 }), null);
});
