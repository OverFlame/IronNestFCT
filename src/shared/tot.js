(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ballistics.js') : root.IronNestBallistics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestTot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ballistics) {
  'use strict';

  const SLOW_TURN_LIMIT_DEG = 10;
  const SLOW_TURN_RATE_DEG_PER_SEC = 2;
  const FAST_TURN_RATE_DEG_PER_SEC = 4;
  const SLOW_TURN_BUFFER_SEC = 7;
  const FAST_TURN_BUFFER_SEC = 10;
  const EPSILON = 1e-9;

  function normalizeBearing(value) {
    const bearing = Number(value);
    if (!Number.isFinite(bearing)) throw new RangeError('当前方位角必须是有效数字');
    return ((bearing % 360) + 360) % 360;
  }

  function shortestTurnDeg(fromBearing, toBearing) {
    const difference = Math.abs(normalizeBearing(toBearing) - normalizeBearing(fromBearing));
    return Math.min(difference, 360 - difference);
  }

  // The first ten degrees use the slower rate. Beyond that point, only the
  // remaining angle uses the maximum rate, avoiding a discontinuity at 10°.
  function turnProfile(currentBearing, targetBearing) {
    const turnDeg = shortestTurnDeg(currentBearing, targetBearing);
    const slowTurn = turnDeg <= SLOW_TURN_LIMIT_DEG + EPSILON;
    const rotationTimeSec = slowTurn
      ? turnDeg / SLOW_TURN_RATE_DEG_PER_SEC
      : SLOW_TURN_LIMIT_DEG / SLOW_TURN_RATE_DEG_PER_SEC + (turnDeg - SLOW_TURN_LIMIT_DEG) / FAST_TURN_RATE_DEG_PER_SEC;
    const bufferSec = slowTurn ? SLOW_TURN_BUFFER_SEC : FAST_TURN_BUFFER_SEC;
    return Object.freeze({ turnDeg, rotationTimeSec, bufferSec, readyTimeSec: rotationTimeSec + bufferSec });
  }

  function trajectoryOptions(distanceKm) {
    return ballistics.calculateSolutions(distanceKm).solutions.map(solution => Object.freeze({
      charge: solution.charges,
      elevationDeg: solution.elevationDeg,
      flightTimeSec: solution.flightTimeSec
    }));
  }

  function compareCandidates(strategy) {
    return (left, right) => {
      const first = strategy === 'shortest-launch-gap'
        ? [left.launchGapSec, left.impactAtSec, left.flightTimeTotalSec, left.left.charge + left.right.charge]
        : strategy === 'easiest'
          ? [-left.launchGapSec, left.impactAtSec, left.flightTimeTotalSec, left.left.charge + left.right.charge]
          : [left.impactAtSec, left.launchGapSec, left.flightTimeTotalSec, left.left.charge + left.right.charge];
      const second = strategy === 'shortest-launch-gap'
        ? [right.launchGapSec, right.impactAtSec, right.flightTimeTotalSec, right.left.charge + right.right.charge]
        : strategy === 'easiest'
          ? [-right.launchGapSec, right.impactAtSec, right.flightTimeTotalSec, right.left.charge + right.right.charge]
          : [right.impactAtSec, right.launchGapSec, right.flightTimeTotalSec, right.left.charge + right.right.charge];
      for (let index = 0; index < first.length; index += 1) {
        if (Math.abs(first[index] - second[index]) > EPSILON) return first[index] - second[index];
      }
      return 0;
    };
  }

  function recommendTot({ currentBearing, left, right, strategy = 'fastest' }) {
    if (!left || !right) throw new RangeError('左右炮均需提供目标方位角和距离');
    if (!['fastest', 'shortest-launch-gap', 'easiest'].includes(strategy)) throw new RangeError('TOT 推荐策略无效');
    const bearing = normalizeBearing(currentBearing);
    const leftBearing = normalizeBearing(left.bearingDeg);
    const rightBearing = normalizeBearing(right.bearingDeg);
    const leftInitialProfile = turnProfile(bearing, leftBearing);
    const rightInitialProfile = turnProfile(bearing, rightBearing);
    const leftToRightProfile = turnProfile(leftBearing, rightBearing);
    const rightToLeftProfile = turnProfile(rightBearing, leftBearing);
    const leftOptions = trajectoryOptions(left.distanceKm);
    const rightOptions = trajectoryOptions(right.distanceKm);
    if (!leftOptions.length || !rightOptions.length) throw new RangeError('至少一侧目标没有不超过 60° 的装药方案');

    const candidates = [];
    for (const leftTrajectory of leftOptions) {
      for (const rightTrajectory of rightOptions) {
        const leftFirst = leftTrajectory.flightTimeSec > rightTrajectory.flightTimeSec + EPSILON;
        const rightFirst = rightTrajectory.flightTimeSec > leftTrajectory.flightTimeSec + EPSILON;
        const simultaneous = !leftFirst && !rightFirst;
        if (simultaneous && leftToRightProfile.turnDeg > EPSILON) continue;

        const firstTrajectory = leftFirst ? leftTrajectory : rightTrajectory;
        const secondTrajectory = leftFirst ? rightTrajectory : leftTrajectory;
        const firstProfile = leftFirst ? leftInitialProfile : rightInitialProfile;
        const secondProfile = leftFirst ? leftToRightProfile : rightToLeftProfile;
        const launchGapSec = simultaneous ? 0 : firstTrajectory.flightTimeSec - secondTrajectory.flightTimeSec;
        if (!simultaneous && launchGapSec + EPSILON < secondProfile.readyTimeSec) continue;

        const firstFireAtSec = firstProfile.readyTimeSec;
        const secondFireAtSec = firstFireAtSec + launchGapSec;
        const leftFireAtSec = leftFirst || simultaneous ? firstFireAtSec : secondFireAtSec;
        const rightFireAtSec = rightFirst ? firstFireAtSec : secondFireAtSec;
        const impactAtSec = firstFireAtSec + firstTrajectory.flightTimeSec;
        const firstGunId = leftFirst ? 'gun-a' : rightFirst ? 'gun-b' : 'both';
        const laterFlightTimeSec = leftFirst ? rightTrajectory.flightTimeSec : rightFirst ? leftTrajectory.flightTimeSec : null;
        const leftProfile = leftFirst || simultaneous ? leftInitialProfile : leftToRightProfile;
        const rightProfile = rightFirst ? rightInitialProfile : rightToLeftProfile;
        candidates.push({
          currentBearing: bearing,
          strategy,
          impactAtSec,
          launchGapSec,
          flightTimeTotalSec: leftTrajectory.flightTimeSec + rightTrajectory.flightTimeSec,
          firstGunId,
          laterFlightTimeSec,
          left: { ...leftTrajectory, bearingDeg: leftBearing, distanceKm: Number(left.distanceKm), fireAtSec: leftFireAtSec, turnStartsAtSec: leftFirst || simultaneous ? 0 : firstFireAtSec, ...leftProfile },
          right: { ...rightTrajectory, bearingDeg: rightBearing, distanceKm: Number(right.distanceKm), fireAtSec: rightFireAtSec, turnStartsAtSec: rightFirst ? 0 : firstFireAtSec, ...rightProfile }
        });
      }
    }
    candidates.sort(compareCandidates(strategy));
    return Object.freeze({ ...candidates[0], candidates: Object.freeze(candidates) });
  }

  return Object.freeze({
    SLOW_TURN_LIMIT_DEG,
    SLOW_TURN_RATE_DEG_PER_SEC,
    FAST_TURN_RATE_DEG_PER_SEC,
    SLOW_TURN_BUFFER_SEC,
    FAST_TURN_BUFFER_SEC,
    normalizeBearing,
    shortestTurnDeg,
    turnProfile,
    trajectoryOptions,
    recommendTot
  });
});
