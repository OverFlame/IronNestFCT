(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestMapEntities = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TARGET_MARKER_CODES = Object.freeze({
    red: Object.freeze(Array.from({ length: 10 }, (_, index) => String(index + 1))),
    green: Object.freeze(['A', 'B', 'C', 'D', 'E']),
    blue: Object.freeze(Array.from({ length: 10 }, (_, index) => String(index + 1)))
  });

  const TARGET_TYPE_LABELS = Object.freeze({ red: '红色', green: '绿色', blue: '蓝色' });
  const NATO_NAMES = Object.freeze({ A: 'ALPHA', B: 'BRAVO', C: 'CHARLIE', D: 'DELTA', E: 'ECHO' });

  function normalizeObserverNumber(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 999) {
      throw new RangeError('观测员编号必须是 1–999 的整数');
    }
    return number;
  }

  function normalizeTargetMarker(markerType, markerCode) {
    const type = String(markerType || '').toLowerCase();
    if (!TARGET_MARKER_CODES[type]) throw new RangeError('目标类型必须是红色、绿色或蓝色标记');
    const code = String(markerCode || '').toUpperCase();
    if (!TARGET_MARKER_CODES[type].includes(code)) {
      throw new RangeError(`${TARGET_TYPE_LABELS[type]}标记编号无效`);
    }
    return { markerType: type, markerCode: code };
  }

  function targetBaseName(target) {
    const marker = normalizeTargetMarker(target.markerType, target.markerCode);
    if (marker.markerType === 'green') return String(target.briefingId || '').trim() || NATO_NAMES[marker.markerCode];
    return `${TARGET_TYPE_LABELS[marker.markerType]}#${marker.markerCode}`;
  }

  function assignTargetNames(targets) {
    const counts = new Map();
    return targets.map(target => {
      const marker = normalizeTargetMarker(target.markerType, target.markerCode);
      const key = `${marker.markerType}:${marker.markerCode}`;
      const occurrence = (counts.get(key) || 0) + 1;
      counts.set(key, occurrence);
      const baseName = targetBaseName({ ...target, ...marker });
      const usesBriefingIdentity = marker.markerType === 'green' && Boolean(String(target.briefingId || '').trim());
      return { ...target, ...marker, name: usesBriefingIdentity || occurrence === 1 ? baseName : `${baseName}-${occurrence}` };
    });
  }

  return Object.freeze({
    TARGET_MARKER_CODES,
    TARGET_TYPE_LABELS,
    NATO_NAMES,
    normalizeObserverNumber,
    normalizeTargetMarker,
    targetBaseName,
    assignTargetNames
  });
});
