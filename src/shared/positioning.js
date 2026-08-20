(function exposePositioning(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestPositioning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPositioningApi() {
  'use strict';

  const EPSILON = 1e-9;
  const clean = value => {
    const rounded = Number(value.toFixed(10));
    return Object.is(rounded, -0) ? 0 : rounded;
  };

  function assertPoint(point, label) {
    if (!point || !Number.isFinite(point.xKm) || !Number.isFinite(point.yKm)) {
      throw new TypeError(`${label}必须包含有效的 xKm 和 yKm`);
    }
  }

  function normalizeBearing(value) {
    const bearing = Number(value);
    if (!Number.isFinite(bearing)) throw new TypeError('方位角必须是有效数字');
    return ((bearing % 360) + 360) % 360;
  }

  function bisectBearings(firstBearingDeg, secondBearingDeg) {
    const first = normalizeBearing(firstBearingDeg);
    const second = normalizeBearing(secondBearingDeg);
    const shortArcDeg = ((second - first + 540) % 360) - 180;
    if (Math.abs(Math.abs(shortArcDeg) - 180) < EPSILON) {
      throw new RangeError('相反的两条半箭头没有唯一的夹角中线');
    }
    return clean(normalizeBearing(first + shortArcDeg / 2));
  }

  function assertDistance(value) {
    const distance = Number(value);
    if (!Number.isFinite(distance) || distance <= 0) throw new RangeError('距离必须大于 0 km');
    return distance;
  }

  function directionFromBearing(bearingDeg) {
    const radians = normalizeBearing(bearingDeg) * Math.PI / 180;
    return { x: Math.sin(radians), y: Math.cos(radians) };
  }

  function cross(a, b) { return a.x * b.y - a.y * b.x; }

  function pointOnRay(origin, direction, distance) {
    return {
      xKm: clean(origin.xKm + direction.x * distance),
      yKm: clean(origin.yKm + direction.y * distance)
    };
  }

  function pointFromBearingDistance(origin, bearingDeg, distanceKm) {
    assertPoint(origin, '观测点');
    const distance = assertDistance(distanceKm);
    return pointOnRay(origin, directionFromBearing(bearingDeg), distance);
  }

  function intersectBearings(observerA, bearingA, observerB, bearingB) {
    assertPoint(observerA, '观测员 A');
    assertPoint(observerB, '观测员 B');
    const directionA = directionFromBearing(bearingA);
    const directionB = directionFromBearing(bearingB);
    const denominator = cross(directionA, directionB);
    if (Math.abs(denominator) < EPSILON) return [];
    const delta = { x: observerB.xKm - observerA.xKm, y: observerB.yKm - observerA.yKm };
    const distanceA = cross(delta, directionB) / denominator;
    const distanceB = cross(delta, directionA) / denominator;
    if (distanceA < -EPSILON || distanceB < -EPSILON) return [];
    return [pointOnRay(observerA, directionA, Math.max(0, distanceA))];
  }

  function intersectBearingDistance(bearingObserver, bearingDeg, distanceObserver, radiusKm) {
    assertPoint(bearingObserver, '方位观测员');
    assertPoint(distanceObserver, '测距观测员');
    const radius = assertDistance(radiusKm);
    const direction = directionFromBearing(bearingDeg);
    const offset = {
      x: bearingObserver.xKm - distanceObserver.xKm,
      y: bearingObserver.yKm - distanceObserver.yKm
    };
    const projection = offset.x * direction.x + offset.y * direction.y;
    const constant = offset.x ** 2 + offset.y ** 2 - radius ** 2;
    const discriminant = projection ** 2 - constant;
    if (discriminant < -EPSILON) return [];
    const root = Math.sqrt(Math.max(0, discriminant));
    const candidates = [-projection - root, -projection + root]
      .filter(distance => distance >= -EPSILON)
      .map(distance => pointOnRay(bearingObserver, direction, Math.max(0, distance)));
    return deduplicatePoints(candidates);
  }

  function intersectDistances(observerA, radiusA, observerB, radiusB) {
    assertPoint(observerA, '观测员 A');
    assertPoint(observerB, '观测员 B');
    const firstRadius = assertDistance(radiusA);
    const secondRadius = assertDistance(radiusB);
    const dx = observerB.xKm - observerA.xKm;
    const dy = observerB.yKm - observerA.yKm;
    const centerDistance = Math.hypot(dx, dy);
    if (centerDistance < EPSILON) return [];
    if (centerDistance > firstRadius + secondRadius + EPSILON) return [];
    if (centerDistance < Math.abs(firstRadius - secondRadius) - EPSILON) return [];

    const along = (firstRadius ** 2 - secondRadius ** 2 + centerDistance ** 2) / (2 * centerDistance);
    const heightSquared = firstRadius ** 2 - along ** 2;
    if (heightSquared < -EPSILON) return [];
    const height = Math.sqrt(heightSquared <= EPSILON ? 0 : heightSquared);
    const baseX = observerA.xKm + along * dx / centerDistance;
    const baseY = observerA.yKm + along * dy / centerDistance;
    const perpendicularX = -dy / centerDistance;
    const perpendicularY = dx / centerDistance;
    return deduplicatePoints([
      { xKm: clean(baseX + height * perpendicularX), yKm: clean(baseY + height * perpendicularY) },
      { xKm: clean(baseX - height * perpendicularX), yKm: clean(baseY - height * perpendicularY) }
    ]);
  }

  function deduplicatePoints(points) {
    return points.filter((point, index) => points.findIndex(candidate => (
      Math.abs(candidate.xKm - point.xKm) < EPSILON &&
      Math.abs(candidate.yKm - point.yKm) < EPSILON
    )) === index);
  }

  function distanceBetween(first, second) {
    assertPoint(first, '起点');
    assertPoint(second, '终点');
    return Math.hypot(second.xKm - first.xKm, second.yKm - first.yKm);
  }

  function bearingBetween(first, second) {
    assertPoint(first, '起点');
    assertPoint(second, '终点');
    const dx = second.xKm - first.xKm;
    const dy = second.yKm - first.yKm;
    if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return 0;
    return normalizeBearing(Math.atan2(dx, dy) * 180 / Math.PI);
  }

  function isPointInsideBounds(point, widthKm = 20, heightKm = 10) {
    assertPoint(point, '目标点');
    if (!Number.isFinite(widthKm) || !Number.isFinite(heightKm) || widthKm <= 0 || heightKm <= 0) {
      throw new RangeError('地图宽高必须大于 0 km');
    }
    return point.xKm >= 0 && point.xKm < widthKm && point.yKm >= 0 && point.yKm < heightKm;
  }

  function filterPointsToBounds(points, widthKm = 20, heightKm = 10) {
    if (!Array.isArray(points)) throw new TypeError('交会点必须是数组');
    return points.filter(point => isPointInsideBounds(point, widthKm, heightKm));
  }

  function calculateFireSolution(ironNest, target) {
    assertPoint(ironNest, '铁巢位置');
    assertPoint(target, '目标位置');
    return {
      bearingDeg: clean(bearingBetween(ironNest, target)),
      distanceKm: clean(distanceBetween(ironNest, target))
    };
  }

  return Object.freeze({
    normalizeBearing,
    bisectBearings,
    directionFromBearing,
    pointFromBearingDistance,
    intersectBearings,
    intersectBearingDistance,
    intersectDistances,
    distanceBetween,
    bearingBetween,
    isPointInsideBounds,
    filterPointsToBounds,
    calculateFireSolution
  });
});
