(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ballistics.js') : root.IronNestBallistics, typeof require === 'function' ? require('./positioning.js') : root.IronNestPositioning, typeof require === 'function' ? require('./tot.js') : root.IronNestTot);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestMovingIntercept = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ballistics, positioning, tot) {
  'use strict';

  const DEFAULT_BUFFER_SEC = 80;
  const SECOND_SHOT_BUFFER_SEC = 20;
  const MAX_FLIGHT_TIME_SEC = 150;
  const EPSILON = 0.01;
  const RECOMMENDATION_STRATEGIES = Object.freeze(['fastest', 'lowest-charge', 'easiest']);

  function number(value, label, minimum = -Infinity) {
    const result = Number(value);
    if (!Number.isFinite(result) || result < minimum) throw new RangeError(`${label}无效`);
    return result;
  }

  function assertTrack(track) {
    if (!track || !Number.isFinite(track.xKm) || !Number.isFinite(track.yKm)) throw new TypeError('动目标缺少有效坐标');
    return {
      ...track,
      headingDeg: positioning.normalizeBearing(track.headingDeg),
      speedKmPerSec: number(track.speedKmPerSec, '动目标速度', Number.EPSILON)
    };
  }

  function pointAt(track, elapsedSec) {
    const normalized = assertTrack(track);
    const elapsed = number(elapsedSec, '目标经过时间', 0);
    return positioning.pointOnRay
      ? positioning.pointOnRay(normalized, positioning.directionFromBearing(normalized.headingDeg), normalized.speedKmPerSec * elapsed)
      : { xKm: normalized.xKm + positioning.directionFromBearing(normalized.headingDeg).x * normalized.speedKmPerSec * elapsed, yKm: normalized.yKm + positioning.directionFromBearing(normalized.headingDeg).y * normalized.speedKmPerSec * elapsed };
  }

  function targetStillAvailable(track, elapsedSec) {
    return track.expiresAtSec == null || elapsedSec <= Number(track.expiresAtSec) + EPSILON;
  }

  function solveTrajectory({ ironNest, track, elapsedSec, fireAtSec, charge }) {
    const target = assertTrack(track);
    const elapsed = number(elapsedSec, '报告后经过时间', 0);
    const fireAt = number(fireAtSec, '开火时点', 0);
    const requestedCharge = Number(charge);
    for (let flightTimeSec = 1; flightTimeSec <= MAX_FLIGHT_TIME_SEC; flightTimeSec += 1) {
      const impactElapsedSec = elapsed + fireAt + flightTimeSec;
      if (!targetStillAvailable(target, impactElapsedSec)) return null;
      const impactPoint = pointAt(target, impactElapsedSec);
      if (!positioning.isPointInsideBounds(impactPoint)) continue;
      const fire = positioning.calculateFireSolution(ironNest, impactPoint);
      const trajectory = ballistics.calculateSolutions(fire.distanceKm).solutions.find(item => item.charges === requestedCharge);
      if (trajectory?.flightTimeSec === flightTimeSec) return { ...fire, ...trajectory, charge: requestedCharge, impactPoint, impactElapsedSec };
    }
    return null;
  }

  function scheduleShot({ ironNest, track, elapsedSec, startAtSec = 0, startBearingDeg, charge, bufferSec = DEFAULT_BUFFER_SEC }) {
    const startAt = number(startAtSec, '起转时点', 0);
    const buffer = number(bufferSec, '缓冲时间', 0);
    let fireAtSec = startAt;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const trajectory = solveTrajectory({ ironNest, track, elapsedSec, fireAtSec, charge });
      if (!trajectory) return null;
      const turn = tot.turnProfile(startBearingDeg, trajectory.bearingDeg);
      const readyAtSec = startAt + turn.rotationTimeSec + buffer;
      if (readyAtSec <= fireAtSec + EPSILON) return { ...trajectory, fireAtSec, turnStartsAtSec: startAt, ...turn, bufferSec: buffer };
      fireAtSec = readyAtSec;
    }
    return null;
  }

  function compareSingleCandidates(strategy) {
    return strategy === 'lowest-charge'
      ? (left, right) => left.charge - right.charge || left.impactElapsedSec - right.impactElapsedSec || left.fireAtSec - right.fireAtSec
      : (left, right) => left.impactElapsedSec - right.impactElapsedSec || left.fireAtSec - right.fireAtSec || right.charge - left.charge;
  }

  function compareDualCandidates(strategy) {
    return strategy === 'easiest'
      ? (left, right) => right.launchGapSec - left.launchGapSec || left.completedAtSec - right.completedAtSec || (left.gunA.charge + left.gunB.charge) - (right.gunA.charge + right.gunB.charge)
      : strategy === 'lowest-charge'
        ? (left, right) => (left.gunA.charge + left.gunB.charge) - (right.gunA.charge + right.gunB.charge) || left.completedAtSec - right.completedAtSec || left.launchGapSec - right.launchGapSec
        : (left, right) => left.completedAtSec - right.completedAtSec || Math.min(left.gunA.fireAtSec, left.gunB.fireAtSec) - Math.min(right.gunA.fireAtSec, right.gunB.fireAtSec);
  }

  function recommendSingle({ ironNest, track, currentBearing, elapsedSec = 0, bufferSec = DEFAULT_BUFFER_SEC, strategy = 'fastest' }) {
    if (!['fastest', 'lowest-charge'].includes(strategy)) throw new RangeError('单炮拦截推荐策略无效');
    const bearing = positioning.normalizeBearing(currentBearing);
    const candidates = Array.from({ length: ballistics.MAX_CHARGES }, (_, index) => scheduleShot({ ironNest, track, elapsedSec, startBearingDeg: bearing, charge: index + 1, bufferSec })).filter(Boolean);
    if (!candidates.length) throw new RangeError('该动目标在地图内没有可执行的拦截方案');
    candidates.sort(compareSingleCandidates(strategy));
    return Object.freeze({ currentBearing: bearing, strategy, shot: candidates[0], candidates: Object.freeze(candidates) });
  }

  function recommendDual({ ironNest, gunA, gunB, currentBearing, elapsedSec = 0, firstBufferSec = DEFAULT_BUFFER_SEC, secondBufferSec = SECOND_SHOT_BUFFER_SEC, strategy = 'fastest' }) {
    if (!RECOMMENDATION_STRATEGIES.includes(strategy)) throw new RangeError('双炮拦截推荐策略无效');
    const bearing = positioning.normalizeBearing(currentBearing);
    const candidates = [];
    for (const order of [['gun-a', gunA, 'gun-b', gunB], ['gun-b', gunB, 'gun-a', gunA]]) {
      for (let firstCharge = 1; firstCharge <= ballistics.MAX_CHARGES; firstCharge += 1) for (let secondCharge = 1; secondCharge <= ballistics.MAX_CHARGES; secondCharge += 1) {
        const first = scheduleShot({ ironNest, track: order[1], elapsedSec, startBearingDeg: bearing, charge: firstCharge, bufferSec: firstBufferSec });
        if (!first) continue;
        const second = scheduleShot({ ironNest, track: order[3], elapsedSec, startAtSec: first.fireAtSec, startBearingDeg: first.bearingDeg, charge: secondCharge, bufferSec: secondBufferSec });
        if (!second) continue;
        const gunAResult = order[0] === 'gun-a' ? first : second;
        const gunBResult = order[0] === 'gun-b' ? first : second;
        candidates.push({ firstGunId: order[0], gunA: gunAResult, gunB: gunBResult, launchGapSec: second.fireAtSec - first.fireAtSec, completedAtSec: Math.max(gunAResult.impactElapsedSec, gunBResult.impactElapsedSec) });
      }
    }
    if (!candidates.length) throw new RangeError('两目标在地图内没有满足首发 80 秒、次发 20 秒缓冲的顺序拦截组合');
    candidates.sort(compareDualCandidates(strategy));
    return Object.freeze({ currentBearing: bearing, strategy, ...candidates[0], candidates: Object.freeze(candidates) });
  }

  return Object.freeze({ DEFAULT_BUFFER_SEC, SECOND_SHOT_BUFFER_SEC, RECOMMENDATION_STRATEGIES, pointAt, solveTrajectory, scheduleShot, recommendSingle, recommendDual });
});
