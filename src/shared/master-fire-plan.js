(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestMasterFirePlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_MASTER_PLAN_ITEMS = 12;
  const EPSILON = 1e-9;

  function normalizeBearing(value) {
    const bearing = Number(value);
    if (!Number.isFinite(bearing)) throw new RangeError('方位角必须是有效数字');
    return ((bearing % 360) + 360) % 360;
  }

  function angularDistance(fromBearing, toBearing) {
    const difference = Math.abs(normalizeBearing(toBearing) - normalizeBearing(fromBearing));
    return Math.min(difference, 360 - difference);
  }

  function totalRotation(currentBearing, items) {
    let previous = normalizeBearing(currentBearing);
    return items.reduce((total, item) => {
      const next = normalizeBearing(item.bearingDeg);
      const distance = angularDistance(previous, next);
      previous = next;
      return total + distance;
    }, 0);
  }

  function missionKey(item) {
    if (item?.totMissionId != null) return `tot:${item.totMissionId}`;
    if (item?.interceptMissionId != null) return `intercept:${item.interceptMissionId}`;
    return null;
  }

  function missionFireAtSec(item) {
    return item?.totMissionId != null ? Number(item.totFireAtSec) : item?.interceptMissionId != null ? Number(item.interceptFireAtSec) : Number.NaN;
  }

  function groupPlans(items) {
    const groups = [];
    const missions = new Map();
    for (const item of items) {
      const key = missionKey(item);
      if (key == null) {
        groups.push([item]);
        continue;
      }
      let group = missions.get(key);
      if (!group) {
        group = [];
        missions.set(key, group);
        groups.push(group);
      }
      group.push(item);
    }
    return groups;
  }

  // Held-Karp dynamic programming gives the globally shortest open route from
  // the current barrel bearing. With at most 12 plans this remains lightweight.
  function sortGroupsByMinimumRotation(groups, currentBearing) {
    if (groups.length < 2) return groups.slice();
    const start = normalizeBearing(currentBearing);
    const groupStart = group => group[0].bearingDeg;
    const groupEnd = group => group[group.length - 1].bearingDeg;
    const internalRotation = group => group.slice(1).reduce((total, item, index) => total + angularDistance(group[index].bearingDeg, item.bearingDeg), 0);

    const count = groups.length;
    const maskCount = 1 << count;
    const costs = new Float64Array(maskCount * count);
    costs.fill(Number.POSITIVE_INFINITY);
    const previous = new Int16Array(maskCount * count);
    previous.fill(-1);
    const indexFor = (mask, last) => mask * count + last;

    for (let index = 0; index < count; index += 1) {
      costs[indexFor(1 << index, index)] = angularDistance(start, groupStart(groups[index])) + internalRotation(groups[index]);
    }

    for (let mask = 1; mask < maskCount; mask += 1) {
      for (let last = 0; last < count; last += 1) {
        const currentCost = costs[indexFor(mask, last)];
        if (!Number.isFinite(currentCost)) continue;
        for (let next = 0; next < count; next += 1) {
          if (mask & (1 << next)) continue;
          const nextMask = mask | (1 << next);
          const target = indexFor(nextMask, next);
          const candidate = currentCost + angularDistance(groupEnd(groups[last]), groupStart(groups[next])) + internalRotation(groups[next]);
          if (candidate < costs[target] - EPSILON) {
            costs[target] = candidate;
            previous[target] = last;
          }
        }
      }
    }

    const fullMask = maskCount - 1;
    let end = 0;
    for (let index = 1; index < count; index += 1) {
      if (costs[indexFor(fullMask, index)] < costs[indexFor(fullMask, end)] - EPSILON) end = index;
    }
    const order = [];
    let mask = fullMask;
    let last = end;
    while (last >= 0) {
      order.unshift(last);
      const before = previous[indexFor(mask, last)];
      mask &= ~(1 << last);
      last = before;
    }
    return order.map(index => groups[index]);
  }

  function sortByMinimumRotation(items, currentBearing) {
    const plans = Array.isArray(items) ? items.slice() : [];
    if (plans.length < 2) return plans;
    if (plans.length > MAX_MASTER_PLAN_ITEMS) throw new RangeError(`总射击计划最多 ${MAX_MASTER_PLAN_ITEMS} 项`);
    const start = normalizeBearing(currentBearing);
    plans.forEach(item => normalizeBearing(item.bearingDeg));

    const groups = groupPlans(plans);
    const interceptGroups = groups.filter(group => group.some(item => item?.interceptMissionId != null));
    const regularGroups = groups.filter(group => !group.some(item => item?.interceptMissionId != null));
    const prioritized = sortGroupsByMinimumRotation(interceptGroups, start);
    const afterInterceptBearing = prioritized.length ? prioritized[prioritized.length - 1][prioritized[prioritized.length - 1].length - 1].bearingDeg : start;
    return [...prioritized, ...sortGroupsByMinimumRotation(regularGroups, afterInterceptBearing)].flat();
  }

  function assignAlternatingGuns(items) {
    const plans = Array.isArray(items) ? items.slice() : [];
    if (plans.length < 2) return plans;
    const firstGun = plans[0].gunId === 'gun-b' ? 'gun-b' : 'gun-a';
    let previousGun = firstGun === 'gun-a' ? 'gun-b' : 'gun-a';
    const result = [];
    for (let index = 0; index < plans.length; index += 1) {
      const item = plans[index];
      const key = missionKey(item);
      if (key != null) {
        const group = [item];
        while (index + 1 < plans.length && missionKey(plans[index + 1]) === key) group.push(plans[++index]);
        const chronological = group.slice().sort((left, right) => missionFireAtSec(left) - missionFireAtSec(right));
        const first = chronological[0];
        const expectedGun = previousGun === 'gun-a' ? 'gun-b' : 'gun-a';
        if (group.length === 2 && missionFireAtSec(first) !== missionFireAtSec(chronological[1]) && first.gunId !== expectedGun) {
          const firstIndex = group.indexOf(first);
          const secondIndex = firstIndex === 0 ? 1 : 0;
          const swapped = swapTotPayloads(group[firstIndex], group[secondIndex]);
          group[firstIndex] = swapped[0];
          group[secondIndex] = swapped[1];
        }
        const finalChronological = group.slice().sort((left, right) => missionFireAtSec(left) - missionFireAtSec(right));
        previousGun = finalChronological[finalChronological.length - 1].gunId;
        result.push(...group);
        continue;
      }
      const gunId = previousGun === 'gun-a' ? 'gun-b' : 'gun-a';
      previousGun = gunId;
      result.push({ ...item, gunId });
    }
    return result;
  }

  function orderByFireTime(items) {
    return (Array.isArray(items) ? items : []).slice().sort((left, right) => Number(left?.totFireAtSec) - Number(right?.totFireAtSec));
  }

  function swapTotPayloads(left, right) {
    const leftResult = { ...right, id: left.id };
    const rightResult = { ...left, id: right.id };
    if (Object.prototype.hasOwnProperty.call(left, 'gunId')) leftResult.gunId = left.gunId;
    if (Object.prototype.hasOwnProperty.call(right, 'gunId')) rightResult.gunId = right.gunId;
    return [leftResult, rightResult];
  }

  function normalizePlan(items) {
    return Array.isArray(items)
      ? items.filter(item => item && (item.gunId === 'gun-a' || item.gunId === 'gun-b') && Number.isFinite(item.bearingDeg) && Number.isFinite(item.elevationDeg) && Number.isInteger(item.charge)).slice(0, MAX_MASTER_PLAN_ITEMS)
      : [];
  }

  return Object.freeze({ MAX_MASTER_PLAN_ITEMS, normalizeBearing, angularDistance, totalRotation, missionKey, missionFireAtSec, sortByMinimumRotation, assignAlternatingGuns, orderByFireTime, swapTotPayloads, sortAlternatingGuns: assignAlternatingGuns, normalizePlan });
});
