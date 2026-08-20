const test = require('node:test');
const assert = require('node:assert/strict');
const masterPlan = require('../../src/shared/master-fire-plan.js');

function permutations(items) {
  if (items.length < 2) return [items];
  return items.flatMap((item, index) => permutations(items.filter((_, candidate) => candidate !== index)).map(rest => [item, ...rest]));
}

test('方位角排序寻找从当前炮向开始的最小总旋转路径', () => {
  const plans = [
    { id: 'a', bearingDeg: 330 },
    { id: 'b', bearingDeg: 12 },
    { id: 'c', bearingDeg: 70 },
    { id: 'd', bearingDeg: 190 }
  ];
  const sorted = masterPlan.sortByMinimumRotation(plans, 0);
  const expected = Math.min(...permutations(plans).map(order => masterPlan.totalRotation(0, order)));
  assert.equal(masterPlan.totalRotation(0, sorted), expected);
  assert.equal(masterPlan.angularDistance(350, 10), 20);
});

test('方位角排序将同一 TOT 任务保留为连续的不可拆分计划组', () => {
  const plans = [
    { id: 'tot-left', totMissionId: 1, bearingDeg: 170 },
    { id: 'tot-right', totMissionId: 1, bearingDeg: 180 },
    { id: 'east', bearingDeg: 200 },
    { id: 'north', bearingDeg: 30 }
  ];
  assert.deepEqual(masterPlan.sortByMinimumRotation(plans, 0).map(item => item.id), ['north', 'tot-left', 'tot-right', 'east']);
});

test('方位角排序让动态拦截任务优先于普通射击计划且保持任务连续', () => {
  const plans = [
    { id: 'north', bearingDeg: 10 },
    { id: 'intercept-left', interceptMissionId: 4, bearingDeg: 210 },
    { id: 'intercept-right', interceptMissionId: 4, bearingDeg: 220 },
    { id: 'east', bearingDeg: 90 }
  ];
  assert.deepEqual(masterPlan.sortByMinimumRotation(plans, 0).map(item => item.id), ['intercept-left', 'intercept-right', 'east', 'north']);
});

test('射击顺序保持计划顺序并从首项炮位开始交替改写标记', () => {
  const plans = [
    { id: 'l1', gunId: 'gun-a' },
    { id: 'l2', gunId: 'gun-a' },
    { id: 'r1', gunId: 'gun-b' },
    { id: 'r2', gunId: 'gun-b' },
    { id: 'l3', gunId: 'gun-a' }
  ];
  const assigned = masterPlan.assignAlternatingGuns(plans);
  assert.deepEqual(assigned.map(item => item.id), plans.map(item => item.id));
  assert.deepEqual(assigned.map(item => item.gunId), ['gun-a', 'gun-b', 'gun-a', 'gun-b', 'gun-a']);
});

test('射击顺序排序需要改变 TOT 先发炮时交换左右炮完整射击诸元', () => {
  const plans = [
    { id: 'direct-1', gunId: 'gun-a' },
    { id: 'tot-left', gunId: 'gun-a', totMissionId: 7, totFireAtSec: 0, targetLabel: '目标 A', bearingDeg: 30, charge: 2 },
    { id: 'tot-right', gunId: 'gun-b', totMissionId: 7, totFireAtSec: 3, targetLabel: '目标 B', bearingDeg: 90, charge: 5 },
    { id: 'direct-2', gunId: 'gun-a' }
  ];
  const assigned = masterPlan.assignAlternatingGuns(plans);
  assert.deepEqual(assigned.map(item => item.id), plans.map(item => item.id));
  assert.deepEqual(assigned.map(item => item.gunId), ['gun-a', 'gun-a', 'gun-b', 'gun-b']);
  assert.deepEqual(assigned.slice(1, 3).map(item => [item.targetLabel, item.bearingDeg, item.charge, item.totFireAtSec]), [
    ['目标 B', 90, 5, 3],
    ['目标 A', 30, 2, 0]
  ]);
});

test('射击顺序排序对双炮动态拦截按开火时点交换完整射击诸元', () => {
  const plans = [
    { id: 'direct-1', gunId: 'gun-a' },
    { id: 'intercept-left', gunId: 'gun-a', interceptMissionId: 8, interceptFireAtSec: 0, targetLabel: '目标 A', bearingDeg: 30, charge: 2 },
    { id: 'intercept-right', gunId: 'gun-b', interceptMissionId: 8, interceptFireAtSec: 5, targetLabel: '目标 B', bearingDeg: 90, charge: 5 },
    { id: 'direct-2', gunId: 'gun-a' }
  ];
  const assigned = masterPlan.assignAlternatingGuns(plans);
  assert.deepEqual(assigned.map(item => item.gunId), ['gun-a', 'gun-a', 'gun-b', 'gun-b']);
  assert.deepEqual(assigned.slice(1, 3).map(item => [item.targetLabel, item.bearingDeg, item.charge, item.interceptFireAtSec]), [
    ['目标 B', 90, 5, 5],
    ['目标 A', 30, 2, 0]
  ]);
});

test('总计划按 TOT 的实际 T+ 开火时刻保持先后顺序', () => {
  const plans = masterPlan.orderByFireTime([
    { id: 'left', gunId: 'gun-a', totFireAtSec: 3 },
    { id: 'right', gunId: 'gun-b', totFireAtSec: 0 }
  ]);
  assert.deepEqual(plans.map(item => item.id), ['right', 'left']);
});

test('总射击计划只接受带有左右炮标识的有效项并限制为十二项', () => {
  const plans = Array.from({ length: 14 }, (_, index) => ({ id: String(index), gunId: 'gun-a', bearingDeg: 10, elevationDeg: 20, charge: 3 }));
  assert.equal(masterPlan.normalizePlan(plans).length, 12);
  assert.equal(masterPlan.normalizePlan([{ gunId: 'other', bearingDeg: 1, elevationDeg: 1, charge: 1 }]).length, 0);
});
