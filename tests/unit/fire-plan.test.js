const test = require('node:test');
const assert = require('node:assert/strict');
const firePlan = require('../../src/shared/fire-plan.js');

test('射击计划按指定药号写入方位、仰角与飞行时间', () => {
  const item = firePlan.createPlanItem({ id: 1, targetLabel: '步兵#1', bearingDeg: 36.94, distanceKm: 5, charge: 3, shellType: 'HE' });
  assert.deepEqual(item, { id: '1', targetLabel: '步兵#1', bearingDeg: 36.9, distanceKm: 5, charge: 3, elevationDeg: 20, flightTimeSec: 13, shellType: 'HE' });
});

test('射击计划拒绝无效药号、超仰角方案并限制为六项', () => {
  assert.throws(() => firePlan.createPlanItem({ id: 1, targetLabel: '目标', bearingDeg: 0, distanceKm: 20, charge: 1, shellType: 'HE' }), /超过 60/);
  assert.equal(firePlan.normalizePlan(Array.from({ length: 8 }, (_, index) => ({ id: index, charge: 1, shellType: 'HE' }))).length, 6);
});

test('全部弹种均有已确认的 AOE 半径', () => {
  assert.deepEqual(firePlan.SHELL_AOE_RADIUS_M, {
    DRIL: 70, AP: 150, LE: 150, PCLM: 150, APHE: 250, HE: 250, INCN: 250,
    THRM: 350, CLMN: 500, PRPG: 500, STAR: 500, EQKE: 550, HCHE: 550,
    FLCH: 620, PHGN: 620, CYAN: 750, TEAR: 750, WP: 750, SMK: 1000, ATMC: 3000
  });
  assert.equal(firePlan.shellAoeRadiusMeters('ATMC'), 3000);
  assert.throws(() => firePlan.shellAoeRadiusMeters('UNKNOWN'), /弹种无效/);
});

test('按定位误差为常用非穿甲与穿甲弹分别推荐最小可覆盖半径', () => {
  const recommended = firePlan.recommendCommonShellsForError(0.16);
  assert.deepEqual(recommended, {
    errorMeters: 160,
    nonArmor: { shellType: 'HE', radiusMeters: 250, status: 'covered' },
    armor: { shellType: 'APHE', radiusMeters: 250, status: 'covered' }
  });
});

test('定位误差超过常用弹种杀伤半径时明确标记为超出范围', () => {
  const recommended = firePlan.recommendCommonShellsForError(0.56);
  assert.equal(recommended.nonArmor.status, 'out-of-range');
  assert.equal(recommended.nonArmor.radiusMeters, 550);
  assert.equal(recommended.armor.status, 'out-of-range');
  assert.equal(recommended.armor.radiusMeters, 250);
});
