(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ballistics.js') : root.IronNestBallistics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestFirePlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ballistics) {
  'use strict';

  const MAX_PLAN_ITEMS = 6;
  const SHELL_TYPES = Object.freeze(['LE', 'HE', 'HCHE', 'PCLM', 'CLMN', 'AP', 'APHE', 'EQKE', 'STAR', 'SMK', 'DRIL', 'PRPG', 'FLCH', 'INCN', 'THRM', 'WP', 'TEAR', 'CYAN', 'PHGN', 'ATMC']);
  const SHELL_AOE_RADIUS_M = Object.freeze({
    DRIL: 70, AP: 150, LE: 150, PCLM: 150, APHE: 250, HE: 250, INCN: 250,
    THRM: 350, CLMN: 500, PRPG: 500, STAR: 500, EQKE: 550, HCHE: 550,
    FLCH: 620, PHGN: 620, CYAN: 750, TEAR: 750, WP: 750, SMK: 1000, ATMC: 3000
  });
  const COMMON_SHELL_GROUPS = Object.freeze({
    nonArmor: Object.freeze(['DRIL', 'LE', 'HE', 'HCHE']),
    armor: Object.freeze(['AP', 'APHE'])
  });

  function shellAoeRadiusMeters(shellType) {
    const radius = SHELL_AOE_RADIUS_M[shellType];
    if (!Number.isFinite(radius)) throw new RangeError('弹种无效');
    return radius;
  }

  function recommendShellForError(shellTypes, errorMeters) {
    const available = shellTypes.map(shellType => ({ shellType, radiusMeters: shellAoeRadiusMeters(shellType) }));
    const recommendation = available
      .filter(candidate => candidate.radiusMeters >= errorMeters)
      .sort((left, right) => left.radiusMeters - right.radiusMeters || shellTypes.indexOf(left.shellType) - shellTypes.indexOf(right.shellType))[0];
    if (recommendation) return Object.freeze({ ...recommendation, status: 'covered' });
    const maximum = available.reduce((selected, candidate) => candidate.radiusMeters > selected.radiusMeters ? candidate : selected);
    return Object.freeze({ ...maximum, status: 'out-of-range' });
  }

  function recommendCommonShellsForError(errorKm) {
    const km = Number(errorKm);
    if (!Number.isFinite(km) || km < 0) throw new RangeError('定位误差无效');
    const errorMeters = Math.ceil(km * 1000);
    return Object.freeze({
      errorMeters,
      nonArmor: recommendShellForError(COMMON_SHELL_GROUPS.nonArmor, errorMeters),
      armor: recommendShellForError(COMMON_SHELL_GROUPS.armor, errorMeters)
    });
  }

  function createPlanItem({ id, targetLabel, bearingDeg, distanceKm, charge, shellType }) {
    const normalizedCharge = Number(charge);
    if (!Number.isInteger(normalizedCharge) || normalizedCharge < 1 || normalizedCharge > 6) throw new RangeError('药号必须是 1–6');
    if (!SHELL_TYPES.includes(shellType)) throw new RangeError('弹种无效');
    const result = ballistics.calculateSolutions(distanceKm);
    const trajectory = result.solutions.find(solution => solution.charges === normalizedCharge);
    if (!trajectory) throw new RangeError('该药号在当前距离下超过 60° 仰角上限');
    return Object.freeze({
      id: String(id),
      targetLabel: String(targetLabel || '未命名目标'),
      bearingDeg: Number(bearingDeg.toFixed(1)),
      distanceKm: Number(distanceKm.toFixed(2)),
      charge: normalizedCharge,
      elevationDeg: trajectory.elevationDeg,
      flightTimeSec: trajectory.flightTimeSec,
      shellType
    });
  }

  function normalizePlan(items) {
    return Array.isArray(items) ? items.slice(0, MAX_PLAN_ITEMS).filter(item => item && Number.isInteger(item.charge) && item.charge >= 1 && item.charge <= 6 && SHELL_TYPES.includes(item.shellType)) : [];
  }

  return Object.freeze({ MAX_PLAN_ITEMS, SHELL_TYPES, SHELL_AOE_RADIUS_M, COMMON_SHELL_GROUPS, shellAoeRadiusMeters, recommendCommonShellsForError, createPlanItem, normalizePlan });
});
