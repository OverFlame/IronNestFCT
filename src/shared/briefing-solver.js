(function exposeBriefingSolver(root, factory) {
  const api = factory(typeof require === 'function' ? require('./positioning.js') : root.IronNestPositioning);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestBriefingSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBriefingSolver(positioning) {
  'use strict';

  const DEFAULT_BEARING_TOLERANCE_DEG = 0.6;
  const DEFAULT_DISTANCE_TOLERANCE_KM = 0.03;
  const NUMERIC_BEARING_ERROR_DEG = 0.5;
  const REPORTED_DISTANCE_ERROR_KM = 0.005;
  const PRECISION_WARNING_THRESHOLD_KM = 0.15;
  const EPSILON = 1e-7;
  const MAX_SOURCE_COMBINATIONS = 64;
  const SECTOR_SAMPLE_STEP_DEG = 0.25;

  function angularDifference(leftBearing, rightBearing) {
    const difference = Math.abs(positioning.normalizeBearing(leftBearing) - positioning.normalizeBearing(rightBearing));
    return Math.min(difference, 360 - difference);
  }

  function isPoint(point) {
    return Number.isFinite(point?.xKm) && Number.isFinite(point?.yKm);
  }

  function hasBearing(report) {
    return Number.isFinite(report?.bearingDeg);
  }

  function hasDistance(report) {
    return Number.isFinite(report?.distanceKm) && report.distanceKm > 0;
  }

  function reverseReport(report, knownTarget) {
    if (!isPoint(knownTarget)) throw new TypeError('反推已知点必须包含有效坐标');
    if (!hasBearing(report) && !hasDistance(report)) throw new TypeError('反推关系必须包含方位角或距离');
    return {
      ...report,
      source: knownTarget,
      sources: undefined,
      bearingDeg: hasBearing(report) ? positioning.normalizeBearing(report.bearingDeg + 180) : null,
      distanceKm: hasDistance(report) ? report.distanceKm : null
    };
  }

  function sameSource(left, right) {
    return Math.abs(left.source.xKm - right.source.xKm) < EPSILON && Math.abs(left.source.yKm - right.source.yKm) < EPSILON;
  }

  function matchesReport(report, point) {
    if (!isPoint(report?.source) || !isPoint(point)) return false;
    if (hasBearing(report)) {
      const tolerance = Number.isFinite(report.bearingToleranceDeg) ? report.bearingToleranceDeg : DEFAULT_BEARING_TOLERANCE_DEG;
      if (angularDifference(positioning.bearingBetween(report.source, point), report.bearingDeg) > tolerance + EPSILON) return false;
    }
    return !hasDistance(report) || Math.abs(positioning.distanceBetween(report.source, point) - report.distanceKm) <= DEFAULT_DISTANCE_TOLERANCE_KM + EPSILON;
  }

  function candidateScore(reports, point) {
    return reports.reduce((score, report) => {
      if (hasBearing(report)) {
        const tolerance = Number.isFinite(report.bearingToleranceDeg) ? report.bearingToleranceDeg : DEFAULT_BEARING_TOLERANCE_DEG;
        score += angularDifference(positioning.bearingBetween(report.source, point), report.bearingDeg) / Math.max(tolerance, EPSILON);
      }
      if (hasDistance(report)) score += Math.abs(positioning.distanceBetween(report.source, point) - report.distanceKm) / DEFAULT_DISTANCE_TOLERANCE_KM;
      return score;
    }, 0);
  }

  function appendCandidate(candidates, point, basisReports, basisKind) {
    if (isPoint(point)) candidates.push({ point, basisReports, basisKind });
  }

  function candidateBearingSamples(report) {
    if (!hasBearing(report)) return [];
    const tolerance = Number.isFinite(report.bearingToleranceDeg) ? Math.max(0, report.bearingToleranceDeg) : 0;
    if (tolerance <= EPSILON) return [report.bearingDeg];
    const count = Math.max(1, Math.ceil(tolerance * 2 / SECTOR_SAMPLE_STEP_DEG));
    return Array.from({ length: count + 1 }, (_, index) => positioning.normalizeBearing(report.bearingDeg - tolerance + (tolerance * 2 * index / count)));
  }

  function reportVariants(report) {
    const sourceError = Number.isFinite(report.source?.positionErrorKm) ? Math.max(0, report.source.positionErrorKm) : 0;
    const sources = sourceError > EPSILON
      ? Array.from({ length: 8 }, (_, index) => {
        const angle = index * Math.PI / 4;
        return { ...report.source, xKm: report.source.xKm + Math.cos(angle) * sourceError, yKm: report.source.yKm + Math.sin(angle) * sourceError };
      })
      : [report.source];
    const bearingError = Number.isFinite(report.bearingToleranceDeg) ? Math.max(0, report.bearingToleranceDeg) : NUMERIC_BEARING_ERROR_DEG;
    const bearings = hasBearing(report) && bearingError > EPSILON ? [report.bearingDeg - bearingError, report.bearingDeg + bearingError] : [report.bearingDeg];
    const distances = hasDistance(report)
      ? [Math.max(EPSILON, report.distanceKm - REPORTED_DISTANCE_ERROR_KM), report.distanceKm + REPORTED_DISTANCE_ERROR_KM]
      : [report.distanceKm];
    return sources.flatMap(source => bearings.flatMap(bearingDeg => distances.map(distanceKm => ({ ...report, source, bearingDeg, distanceKm }))));
  }

  function perturbedBasisPoints(kind, reports) {
    if (reports.length === 1) return [positioning.pointFromBearingDistance(reports[0].source, reports[0].bearingDeg, reports[0].distanceKm)];
    const bearingReport = reports.find(hasBearing);
    const distanceReport = reports.find(report => report !== bearingReport && hasDistance(report)) || reports.find(hasDistance);
    if (kind === 'bearing-bearing') return positioning.intersectBearings(reports[0].source, reports[0].bearingDeg, reports[1].source, reports[1].bearingDeg);
    if (kind === 'bearing-distance') return positioning.intersectBearingDistance(bearingReport.source, bearingReport.bearingDeg, distanceReport.source, distanceReport.distanceKm);
    return positioning.intersectDistances(reports[0].source, reports[0].distanceKm, reports[1].source, reports[1].distanceKm);
  }

  function estimatePositionError(candidate) {
    const variantGroups = candidate.basisReports.map(reportVariants);
    let maximum = 0;
    const visit = (index, reports) => {
      if (index < variantGroups.length) return variantGroups[index].forEach(report => visit(index + 1, [...reports, report]));
      const points = perturbedBasisPoints(candidate.basisKind, reports);
      if (!points.length) return;
      const nearest = points.reduce((best, point) => positioning.distanceBetween(point, candidate.point) < positioning.distanceBetween(best, candidate.point) ? point : best);
      maximum = Math.max(maximum, positioning.distanceBetween(nearest, candidate.point));
    };
    visit(0, []);
    return Number(maximum.toFixed(4));
  }

  function sourcesForReport(report) {
    const sources = [report?.source, ...(Array.isArray(report?.sources) ? report.sources : [])]
      .filter(isPoint);
    return sources.filter((source, index) => !sources.slice(0, index).some(previous =>
      Math.abs(previous.xKm - source.xKm) < EPSILON && Math.abs(previous.yKm - source.yKm) < EPSILON
    ));
  }

  function sourceReportCombinations(inputReports) {
    let combinations = [[]];
    for (const report of Array.isArray(inputReports) ? inputReports : []) {
      const sources = sourcesForReport(report);
      if (!sources.length || (!hasBearing(report) && !hasDistance(report))) return [];
      combinations = combinations.flatMap(combination => sources.map(source => [
        ...combination,
        report.source === source ? report : { ...report, source }
      ])).slice(0, MAX_SOURCE_COMBINATIONS);
    }
    return combinations;
  }

  function baseCandidates(reports) {
    const candidates = [];
    reports.forEach(report => {
      if (hasBearing(report) && hasDistance(report)) candidateBearingSamples(report)
        .forEach(bearingDeg => appendCandidate(candidates, positioning.pointFromBearingDistance(report.source, bearingDeg, report.distanceKm), [report], 'bearing-distance'));
    });
    for (let leftIndex = 0; leftIndex < reports.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < reports.length; rightIndex += 1) {
        const left = reports[leftIndex];
        const right = reports[rightIndex];
        if (sameSource(left, right)) continue;
        if (hasBearing(left) && hasBearing(right)) positioning.intersectBearings(left.source, left.bearingDeg, right.source, right.bearingDeg).forEach(point => appendCandidate(candidates, point, [left, right], 'bearing-bearing'));
        if (hasBearing(left) && hasDistance(right)) candidateBearingSamples(left)
          .flatMap(bearingDeg => positioning.intersectBearingDistance(left.source, bearingDeg, right.source, right.distanceKm))
          .forEach(point => appendCandidate(candidates, point, [left, right], 'bearing-distance'));
        if (hasDistance(left) && hasBearing(right)) candidateBearingSamples(right)
          .flatMap(bearingDeg => positioning.intersectBearingDistance(right.source, bearingDeg, left.source, left.distanceKm))
          .forEach(point => appendCandidate(candidates, point, [left, right], 'bearing-distance'));
        if (hasDistance(left) && hasDistance(right)) positioning.intersectDistances(left.source, left.distanceKm, right.source, right.distanceKm).forEach(point => appendCandidate(candidates, point, [left, right], 'distance-distance'));
      }
    }
    return candidates;
  }

  function solve(inputReports) {
    const reportCombinations = sourceReportCombinations(inputReports);
    const reports = reportCombinations[0] || [];
    const candidates = reportCombinations.flatMap(combination => baseCandidates(combination)
      .filter(candidate => positioning.isPointInsideBounds(candidate.point) && combination.every(report => matchesReport(report, candidate.point)))
      .map(candidate => ({ ...candidate, score: candidateScore(combination, candidate.point) })))
      .sort((left, right) => left.score - right.score)
      .filter((candidate, index, all) => !all.slice(0, index).some(previous => Math.abs(previous.point.xKm - candidate.point.xKm) < EPSILON && Math.abs(previous.point.yKm - candidate.point.yKm) < EPSILON));
    const hasDirectionalSector = reportCombinations.some(combination => combination.some(report => Number.isFinite(report.bearingToleranceDeg)));
    const resolvedCandidates = (hasDirectionalSector ? candidates.slice(0, 1) : candidates)
      .map(candidate => ({ ...candidate, positionErrorKm: estimatePositionError(candidate) }));
    const frozenCandidates = Object.freeze(resolvedCandidates.map(candidate => Object.freeze(candidate)));
    return Object.freeze({ reports: Object.freeze(reports), candidates: frozenCandidates, recommended: frozenCandidates[0] || null });
  }

  return Object.freeze({ DEFAULT_BEARING_TOLERANCE_DEG, DEFAULT_DISTANCE_TOLERANCE_KM, NUMERIC_BEARING_ERROR_DEG, REPORTED_DISTANCE_ERROR_KM, PRECISION_WARNING_THRESHOLD_KM, MAX_SOURCE_COMBINATIONS, SECTOR_SAMPLE_STEP_DEG, angularDifference, matchesReport, reverseReport, solve });
});
