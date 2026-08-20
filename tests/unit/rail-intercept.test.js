const test = require('node:test');
const assert = require('node:assert/strict');
const railIntercept = require('../../src/shared/rail-intercept.js');

const route = {
  station: { name: '总站', xKm: 10, yKm: 5 },
  bearingDeg: 90,
  arrivalTime: '10:10:00',
  waypoints: [
    { label: '路径点-A', distanceKm: 6, time: '10:06:00' },
    { label: '路径点-B', distanceKm: 4, time: '10:07:20' },
    { label: '路径点-C', distanceKm: 2, time: '10:08:40' }
  ]
};

test('列车在首路径点前按时刻表均速反向外推', () => {
  const position = railIntercept.positionAtMissionTime(route, 10 * 3600 + 5 * 60);
  assert.equal(position.speedKmPerSec, 0.025);
  assert.equal(position.distanceFromStationKm, 7.5);
  assert.ok(Math.abs(position.xKm - 17.5) < 1e-9);
  assert.ok(Math.abs(position.yKm - 5) < 1e-9);
  assert.equal(position.isBeforeFirstWaypoint, true);
  assert.equal(position.secondsBeforeFirstWaypoint, 60);
  assert.equal(railIntercept.trackAtMissionTime(route, 10 * 3600 + 5 * 60).headingDeg, 270);
});

test('列车拦截复用动态弹道并限制在到站前完成', () => {
  const result = railIntercept.recommendSingle({ route, missionTimeSec: 10 * 3600 + 5 * 60, ironNest: { xKm: 10, yKm: 5 }, currentBearing: 90 });
  assert.ok(result.shot.charge >= 1 && result.shot.charge <= 6);
  assert.ok(result.shot.impactElapsedSec <= result.track.expiresAtSec);
  assert.equal(result.track.railPosition.isBeforeFirstWaypoint, true);
});

test('双炮列车拦截支持最大开火间隔的最易执行组合', () => {
  const result = railIntercept.recommendDual({ route, missionTimeSec: 10 * 3600 + 5 * 60, ironNest: { xKm: 10, yKm: 5 }, currentBearing: 90, strategy: 'easiest' });
  assert.equal(result.launchGapSec, Math.max(...result.candidates.map(candidate => candidate.launchGapSec)));
  assert.ok(result.gunA.impactElapsedSec <= result.track.expiresAtSec);
  assert.ok(result.gunB.impactElapsedSec <= result.track.expiresAtSec);
});

test('列车拦截允许在转炮提前完成后等待计划开火，不误判为无解', () => {
  const screenshotRoute = {
    station: { name: '穆拉谷地总站', xKm: 9.05, yKm: 5.45 },
    bearingDeg: 90,
    arrivalTime: '10:16:50',
    waypoints: [
      { label: '路径点-A', distanceKm: 6, time: '10:06:50' },
      { label: '路径点-B', distanceKm: 4, time: '10:10:10' },
      { label: '路径点-C', distanceKm: 2, time: '10:13:30' }
    ]
  };
  const result = railIntercept.recommendSingle({
    route: screenshotRoute,
    missionTimeSec: 10 * 3600 + 60 + 2,
    ironNest: { xKm: 1.5, yKm: 1.5 },
    currentBearing: 35
  });
  assert.ok(result.shot.fireAtSec >= result.shot.rotationTimeSec + 80 - 0.01);
  assert.ok(result.shot.impactElapsedSec <= result.track.expiresAtSec);
});

test('列车可由车头中心换算至中段或指定车厢中心', () => {
  const composedRoute = { ...route, carriageCount: 5 };
  const middle = railIntercept.trackAtMissionTime(composedRoute, 10 * 3600 + 5 * 60, { targetMode: 'middle' });
  const fifth = railIntercept.trackAtMissionTime(composedRoute, 10 * 3600 + 5 * 60, { targetCarriageIndex: 5 });

  assert.equal(middle.targetCarriageIndex, 3);
  assert.equal(middle.carriageCount, 5);
  assert.ok(Math.abs(middle.xKm - 17.7) < 1e-9);
  assert.ok(Math.abs(fifth.xKm - 17.9) < 1e-9);
});

test('列车 AOE 覆盖按目标车厢到整列两端的最远距离判定', () => {
  const track = railIntercept.trackAtMissionTime({ ...route, carriageCount: 5 }, 10 * 3600 + 5 * 60, { targetMode: 'middle' });
  const ap = railIntercept.evaluateAoeCoverage(track, 'AP');
  const he = railIntercept.evaluateAoeCoverage(track, 'HE');

  assert.equal(ap.requiredRadiusMeters, 250);
  assert.equal(ap.fullyCoversTrain, false);
  assert.equal(he.fullyCoversTrain, true);
});

test('偶数节列车的中段落点位于两节中间，精确车厢仍可单独选择', () => {
  const composedRoute = { ...route, carriageCount: 4 };
  const middle = railIntercept.trackAtMissionTime(composedRoute, 10 * 3600 + 5 * 60, { targetMode: 'middle' });
  const carriage = railIntercept.trackAtMissionTime(composedRoute, 10 * 3600 + 5 * 60, { targetCarriageIndex: 3 });

  assert.equal(middle.targetCarriageIndex, null);
  assert.equal(middle.targetLabel, '中段（第2/3节之间）');
  assert.ok(Math.abs(middle.xKm - 17.65) < 1e-9);
  assert.equal(carriage.targetLabel, '第3节');
  assert.ok(Math.abs(carriage.xKm - 17.7) < 1e-9);
});
