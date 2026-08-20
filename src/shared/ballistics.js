(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestBallistics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_ELEVATION_DEG = 60;
  const MAX_CHARGES = 6;
  const FLIGHT_TIME_COEFFICIENTS = Object.freeze({ 1: 4.65, 2: 3.80, 3: 2.62, 4: 1.85, 5: 1.55, 6: 1.40 });

  function normalizeDistance(value) {
    const distanceKm = Number(value);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) throw new RangeError('距离必须大于 0 km');
    return distanceKm;
  }

  function flightTime(distanceKm, charges) {
    const distance = normalizeDistance(distanceKm);
    if (!Number.isInteger(charges) || charges < 1 || charges > MAX_CHARGES) throw new RangeError('装药数必须是 1–6 的整数');
    return Math.floor(distance * FLIGHT_TIME_COEFFICIENTS[charges] + 0.5);
  }

  function calculateSolutions(distanceKm) {
    const distance = normalizeDistance(distanceKm);
    const all = Array.from({ length: MAX_CHARGES }, (_, index) => {
      const charges = index + 1;
      const elevationDeg = (12 / charges) * distance;
      return {
        charges,
        elevationDeg,
        flightTimeSec: flightTime(distance, charges),
        valid: elevationDeg <= MAX_ELEVATION_DEG + Number.EPSILON
      };
    });
    const solutions = all.filter(solution => solution.valid);
    return {
      distanceKm: distance,
      solutions,
      minimum: solutions[0] || null,
      sixCharge: all[MAX_CHARGES - 1]
    };
  }

  return Object.freeze({
    MAX_ELEVATION_DEG,
    MAX_CHARGES,
    FLIGHT_TIME_COEFFICIENTS,
    normalizeDistance,
    flightTime,
    calculateSolutions
  });
});
