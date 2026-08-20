const test = require('node:test');
const assert = require('node:assert/strict');
const grid = require('../../src/shared/grid-coordinate.js');
const solver = require('../../src/shared/briefing-solver.js');

const observers = {
  one: grid.gridToWorld('Q3 1:1'),
  two: grid.gridToWorld('O9 2:1'),
  three: grid.gridToWorld('O6 9:6')
};

function report(source, values) {
  return { source, ...values };
}

test('简报组合解算会选择距离加数值方位角，并由方位词扇区验证', () => {
  const result = solver.solve([
    report(observers.two, { distanceKm: 7.68 }),
    report(observers.three, { bearingDeg: 269 }),
    report(observers.one, { bearingDeg: 292.5, bearingToleranceDeg: 11.25 })
  ]);
  assert.ok(result.candidates.some(candidate =>
    Math.abs(candidate.point.xKm - 7.037) < 0.01
    && Math.abs(candidate.point.yKm - 5.512) < 0.01
    && candidate.basisReports.includes(result.reports[0])
    && candidate.basisReports.includes(result.reports[1])
  ));
});

test('简报组合解算将宽方位词扇区收敛为偏差最小的近似候选', () => {
  const result = solver.solve([
    report(observers.two, { distanceKm: 9.18 }),
    report(observers.three, { bearingDeg: 247.5, bearingToleranceDeg: 11.25 }),
    report(observers.one, { bearingDeg: 270, bearingToleranceDeg: 22.5 })
  ]);
  assert.equal(result.candidates.length, 1);
  assert.ok(Math.abs(result.recommended.point.xKm - 7.096) < 0.01);
  assert.ok(Math.abs(result.recommended.point.yKm - 2.397) < 0.01);
  assert.ok(result.recommended.basisReports.includes(result.reports[0]));
  assert.ok(result.recommended.basisReports.includes(result.reports[1]));
});

test('链式简报会保留多来源分支，直至后续观测收敛', () => {
  const observerOne = grid.gridToWorld('G10 0:3');
  const observerTwo = grid.gridToWorld('F3 7:9');
  const observerThree = grid.gridToWorld('P1 6:4');
  const alpha = solver.solve([
    report(observerOne, { bearingDeg: 125 }),
    report(observerTwo, { distanceKm: 5.72 })
  ]).candidates.map(candidate => candidate.point);
  const batteryOne = solver.solve([
    { sources: alpha, bearingDeg: 93 },
    report(observerThree, { bearingDeg: 4 })
  ]).candidates.map(candidate => candidate.point);
  const bravo = solver.solve([
    { sources: batteryOne, bearingDeg: 270 },
    report(observerTwo, { distanceKm: 7.47 })
  ]).candidates.map(candidate => candidate.point);
  const batteryThree = solver.solve([
    { sources: bravo, bearingDeg: 29 },
    report(observerThree, { bearingDeg: 342 })
  ]);

  assert.ok(batteryThree.candidates.some(candidate =>
    Math.abs(candidate.point.xKm - 13.363) < 0.01 && Math.abs(candidate.point.yKm - 7.488) < 0.01
  ));
});

test('小夹角整数方位交会超过 AP 150 米精度阈值', () => {
  const result = solver.solve([
    report(grid.gridToWorld('T2 8:3'), { bearingDeg: 323 }),
    report(grid.gridToWorld('J3 4:0'), { distanceKm: 7.99 })
  ]);
  assert.equal(result.candidates.length, 2);
  assert.ok(result.candidates.every(candidate => candidate.positionErrorKm > solver.PRECISION_WARNING_THRESHOLD_KM));
});

test('上游定位误差会传递到链式解算', () => {
  const alpha = solver.solve([
    report(grid.gridToWorld('T2 8:3'), { bearingDeg: 323 }),
    report(grid.gridToWorld('J3 4:0'), { distanceKm: 7.99 })
  ]).candidates[0];
  const fdc = solver.solve([
    report({ ...alpha.point, positionErrorKm: alpha.positionErrorKm }, { bearingDeg: 285 }),
    report(grid.gridToWorld('T3 1:5'), { bearingDeg: 305 })
  ]).recommended;
  assert.ok(fdc.positionErrorKm > alpha.positionErrorKm);
  assert.ok(fdc.positionErrorKm > solver.PRECISION_WARNING_THRESHOLD_KM);
});

test('近距离大夹角交会不误报精度不足', () => {
  const result = solver.solve([
    report({ xKm: 1, yKm: 1 }, { bearingDeg: 45 }),
    report({ xKm: 2, yKm: 1 }, { bearingDeg: 315 })
  ]);
  assert.ok(result.recommended.positionErrorKm < solver.PRECISION_WARNING_THRESHOLD_KM);
});

test('距离与双同向方位词可在扇区重叠范围内得到地图内近似解', () => {
  const result = solver.solve([
    report(grid.gridToWorld('Q3 1:5'), { distanceKm: 15.97 }),
    report(grid.gridToWorld('Q3 2:4'), { bearingDeg: 292.5, bearingToleranceDeg: 11.25 }),
    report(grid.gridToWorld('O7 7:7'), { bearingDeg: 292.5, bearingToleranceDeg: 11.25 })
  ]);

  assert.ok(result.recommended);
  assert.ok(result.recommended.point.xKm > 1.6 && result.recommended.point.xKm < 2.2);
  assert.ok(result.recommended.point.yKm > 9.2 && result.recommended.point.yKm < 10);
});

test('已知目标坐标可反转方位与距离推回未知观测源', () => {
  const reversed = solver.reverseReport({ bearingDeg: 275, distanceKm: 10.59 }, grid.gridToWorld('B9 3:4'));
  const result = solver.solve([reversed]);
  assert.equal(reversed.bearingDeg, 95);
  assert.equal(grid.worldToGrid(result.recommended.point.xKm, result.recommended.point.yKm).coordinate, 'L8 8:5');
  assert.ok(result.recommended.positionErrorKm < solver.PRECISION_WARNING_THRESHOLD_KM);
});
