(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./positioning.js') : root.IronNestPositioning);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestDerivation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (positioning) {
  'use strict';

  const EPSILON = 1e-9;
  const THIRD_BEARING_TOLERANCE_DEG = 0.15;
  const THIRD_DISTANCE_TOLERANCE_KM = 0.03;

  const METHODS = Object.freeze(['bearing-bearing', 'bearing-distance', 'distance-distance', 'bearing-distance-single']);

  function sourceKey(kind, id) {
    return `${kind}:${String(id)}`;
  }

  function parseSourceKey(key) {
    const index = String(key).indexOf(':');
    if (index <= 0) return null;
    return { kind: key.slice(0, index), id: key.slice(index + 1) };
  }

  function crossingDerivation(method, sources, third = null) {
    return normalizeDerivation({ kind: 'crossing', method, sources, third });
  }

  function reverseDerivation(sourceKeyValue, bearingDeg, distanceKm) {
    return normalizeDerivation({ kind: 'reverse', sourceKey: sourceKeyValue, bearingDeg, distanceKm });
  }

  function briefingDerivation(method, sources) {
    return normalizeDerivation({ kind: 'briefing', method, sources, third: null });
  }

  function normalizeDerivation(value) {
    if (!value || typeof value !== 'object') return null;
    const kind = value.kind;
    if (kind === 'reverse') {
      const bearingDeg = Number(value.bearingDeg);
      const distanceKm = Number(value.distanceKm);
      if (!value.sourceKey || !Number.isFinite(bearingDeg) || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
      return { kind: 'reverse', sourceKey: String(value.sourceKey), bearingDeg: positioning.normalizeBearing(bearingDeg), distanceKm };
    }

    if (kind !== 'crossing' && kind !== 'briefing') return null;
    if (!METHODS.includes(value.method)) return null;

    const sources = (Array.isArray(value.sources) ? value.sources : [])
      .map(source => source == null ? null : ({
        key: source.key != null ? String(source.key) : null,
        bearingDeg: Number.isFinite(Number(source.bearingDeg)) ? Number(source.bearingDeg) : null,
        distanceKm: Number.isFinite(Number(source.distanceKm)) ? Number(source.distanceKm) : null
      }))
      .filter(Boolean);

    let third = null;
    if (value.third && value.third.key != null && Number.isFinite(Number(value.third.measure))) {
      third = {
        key: String(value.third.key),
        measure: Number(value.third.measure),
        measureType: value.third.measureType === 'distance' ? 'distance' : 'bearing'
      };
    }

    return { kind, method: value.method, sources, third };
  }

  function dependentKeys(derivation) {
    const d = normalizeDerivation(derivation);
    if (!d) return [];
    if (d.kind === 'reverse') return [d.sourceKey];
    const keys = d.sources.map(source => source.key).filter(Boolean);
    if (d.third) keys.push(d.third.key);
    return [...new Set(keys)];
  }

  function angularDifference(left, right) {
    const a = positioning.normalizeBearing(left);
    const b = positioning.normalizeBearing(right);
    const difference = Math.abs(a - b);
    return Math.min(difference, 360 - difference);
  }

  function applyThirdFilter(points, third, resolveSource) {
    if (!third) return points;
    const source = resolveSource(third.key);
    if (!source) return null;
    return points.filter(point => third.measureType === 'distance'
      ? Math.abs(positioning.distanceBetween(source, point) - third.measure) <= THIRD_DISTANCE_TOLERANCE_KM + EPSILON
      : angularDifference(positioning.bearingBetween(source, point), third.measure) <= THIRD_BEARING_TOLERANCE_DEG + EPSILON);
  }

  function intersectFor(method, sources, resolveSource) {
    const a = resolveSource(sources[0].key);
    if (!a) return null;
    if (method === 'bearing-distance-single') {
      if (sources[0].bearingDeg == null || sources[0].distanceKm == null) return null;
      return [positioning.pointFromBearingDistance(a, sources[0].bearingDeg, sources[0].distanceKm)];
    }

    const b = resolveSource(sources[1].key);
    if (!b) return null;

    if (method === 'bearing-bearing') {
      if (sources[0].bearingDeg == null || sources[1].bearingDeg == null) return null;
      return positioning.intersectBearings(a, sources[0].bearingDeg, b, sources[1].bearingDeg);
    }
    if (method === 'bearing-distance') {
      if (sources[0].bearingDeg == null || sources[1].distanceKm == null) return null;
      return positioning.intersectBearingDistance(a, sources[0].bearingDeg, b, sources[1].distanceKm);
    }
    if (method === 'distance-distance') {
      if (sources[0].distanceKm == null || sources[1].distanceKm == null) return null;
      return positioning.intersectDistances(a, sources[0].distanceKm, b, sources[1].distanceKm);
    }
    return null;
  }

  // Recompute the candidate points for a derivation. resolveSource(key) must
  // return {xKm, yKm} or null. Returns null when the derivation cannot be
  // evaluated (missing/invalid source); otherwise an array (possibly empty).
  function resolve(derivation, resolveSource) {
    const d = normalizeDerivation(derivation);
    if (!d) return null;
    if (d.kind === 'reverse') {
      const source = resolveSource(d.sourceKey);
      if (!source) return null;
      return [positioning.pointFromBearingDistance(source, positioning.normalizeBearing(d.bearingDeg + 180), d.distanceKm)];
    }

    if (d.method === 'bearing-distance-single') {
      if (d.sources.length < 1) return null;
      const points = intersectFor(d.method, d.sources, resolveSource);
      if (!points) return null;
      return applyThirdFilter(points, d.third, resolveSource);
    }
    if (d.sources.length < 2) return null;
    const points = intersectFor(d.method, d.sources, resolveSource);
    if (!points) return null;
    return applyThirdFilter(points, d.third, resolveSource);
  }

  return Object.freeze({
    EPSILON,
    THIRD_BEARING_TOLERANCE_DEG,
    THIRD_DISTANCE_TOLERANCE_KM,
    METHODS,
    sourceKey,
    parseSourceKey,
    crossingDerivation,
    reverseDerivation,
    briefingDerivation,
    normalizeDerivation,
    dependentKeys,
    angularDifference,
    resolve
  });
});
