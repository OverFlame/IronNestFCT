(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./briefing-parser.js') : root.IronNestBriefingParser,
    typeof require === 'function' ? require('./positioning.js') : root.IronNestPositioning,
    typeof require === 'function' ? require('./moving-intercept.js') : root.IronNestMovingIntercept,
    typeof require === 'function' ? require('./fire-plan.js') : root.IronNestFirePlan
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestRailIntercept = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (briefingParser, positioning, movingIntercept, firePlan) {
  'use strict';

  const DAY_SECONDS = 86400;
  const EPSILON = 1e-9;
  const TRAIN_CARRIAGE_LENGTH_METERS = 100;
  const TRAIN_CARRIAGE_LENGTH_KM = TRAIN_CARRIAGE_LENGTH_METERS / 1000;

  function number(value, label, minimum = -Infinity) {
    const result = Number(value);
    if (!Number.isFinite(result) || result < minimum) throw new RangeError(`${label}无效`);
    return result;
  }

  function unwrapNear(value, anchor) {
    const raw = number(value, '任务时刻', 0);
    const options = [raw - DAY_SECONDS, raw, raw + DAY_SECONDS];
    return options.reduce((closest, candidate) => Math.abs(candidate - anchor) < Math.abs(closest - anchor) ? candidate : closest, options[0]);
  }

  function routeTimeline(route) {
    if (!route?.station || !Number.isFinite(route.station.xKm) || !Number.isFinite(route.station.yKm)) throw new TypeError('铁路态势缺少有效车站坐标');
    const bearingDeg = positioning.normalizeBearing(route.bearingDeg);
    const arrivalRaw = briefingParser.clockSeconds(route.arrivalTime);
    const waypoints = (Array.isArray(route.waypoints) ? route.waypoints : [])
      .map(waypoint => ({ ...waypoint, timeSec: briefingParser.clockSeconds(waypoint.time), distanceKm: Number(waypoint.distanceKm) }))
      .filter(waypoint => waypoint.timeSec != null && Number.isFinite(waypoint.distanceKm) && waypoint.distanceKm > 0);
    if (waypoints.length < 2 && arrivalRaw == null) throw new RangeError('列车射击至少需要两个带时刻的路径点，或一个路径点与到站时刻');
    const anchor = arrivalRaw ?? waypoints[0].timeSec;
    const samples = waypoints.map(waypoint => ({ ...waypoint, timelineSec: unwrapNear(waypoint.timeSec, anchor) }));
    if (arrivalRaw != null) samples.push({ label: route.station.name || '车站', time: route.arrivalTime, timeSec: arrivalRaw, timelineSec: unwrapNear(arrivalRaw, anchor), distanceKm: 0, station: true });
    samples.sort((left, right) => left.timelineSec - right.timelineSec);
    const first = samples[0];
    const last = samples[samples.length - 1];
    const durationSec = last.timelineSec - first.timelineSec;
    if (durationSec <= EPSILON || first.distanceKm <= last.distanceKm + EPSILON) throw new RangeError('列车路径点时刻或距离顺序无效');
    const speedKmPerSec = (first.distanceKm - last.distanceKm) / durationSec;
    if (speedKmPerSec <= EPSILON) throw new RangeError('无法从列车时刻表计算有效速度');
    return Object.freeze({ station: route.station, bearingDeg, first, last, samples: Object.freeze(samples), speedKmPerSec, arrivalTimelineSec: arrivalRaw == null ? null : unwrapNear(arrivalRaw, anchor) });
  }

  function positionAtMissionTime(route, missionTimeSec) {
    const timeline = routeTimeline(route);
    const timeSec = unwrapNear(missionTimeSec, timeline.first.timelineSec);
    const distanceFromStationKm = timeline.first.distanceKm - timeline.speedKmPerSec * (timeSec - timeline.first.timelineSec);
    const direction = positioning.directionFromBearing(timeline.bearingDeg);
    return Object.freeze({
      ...timeline,
      missionTimelineSec: timeSec,
      distanceFromStationKm,
      xKm: timeline.station.xKm + direction.x * distanceFromStationKm,
      yKm: timeline.station.yKm + direction.y * distanceFromStationKm,
      isBeforeFirstWaypoint: timeSec < timeline.first.timelineSec - EPSILON,
      secondsBeforeFirstWaypoint: Math.max(0, timeline.first.timelineSec - timeSec),
      secondsToArrival: timeline.arrivalTimelineSec == null ? null : timeline.arrivalTimelineSec - timeSec
    });
  }

  function carriageCountForRoute(route) {
    const count = Number(route?.carriageCount);
    return Number.isInteger(count) && count > 0 ? count : 1;
  }

  function targetCarriageIndexForRoute(route, { targetMode = 'front', targetCarriageIndex } = {}) {
    const carriageCount = carriageCountForRoute(route);
    if (targetMode === 'middle' && carriageCount % 2 === 1) return Math.ceil(carriageCount / 2);
    const requested = Number(targetCarriageIndex);
    return Number.isInteger(requested) && requested >= 1 && requested <= carriageCount ? requested : 1;
  }

  function targetSpecificationForRoute(route, target = {}) {
    const carriageCount = carriageCountForRoute(route);
    if (target.targetMode === 'middle') {
      const targetCarriageIndex = targetCarriageIndexForRoute(route, target);
      const even = carriageCount % 2 === 0;
      return Object.freeze({
        targetMode: 'middle',
        targetCarriageIndex: even ? null : targetCarriageIndex,
        targetOffsetKm: (carriageCount - 1) / 2 * TRAIN_CARRIAGE_LENGTH_KM,
        targetLabel: even ? `中段（第${carriageCount / 2}/${carriageCount / 2 + 1}节之间）` : `中段（第${targetCarriageIndex}节）`
      });
    }
    const targetCarriageIndex = targetCarriageIndexForRoute(route, target);
    return Object.freeze({
      targetMode: 'carriage',
      targetCarriageIndex,
      targetOffsetKm: (targetCarriageIndex - 1) * TRAIN_CARRIAGE_LENGTH_KM,
      targetLabel: `第${targetCarriageIndex}节`
    });
  }

  function trainSegmentPoint(position, headingDeg, offsetKm) {
    const direction = positioning.directionFromBearing(positioning.normalizeBearing(headingDeg + 180));
    return {
      xKm: position.xKm + direction.x * offsetKm,
      yKm: position.yKm + direction.y * offsetKm,
      offsetKm
    };
  }

  function trackAtMissionTime(route, missionTimeSec, target = {}) {
    const position = positionAtMissionTime(route, missionTimeSec);
    if (position.distanceFromStationKm < -EPSILON) throw new RangeError('列车已到站；请改用车站资料卡进行静止目标火控');
    const headingDeg = positioning.normalizeBearing(position.bearingDeg + 180);
    const carriageCount = carriageCountForRoute(route);
    const specification = targetSpecificationForRoute(route, target);
    const segment = trainSegmentPoint(position, headingDeg, specification.targetOffsetKm);
    return Object.freeze({
      label: `${position.station.name || '列车'}列车 · ${specification.targetLabel}`,
      xKm: segment.xKm,
      yKm: segment.yKm,
      headingDeg,
      speedKmPerSec: position.speedKmPerSec,
      expiresAtSec: position.secondsToArrival == null ? null : Math.max(0, position.secondsToArrival),
      railPosition: position,
      headXKm: position.xKm,
      headYKm: position.yKm,
      carriageCount,
      carriageLengthMeters: TRAIN_CARRIAGE_LENGTH_METERS,
      ...specification,
      targetOffsetFromHeadKm: segment.offsetKm
    });
  }

  function evaluateAoeCoverage(track, shellType) {
    const carriageCount = Number(track?.carriageCount);
    const targetOffsetKm = Number(track?.targetOffsetFromHeadKm);
    if (!Number.isInteger(carriageCount) || carriageCount < 1 || !Number.isFinite(targetOffsetKm) || targetOffsetKm < -EPSILON || targetOffsetKm > (carriageCount - 1) * TRAIN_CARRIAGE_LENGTH_KM + EPSILON) {
      return Object.freeze({ knownTrainLength: false, shellType, radiusMeters: firePlan.shellAoeRadiusMeters(shellType), fullyCoversTrain: false });
    }
    const radiusMeters = firePlan.shellAoeRadiusMeters(shellType);
    const targetOffsetMeters = targetOffsetKm * 1000;
    const distanceToFrontMeters = targetOffsetMeters + TRAIN_CARRIAGE_LENGTH_METERS / 2;
    const distanceToRearMeters = carriageCount * TRAIN_CARRIAGE_LENGTH_METERS - TRAIN_CARRIAGE_LENGTH_METERS / 2 - targetOffsetMeters;
    const requiredRadiusMeters = Math.max(distanceToFrontMeters, distanceToRearMeters);
    return Object.freeze({
      knownTrainLength: true,
      shellType,
      radiusMeters,
      carriageCount,
      trainLengthMeters: carriageCount * TRAIN_CARRIAGE_LENGTH_METERS,
      distanceToFrontMeters,
      distanceToRearMeters,
      requiredRadiusMeters,
      fullyCoversTrain: radiusMeters + EPSILON >= requiredRadiusMeters
    });
  }

  function recommendSingle({ route, missionTimeSec, ironNest, currentBearing, strategy = 'fastest', targetMode = 'front', targetCarriageIndex } = {}) {
    const track = trackAtMissionTime(route, missionTimeSec, { targetMode, targetCarriageIndex });
    const result = movingIntercept.recommendSingle({ ironNest, track, currentBearing, elapsedSec: 0, strategy });
    return Object.freeze({ ...result, track });
  }

  function recommendDual({ route, missionTimeSec, ironNest, currentBearing, strategy = 'fastest', targetMode = 'front', targetCarriageIndex } = {}) {
    const track = trackAtMissionTime(route, missionTimeSec, { targetMode, targetCarriageIndex });
    const result = movingIntercept.recommendDual({ ironNest, gunA: track, gunB: { ...track }, currentBearing, elapsedSec: 0, strategy });
    return Object.freeze({ ...result, track });
  }

  return Object.freeze({ DAY_SECONDS, TRAIN_CARRIAGE_LENGTH_METERS, TRAIN_CARRIAGE_LENGTH_KM, routeTimeline, positionAtMissionTime, carriageCountForRoute, targetCarriageIndexForRoute, targetSpecificationForRoute, trackAtMissionTime, evaluateAoeCoverage, recommendSingle, recommendDual });
});
