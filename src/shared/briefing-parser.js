(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestBriefingParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FULL_COORDINATE_PATTERN = /\b([A-T])\s*(10|[1-9])\s+([0-9])\s*:\s*([0-9])\b/gi;
  const COMPACT_COORDINATE_PATTERN = /\b([A-T])(10|[1-9])([0-9])([0-9])\b/gi;
  const CARDINAL_BEARINGS = Object.freeze({ 北: 0, 东北偏北: 22.5, 东北: 45, 东北偏东: 67.5, 东: 90, 东南偏东: 112.5, 东南: 135, 东南偏南: 157.5, 南: 180, 西南偏南: 202.5, 西南: 225, 西南偏西: 247.5, 西: 270, 西北偏西: 292.5, 西北: 315, 西北偏北: 337.5 });
  const DIRECTION_SECTOR_TOLERANCE_DEG = 11.25;
  const DIRECTION_WORD_PATTERN = Object.keys(CARDINAL_BEARINGS).sort((left, right) => right.length - left.length).join('|');
  const DIRECTION_DISTANCE_PATTERN = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(km|公里|千米|m|米)\\s*(${DIRECTION_WORD_PATTERN})`, 'i');

  function decodeEntities(value) {
    return String(value ?? '')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"');
  }

  function cleanBriefingText(value) {
    return decodeEntities(value)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/\u00a0/g, ' ');
  }

  function coordinateMatches(line) {
    const matches = [];
    for (const pattern of [FULL_COORDINATE_PATTERN, COMPACT_COORDINATE_PATTERN]) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line))) {
        matches.push({
          index: match.index,
          length: match[0].length,
          coordinate: `${match[1].toUpperCase()}${match[2]} ${match[3]}:${match[4]}`
        });
      }
    }
    return matches.sort((a, b) => a.index - b.index).filter((item, index, values) => !values.slice(0, index).some(previous => previous.index === item.index));
  }

  function numericValue(value) {
    const number = Number(String(value).replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }

  function positiveChineseInteger(value) {
    const input = String(value || '').trim();
    if (/^\d+$/.test(input)) return Number(input);
    const digits = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    if (Object.prototype.hasOwnProperty.call(digits, input)) return digits[input];
    if (/^[一二三四五六七八九十]+$/.test(input)) {
      if (input === '十') return 10;
      const tenIndex = input.indexOf('十');
      if (tenIndex >= 0) {
        const tens = tenIndex === 0 ? 1 : digits[input[tenIndex - 1]];
        const ones = input[tenIndex + 1] ? digits[input[tenIndex + 1]] : 0;
        return Number.isInteger(tens) && Number.isInteger(ones) ? tens * 10 + ones : null;
      }
    }
    return null;
  }

  function directionBearingFrom(value) {
    return CARDINAL_BEARINGS[String(value ?? '').replace(/\s+/g, '')] ?? null;
  }

  function directionSectorFrom(value) {
    const word = String(value ?? '').replace(/\s+/g, '');
    const bearingDeg = directionBearingFrom(word);
    if (bearingDeg == null) return null;
    return { bearingDeg, bearingToleranceDeg: DIRECTION_SECTOR_TOLERANCE_DEG };
  }

  function observerTableValueFrom(context) {
    const match = String(context).match(/(?:观测员|监听哨|前线观察员|OBSERVER|SPOTTER|LISTENING\s*POST|\bFO)\s*(?:#|:|编号)?\s*\d{1,3}\s*[:：]\s*(.+?)\s*$/i);
    if (!match) return { bearingDeg: null, distanceKm: null };
    const value = match[1].trim();
    const distanceMatch = value.match(/^(\d+(?:[.,]\d+)?)\s*(km|公里|千米|m|米)$/i);
    const bearingMatch = distanceMatch ? null : value.match(/^(-?\d{1,3}(?:[.,]\d+)?)\s*(?:°|DEG(?:REE)?S?)$/i);
    let distanceKm = distanceMatch ? numericValue(distanceMatch[1]) : null;
    if (distanceKm != null && /^(m|米)$/i.test(distanceMatch[2])) distanceKm /= 1000;
    const directionSector = bearingMatch ? null : directionSectorFrom(value);
    const bearingDeg = bearingMatch ? numericValue(bearingMatch[1]) : directionSector?.bearingDeg ?? null;
    return {
      bearingDeg: bearingDeg != null && bearingDeg >= 0 && bearingDeg <= 360 ? bearingDeg : null,
      bearingToleranceDeg: directionSector?.bearingToleranceDeg ?? null,
      distanceKm: distanceKm != null && distanceKm > 0 ? distanceKm : null
    };
  }

  function activityMajorCoordinateFrom(line) {
    const match = String(line).match(/(?:报告)?活动于坐标\s*([A-T])\s*(10|[1-9])\b/i);
    return match ? `${match[1].toUpperCase()}${match[2]} 5:5` : null;
  }

  function observationValuesFrom(context) {
    const bearingMatch = context.match(/(?:\bBEARING\b|方位(?:角)?|方向(?:角)?)\s*(?:[:=：]|为|是)?\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:°|DEG(?:REE)?S?)?/i);
    const distanceMatch = context.match(/(?:\bDIST(?:ANCE)?\b|距离)\s*(?:[:=：]|为|是)?\s*(\d+(?:[.,]\d+)?)\s*(km|公里|千米|m|米)?/i);
    const directionDistanceMatch = context.match(DIRECTION_DISTANCE_PATTERN);
    const tableValues = observerTableValueFrom(context);
    const directionSector = directionDistanceMatch ? directionSectorFrom(directionDistanceMatch[3]) : null;
    const bearingDeg = bearingMatch ? numericValue(bearingMatch[1]) : directionSector?.bearingDeg ?? tableValues.bearingDeg;
    let distanceKm = distanceMatch ? numericValue(distanceMatch[1]) : directionDistanceMatch ? numericValue(directionDistanceMatch[1]) : tableValues.distanceKm;
    const distanceUnit = distanceMatch ? distanceMatch[2] : directionDistanceMatch ? directionDistanceMatch[2] : null;
    if (distanceKm != null && /^(m|米)$/i.test(distanceUnit || '')) distanceKm /= 1000;
    return {
      bearingDeg: bearingDeg != null && bearingDeg >= 0 && bearingDeg <= 360 ? bearingDeg : null,
      bearingToleranceDeg: directionSector?.bearingToleranceDeg ?? tableValues.bearingToleranceDeg,
      distanceKm: distanceKm != null && distanceKm > 0 ? distanceKm : null
    };
  }

  function observerNumberFrom(context) {
    const match = context.match(/(?:观测员|监听哨|前线观察员|OBSERVER|SPOTTER|LISTENING\s*POST|\bFO)\s*(?:#|:|编号)?\s*(\d{1,3})/i);
    if (!match) return null;
    const number = Number(match[1]);
    return number >= 1 && number <= 999 ? number : null;
  }

  function observerRoleFrom(context) {
    return /监听哨|LISTENING\s*POST/i.test(context) ? 'listener' : 'observer';
  }

  function sourceLabelFrom(context) {
    const match = String(context).match(/\u81ea\s*(.+?)\s*\u7684\s*(?:\u65b9\u4f4d(?:\u89d2)?|\u65b9\u5411(?:\u89d2)?|\u8ddd\u79bb)/i);
    if (match) return match[1].trim().slice(0, 120) || null;
    const directionMatch = String(context).match(/自\s*(.+?)\s+\d+(?:[.,]\d+)?\s*(?:km|公里|千米|m|米)\s*(?:东北|东南|西南|西北|北|东|南|西)/i);
    return directionMatch ? directionMatch[1].trim().slice(0, 120) || null : null;
  }

  function observationTargetLabelKey(label) {
    return String(label || '').trim().replace(/\s+/g, '').toLocaleLowerCase();
  }

  function groupObservationReports(reports) {
    const ordinaryGroupsByLabel = new Map();
    for (const report of Array.isArray(reports) ? reports : []) {
      const groupKey = report?.targetGroupKey || 'legacy';
      if (/^audio-target:/i.test(groupKey)) continue;
      const labelKey = observationTargetLabelKey(report?.targetLabel);
      if (!labelKey) continue;
      if (!ordinaryGroupsByLabel.has(labelKey)) ordinaryGroupsByLabel.set(labelKey, new Set());
      ordinaryGroupsByLabel.get(labelKey).add(groupKey);
    }

    const groups = new Map();
    for (const report of Array.isArray(reports) ? reports : []) {
      let groupKey = report?.targetGroupKey || 'legacy';
      if (/^audio-target:/i.test(groupKey)) {
        const ordinaryGroups = ordinaryGroupsByLabel.get(observationTargetLabelKey(report?.targetLabel));
        if (ordinaryGroups?.size === 1) groupKey = [...ordinaryGroups][0];
      }
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(report);
    }
    return groups;
  }

  function audioObservationReportFromLine(line) {
    if (!/(?:音频报告|\bAUDIO\s*REPORT\b)/i.test(line)) return null;
    const coordinate = coordinateMatches(line)[0];
    if (!coordinate) return null;
    const beforeCoordinate = line.slice(0, coordinate.index);
    const distanceMatch = beforeCoordinate.match(/(\d+(?:[.,]\d+)?)\s*(km|公里|千米|m|米)\s*自\s*$/i);
    const bearingMatch = distanceMatch ? null : beforeCoordinate.match(/(?:(?:方位(?:角)?|方向(?:角)?|\bBEARING\b|\bHEADING\b)\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:°|DEG(?:REE)?S?)?|(-?\d{1,3}(?:[.,]\d+)?)\s*(?:°|DEG(?:REE)?S?))\s*自\s*$/i);
    const measurement = distanceMatch || bearingMatch;
    if (!measurement) return null;
    const heading = beforeCoordinate.slice(0, measurement.index).match(/(?:音频报告|\bAUDIO\s*REPORT\b)\s+(.+?)\s*[:：]\s*$/i);
    if (!heading) return null;
    let distanceKm = distanceMatch ? numericValue(distanceMatch[1]) : null;
    if (distanceKm != null && /^(m|米)$/i.test(distanceMatch[2])) distanceKm /= 1000;
    const bearingDeg = bearingMatch ? numericValue(bearingMatch[1] ?? bearingMatch[2]) : null;
    if (distanceKm != null && distanceKm <= 0) return null;
    if (bearingDeg != null && (bearingDeg < 0 || bearingDeg > 360)) return null;
    const targetLabel = heading[1].trim().slice(0, 120);
    if (!targetLabel) return null;
    const targetType = targetTypeFrom(targetLabel);
    return {
      coordinate: coordinate.coordinate,
      coordinateIsSource: true,
      observerNumber: observerNumberFrom(line),
      observerRole: observerRoleFrom(line),
      sourceLabel: null,
      bearingDeg,
      distanceKm,
      sourceText: line.slice(0, 240),
      isExplicitObserver: true,
      targetGroupKey: `audio-target:${targetLabel.toLocaleLowerCase()}`,
      targetLabel,
      targetType,
      markerType: targetType === 'reference' ? 'green' : targetType.startsWith('friendly') ? 'blue' : 'red',
      modifiers: {
        underground: /地下|地窖|UNDERGROUND|SUBTERRANEAN/i.test(targetLabel),
        highPriority: /高价值|高优先|优先目标|HIGH\s*(?:VALUE|PRIORITY)/i.test(targetLabel),
        building: /建筑|建筑物|楼内|BUILDING|STRUCTURE/i.test(targetLabel)
      }
    };
  }

  function foDiscoveryReportFromLine(line) {
    const coordinate = coordinateMatches(line)[0];
    if (!coordinate) return null;
    const beforeCoordinate = line.slice(0, coordinate.index);
    const heading = beforeCoordinate.match(/^\s*FO\s*(?:#\s*(\d{1,3}))?\s*发现\s+(.+?)\s*[:：]\s*(.+?)\s*自\s*$/i);
    if (!heading) return null;
    const targetLabel = heading[2].trim().slice(0, 120);
    const measurement = heading[3].trim();
    const distanceMatch = measurement.match(/^(?:距离\s*)?(\d+(?:[.,]\d+)?)\s*(km|公里|千米|m|米)\s*$/i);
    const bearingMatch = distanceMatch ? null : measurement.match(/^(?:方位(?:角)?|方向(?:角)?|\bBEARING\b|\bHEADING\b)?\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:°|DEG(?:REE)?S?)?\s*$/i);
    if (!targetLabel || (!distanceMatch && !bearingMatch)) return null;
    let distanceKm = distanceMatch ? numericValue(distanceMatch[1]) : null;
    if (distanceKm != null && /^(m|米)$/i.test(distanceMatch[2])) distanceKm /= 1000;
    const bearingDeg = bearingMatch ? numericValue(bearingMatch[1]) : null;
    if (distanceKm != null && distanceKm <= 0) return null;
    if (bearingDeg != null && (bearingDeg < 0 || bearingDeg > 360)) return null;
    const targetType = targetTypeFrom(targetLabel);
    return {
      coordinate: coordinate.coordinate,
      coordinateIsSource: true,
      observerNumber: heading[1] == null ? null : Number(heading[1]),
      observerRole: 'observer',
      sourceLabel: null,
      bearingDeg,
      distanceKm,
      sourceText: line.slice(0, 240),
      isExplicitObserver: false,
      targetGroupKey: `audio-target:${targetLabel.toLocaleLowerCase()}`,
      targetLabel,
      targetType,
      markerType: targetType === 'reference' ? 'green' : targetType.startsWith('friendly') ? 'blue' : 'red',
      modifiers: {
        underground: /地下|地窖|UNDERGROUND|SUBTERRANEAN/i.test(targetLabel),
        highPriority: /高价值|高优先|优先目标|HIGH\s*(?:VALUE|PRIORITY)/i.test(targetLabel),
        building: /建筑|建筑物|楼内|BUILDING|STRUCTURE/i.test(targetLabel)
      }
    };
  }

  function requestedShellTypesFrom(text) {
    const shellTypes = [];
    const shellPattern = /(?:\u53d1\u5c04|\bFIRE\b)\s*([A-Z]{2,5})\s*(?:\u5f39|\bSHELL\b)?/gi;
    let match;
    while ((match = shellPattern.exec(text))) {
      const shellType = match[1].toUpperCase();
      if (!shellTypes.includes(shellType)) shellTypes.push(shellType);
    }
    return shellTypes;
  }

  function fireRequestTargetLabelFromLine(line) {
    const match = String(line).match(/^\s*(.+?)(?:\u88ab|\u906d|\u53d7)\S*(?:\u538b\u5236|\u70ae\u706b|\u653b\u51fb|\u88ad\u51fb)[!！]?\s*$/);
    return match ? match[1].trim().slice(0, 120) || null : null;
  }

  function fireRequestReportFromText(text, targetLabel = null) {
    const lines = String(text).split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean);
    const requestLine = lines.find(line => /(?:\u8bf7\u6c42|REQUEST).*(?:\u53d1\u5c04|\bFIRE\b)/i.test(line));
    if (!requestLine) return null;
    const joinedText = lines.join('\n');
    const coordinate = coordinateMatches(joinedText)[0];
    const bearingMatch = joinedText.match(/(?:\u5411\s*)?(?:\u65b9\u4f4d\u89d2?|\bBEARING\b)\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:\u00b0|DEG(?:REE)?S?)?/i);
    const afterCoordinate = coordinate ? joinedText.slice(coordinate.index + coordinate.length) : '';
    const distanceMatch = afterCoordinate.match(/(\d+(?:[.,]\d+)?)\s*(km|\u516c\u91cc|\u5343\u7c73|m|\u7c73)(?:\s*(?:\u5904|\bAT\b))?/i);
    const shellTypes = requestedShellTypesFrom(requestLine);
    const deadlineMatch = joinedText.match(/(?:\u8bf7\u4e8e|\u4e8e|\b(?:BY|BEFORE)\b)\s*(\d{1,2}:\d{2}:\d{2})\s*(?:\u4e4b\u524d|\u524d|\bBEFORE\b)?/i);
    const bearingDeg = bearingMatch ? numericValue(bearingMatch[1]) : null;
    let distanceKm = distanceMatch ? numericValue(distanceMatch[1]) : null;
    if (distanceKm != null && /^(m|\u7c73)$/i.test(distanceMatch[2])) distanceKm /= 1000;
    if (!coordinate || bearingDeg == null || bearingDeg < 0 || bearingDeg > 360 || distanceKm == null || distanceKm <= 0) return null;
    const shellType = shellTypes[0] || null;
    const deadline = deadlineMatch ? normalizeClockTime(deadlineMatch[1]) : null;
    const resolvedTargetLabel = targetLabel || fireRequestTargetLabelFromLine(lines[0]) || '\u706b\u529b\u8bf7\u6c42\u76ee\u6807';
    const targetType = targetTypeFrom(resolvedTargetLabel);
    return {
      coordinate: coordinate.coordinate,
      coordinateIsSource: true,
      observerNumber: null,
      observerRole: 'observer',
      sourceLabel: null,
      bearingDeg,
      distanceKm,
      requestedShellType: shellType,
      requestedShellTypes: shellTypes,
      requestedDeadline: deadline,
      sourceText: joinedText.slice(0, 240),
      isExplicitObserver: false,
      targetGroupKey: `fire-request:${coordinate.coordinate}:${bearingDeg}:${distanceKm}:${shellTypes.join('>')}:${deadline || ''}`,
      targetLabel: resolvedTargetLabel,
      targetType,
      markerType: targetType === 'reference' ? 'green' : targetType.startsWith('friendly') ? 'blue' : 'red',
      modifiers: { underground: false, highPriority: false, building: false }
    };
  }

  function fireRequestReportFromLine(line) {
    return fireRequestReportFromText(line);
  }

  function fireRequestBlocksFromText(text) {
    const lines = String(text).split('\n');
    const blocks = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].replace(/[\t ]+/g, ' ').trim();
      if (!/(?:\u8bf7\u6c42|REQUEST).*(?:\u53d1\u5c04|\bFIRE\b)/i.test(line)) continue;
      const previousLine = index > 0 ? lines[index - 1].replace(/[\t ]+/g, ' ').trim() : '';
      const targetLabel = fireRequestTargetLabelFromLine(previousLine);
      const startIndex = targetLabel ? index - 1 : index;
      let endIndex = index;
      while (endIndex + 1 < lines.length && endIndex - index < 6) {
        const nextLine = lines[endIndex + 1].replace(/[\t ]+/g, ' ').trim();
        if (!nextLine || /^[.。-]+$/.test(nextLine)) break;
        endIndex += 1;
      }
      const report = fireRequestReportFromText(lines.slice(startIndex, endIndex + 1).join('\n'), targetLabel);
      if (report) {
        blocks.push({ startIndex, endIndex, report });
        index = endIndex;
      }
    }
    return blocks;
  }

  function targetTypeFrom(context) {
    const friendly = /友军|友方|我方|ALL(?:Y|IED)/i.test(context);
    if (/参考点|路径点|航路点|WAYPOINT|REFERENCE\s*POINT/i.test(context)) return 'reference';
    if (/炮兵指挥中心|火力指挥中心|\bFDC\b|FIRE\s*DIRECTION/i.test(context)) return friendly ? 'friendly-artillery' : 'enemy-fdc';
    if (/补给仓库|补给地堡|弹药仓库|补给站|SUPPLY|AMMO\s*CACHE/i.test(context)) return friendly ? 'friendly' : 'enemy-supply';
    if (/火炮|炮兵|岸防炮|防空炮|野战炮|ARTILLERY|BATTERY|FIELD\s*GUN/i.test(context)) return friendly ? 'friendly-artillery' : 'enemy-artillery';
    if (/机械化|装甲|坦克|MECHANI[ZS]ED|ARMO(?:U)?R|TANK/i.test(context)) return friendly ? 'friendly-mechanized' : 'enemy-mechanized';
    if (/步兵|海军陆战队|INFANTRY|MARINE/i.test(context)) return friendly ? 'friendly-infantry' : 'enemy-infantry';
    if (/侦察|敌方观测员|RECON|ENEMY\s*SPOTTER/i.test(context)) return friendly ? 'friendly-recon' : 'enemy-recon';
    return friendly ? 'friendly' : 'enemy';
  }

  function classifyContext(context) {
    if (/铁巢|IRON\s*NEST|\bTURRET\b/i.test(context)) return { kind: 'iron-nest' };
    if (/观测员|观测单位|监听哨|前线观察员|SPOTTER|LISTENING\s*POST|\bFO(?:\s*#?\d+)?\b/i.test(context)) {
      return { kind: 'observer', observerNumber: observerNumberFrom(context), observerRole: observerRoleFrom(context) };
    }

    const targetType = targetTypeFrom(context);
    return {
      kind: 'target',
      targetType,
      markerType: targetType === 'reference' ? 'green' : targetType.startsWith('friendly') ? 'blue' : 'red',
      modifiers: {
        underground: /地下|地窖|UNDERGROUND|SUBTERRANEAN/i.test(context),
        highPriority: /高价值|高优先|优先目标|HIGH\s*(?:VALUE|PRIORITY)/i.test(context),
        building: /建筑|建筑物|楼内|BUILDING|STRUCTURE/i.test(context)
      }
    };
  }

  function extractBriefingEntries(value) {
    const text = cleanBriefingText(value);
    const entries = [];
    const seen = new Set();
    let activeTarget = null;
    const lines = text.split('\n');
    const fireRequestLineIndexes = new Set(fireRequestBlocksFromText(text).flatMap(block => {
      const indexes = [];
      for (let index = block.startIndex; index <= block.endIndex; index += 1) indexes.push(index);
      return indexes;
    }));
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (fireRequestLineIndexes.has(lineIndex)) continue;
      const rawLine = lines[lineIndex];
      const line = rawLine.replace(/[\t ]+/g, ' ').trim();
      if (!line) continue;
      if (/^[.。]+$/.test(line)) {
        activeTarget = null;
        continue;
      }
      if (audioObservationReportFromLine(line) || foDiscoveryReportFromLine(line) || fireRequestReportFromLine(line)) continue;
      const heading = line.match(/^(.+?)[：:]\s*$/);
      const headingClassification = heading ? classifyContext(heading[1]) : null;
      if (heading && headingClassification.kind === 'target') {
        activeTarget = { label: heading[1].trim().slice(0, 120), classification: headingClassification };
        continue;
      }
      const activityCoordinate = activityMajorCoordinateFrom(line);
      const matches = activityCoordinate ? [{ coordinate: activityCoordinate }] : coordinateMatches(line);
      for (const match of matches) {
        const context = activeTarget && activityCoordinate ? `${activeTarget.label}：${line}` : line;
        const observation = observationValuesFrom(context);
        const classification = observation.bearingDeg != null || observation.distanceKm != null
          ? { kind: 'observer', observerNumber: observerNumberFrom(context), observerRole: observerRoleFrom(context) }
          : activeTarget && activityCoordinate ? activeTarget.classification : classifyContext(context);
        const key = `${classification.kind}:${match.coordinate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          ...classification,
          coordinate: match.coordinate,
          sourceText: context.slice(0, 240),
          briefingLabel: activeTarget && activityCoordinate ? activeTarget.label : null
        });
      }
    }
    return entries;
  }

  function spottedObservationReportsFromLine(line, targetGroupKey) {
    const spotted = String(line).match(/^(.+?)(?:\u5df2\u53d1\u73b0|\bSPOTTED\b)\s*[\u3002.]?\s*(.+)$/i);
    if (!spotted) return [];
    const targetLabel = spotted[1].trim().slice(0, 120);
    const details = spotted[2].trim();
    if (!targetLabel || !details) return [];
    const classification = classifyContext(targetLabel);
    const reportBase = {
      coordinate: null,
      observerRole: 'observer',
      sourceText: line.slice(0, 240),
      isExplicitObserver: false,
      targetGroupKey,
      targetLabel,
      targetType: classification.targetType,
      markerType: classification.markerType,
      modifiers: classification.modifiers,
      bearingToleranceDeg: null,
      distanceKm: null
    };
    const reports = [];
    const bearingPattern = /\u81ea\s*(.+?)\s*(?:\u7684\s*)?(?:\u65b9\u4f4d(?:\u89d2)?|\u65b9\u5411(?:\u89d2)?)\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:\u00b0|DEG(?:REE)?S?)?/gi;
    let bearingMatch;
    while ((bearingMatch = bearingPattern.exec(details))) {
      const bearingDeg = numericValue(bearingMatch[2]);
      if (bearingDeg == null || bearingDeg < 0 || bearingDeg > 360) continue;
      const sourceLabel = bearingMatch[1].trim().slice(0, 120);
      if (!sourceLabel) continue;
      reports.push({
        ...reportBase,
        sourceLabel,
        observerNumber: observerNumberFrom(sourceLabel),
        observerRole: observerRoleFrom(sourceLabel),
        bearingDeg
      });
    }
    if (reports.length) return reports;

    const compactMatch = details.match(/^(-?\d{1,3}(?:[.,]\d+)?)\s*(?:\u00b0|DEG(?:REE)?S?)?\s*[,\uff0c;\uff1b]?\s*\u8ddd\s*(.+?)\s+(\d+(?:[.,]\d+)?)\s*(km|\u516c\u91cc|\u5343\u7c73|m|\u7c73)\s*(?:[.\u3002\u2026-]\s*)*$/i);
    if (!compactMatch) return [];
    const bearingDeg = numericValue(compactMatch[1]);
    const sourceLabel = compactMatch[2].trim().slice(0, 120);
    let distanceKm = numericValue(compactMatch[3]);
    if (distanceKm != null && /^(m|\u7c73)$/i.test(compactMatch[4])) distanceKm /= 1000;
    if (!sourceLabel || bearingDeg == null || bearingDeg < 0 || bearingDeg > 360 || distanceKm == null || distanceKm <= 0) return [];
    return [{
      ...reportBase,
      sourceLabel,
      observerNumber: observerNumberFrom(sourceLabel),
      observerRole: observerRoleFrom(sourceLabel),
      bearingDeg,
      distanceKm
    }];
  }

  function extractObservationReports(value) {
    const reports = [];
    let activeReport = null;
    let activeTarget = null;
    let nextTargetGroupId = 1;
    const text = cleanBriefingText(value);
    const lines = text.split('\n');
    const fireRequestBlocks = fireRequestBlocksFromText(text);
    const fireRequestByStartIndex = new Map(fireRequestBlocks.map(block => [block.startIndex, block.report]));
    const fireRequestLineIndexes = new Set(fireRequestBlocks.flatMap(block => {
      const indexes = [];
      for (let index = block.startIndex; index <= block.endIndex; index += 1) indexes.push(index);
      return indexes;
    }));
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (fireRequestByStartIndex.has(lineIndex)) {
        const report = fireRequestByStartIndex.get(lineIndex);
        reports.push(report);
        activeReport = report;
        continue;
      }
      if (fireRequestLineIndexes.has(lineIndex)) continue;
      const rawLine = lines[lineIndex];
      const line = rawLine.replace(/[\t ]+/g, ' ').trim();
      if (!line) {
        activeReport = null;
        continue;
      }
      if (/^[.。]+$/.test(line)) {
        activeReport = null;
        activeTarget = null;
        continue;
      }
      const temporaryGridReport = audioObservationReportFromLine(line) || foDiscoveryReportFromLine(line) || fireRequestReportFromLine(line);
      if (temporaryGridReport) {
        reports.push(temporaryGridReport);
        activeReport = temporaryGridReport;
        continue;
      }
      const spottedReports = spottedObservationReportsFromLine(line, `briefing-spotted-${nextTargetGroupId}`);
      if (spottedReports.length) {
        nextTargetGroupId += 1;
        reports.push(...spottedReports);
        activeReport = spottedReports[spottedReports.length - 1];
        activeTarget = null;
        continue;
      }
      const coordinates = coordinateMatches(line);
      const values = observationValuesFrom(line);
      const hasValues = values.bearingDeg != null || values.distanceKm != null;
      const classification = classifyContext(line);
      const observerNumber = observerNumberFrom(line);
      const sourceLabel = sourceLabelFrom(line);
      const isTargetHeading = !coordinates.length && !hasValues && observerNumber == null && classification.kind === 'target' && /[：:]\s*$/.test(line);
      if (isTargetHeading) {
        activeTarget = {
          groupKey: `briefing-target-${nextTargetGroupId++}`,
          label: line.replace(/[：:]\s*$/, '').trim().slice(0, 120),
          targetType: classification.targetType,
          markerType: classification.markerType,
          modifiers: classification.modifiers
        };
        activeReport = null;
        continue;
      }

      const createReport = coordinate => ({
        coordinate: coordinate || null,
        observerNumber,
        observerRole: classification.observerRole || observerRoleFrom(line),
        sourceLabel,
        bearingDeg: values.bearingDeg,
        bearingToleranceDeg: values.bearingToleranceDeg,
        distanceKm: values.distanceKm,
        sourceText: line.slice(0, 240),
        isExplicitObserver: classification.kind === 'observer',
        targetGroupKey: activeTarget?.groupKey || null,
        targetLabel: activeTarget?.label || null,
        targetType: activeTarget?.targetType || null,
        markerType: activeTarget?.markerType || null,
        modifiers: activeTarget?.modifiers || null
      });

      if (coordinates.length && (hasValues || classification.kind === 'observer')) {
        for (const coordinate of coordinates) {
          const report = createReport(coordinate.coordinate);
          reports.push(report);
          activeReport = report;
        }
        continue;
      }
      if (hasValues && (observerNumber != null || sourceLabel != null)) {
        const report = createReport(null);
        reports.push(report);
        activeReport = report;
        continue;
      }
      if (activeReport && hasValues) {
        if (values.bearingDeg != null) {
          activeReport.bearingDeg = values.bearingDeg;
          activeReport.bearingToleranceDeg = values.bearingToleranceDeg;
        }
        if (values.distanceKm != null) activeReport.distanceKm = values.distanceKm;
        activeReport.sourceText = `${activeReport.sourceText} ${line}`.slice(0, 240);
      } else if (coordinates.length) {
        activeReport = null;
      }
    }
    return reports.filter(report => report.bearingDeg != null || report.distanceKm != null);
  }

  function extractRailwayBriefing(value) {
    const text = cleanBriefingText(value);
    let station = null;
    let arrivalTime = null;
    let bearingDeg = null;
    let expectsStation = false;
    let railSection = false;
    let implicitStation = null;
    let carriageCount = null;
    const waypoints = [];
    const seenWaypoints = new Set();

    for (const rawLine of text.split('\n')) {
      const line = rawLine.replace(/[\t ]+/g, ' ').trim();
      if (!line) continue;
      if (/^[.\u3002]+$/.test(line)) {
        expectsStation = false;
        continue;
      }

      const hasStationHeading = /(?:\u5230\u8fbe\u7ad9|\u7ec8\u70b9\u7ad9|\bARRIVAL\s*STATION\b)/i.test(line);
      if (hasStationHeading) expectsStation = true;
      const coordinate = coordinateMatches(line)[0];
      if (coordinate && !station && expectsStation) {
        const name = line.slice(0, coordinate.index)
          .replace(/(?:\u5230\u8fbe\u7ad9|\u7ec8\u70b9\u7ad9|\bARRIVAL\s*STATION\b)\s*[:\uff1a]?/i, '')
          .replace(/[:\uff1a\-\u2013\u2014]\s*$/, '')
          .trim();
        station = { name: name || '\u8f66\u7ad9', coordinate: coordinate.coordinate };
        expectsStation = false;
      } else if (coordinate && !implicitStation && /(?:\u603b\u7ad9|\u8f66\u7ad9|\bSTATION\b)/i.test(line)) {
        const name = line.slice(0, coordinate.index).replace(/[:\uff1a\-\u2013\u2014]\s*$/, '').trim();
        implicitStation = { name: name || '\u8f66\u7ad9', coordinate: coordinate.coordinate };
      }

      const timeMatch = line.match(/(?:\bT\s*=\s*)?(\d{1,2}:\d{2}:\d{2})\b/);
      const trainLengthMatch = line.match(/([0-9]+|[零一二三四五六七八九十两]+)\s*节(?:车厢|车)/);
      if (trainLengthMatch) {
        const parsedCount = positiveChineseInteger(trainLengthMatch[1]);
        if (Number.isInteger(parsedCount) && parsedCount > 0 && parsedCount <= 99) carriageCount = parsedCount;
      }
      if (!arrivalTime && timeMatch && /(?:\u5230\u7ad9\u65f6\u95f4|\u5230\u8fbe\u65f6\u95f4|\u9884\u8ba1\u5230\u7ad9|\bARRIVAL\s*(?:TIME|ETA)\b)/i.test(line)) {
        arrivalTime = timeMatch[1];
      }

      if (/(?:\u8f68\u9053\u8d70\u5411|\u94c1\u8def\u8d70\u5411|\b(?:RAIL|TRACK)\s*(?:BEARING|DIRECTION)\b)/i.test(line)) railSection = true;
      if (railSection && bearingDeg == null) {
        const bearingMatch = line.match(/(?:\u65b9\u4f4d\u89d2?|\bBEARING\b)\s*(?:[:=\uff1a]|\u4e3a|\u662f)?\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:\u00b0|DEG(?:REE)?S?)?/i);
        const candidate = bearingMatch ? numericValue(bearingMatch[1]) : null;
        if (candidate != null && candidate >= 0 && candidate <= 360) bearingDeg = candidate;
      }

      const waypointMatch = line.match(/((?:\u8def\u5f84\u70b9|\u8def\u70b9|\bWAYPOINT)\s*[-\u2013\u2014]?\s*[A-Z0-9]+)/i);
      if (!waypointMatch) continue;
      const distanceMatch = line.match(/(?:\u8ddd(?:\u79bb)?\s*(?:\u8f66\u7ad9|\u7ad9)?\s*)?(\d+(?:[.,]\d+)?)\s*(km|\u516c\u91cc|\u5343\u7c73|m|\u7c73)\b/i);
      let distanceKm = distanceMatch ? numericValue(distanceMatch[1]) : null;
      if (distanceKm != null && /^(m|\u7c73)$/i.test(distanceMatch[2])) distanceKm /= 1000;
      if (distanceKm == null || distanceKm <= 0) continue;
      const label = waypointMatch[1].replace(/\s+/g, ' ').trim();
      const waypointKey = label.toUpperCase();
      if (seenWaypoints.has(waypointKey)) continue;
      seenWaypoints.add(waypointKey);
      waypoints.push({ label, distanceKm, time: timeMatch ? timeMatch[1] : null });
    }

    if (!station && railSection) station = implicitStation;
    if (!station || bearingDeg == null || !waypoints.length) return null;
    return { station, arrivalTime, bearingDeg, waypoints, ...(carriageCount ? { carriageCount } : {}) };
  }

  function normalizeClockTime(value) {
    const input = String(value ?? '').trim();
    const match = input.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
      || input.match(/^(\d{1,2})(\d{2})(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (hours < 0 || hours >= 24 || minutes >= 60 || seconds >= 60) return null;
    return [hours, minutes, seconds].map(part => String(part).padStart(2, '0')).join(':');
  }

  function clockSeconds(value) {
    const normalized = normalizeClockTime(value);
    if (!normalized) return null;
    const [hours, minutes, seconds] = normalized.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }

  function extractMovingTargetBriefings(value) {
    const tracks = [];
    let active = null;
    for (const rawLine of cleanBriefingText(value).split('\n')) {
      const line = rawLine.replace(/[\t ]+/g, ' ').trim();
      if (!line || /^[.。]+$/.test(line)) continue;
      const title = line.match(/^(.+?)(?:已发现|\bSPOTTED\b)\s*[：:]?$/i);
      if (title) {
        active = { label: title[1].trim().slice(0, 120) };
        continue;
      }
      if (!active) continue;
      const coordinate = coordinateMatches(line)[0];
      const time = line.match(/(?:\bT\s*[:=]\s*)?(\d{1,2}:\d{2}:\d{2})\b/);
      if (coordinate && time && /(?:经过|CROSSING|PASSING)/i.test(line)) {
        active.coordinate = coordinate.coordinate;
        active.observedTime = time[1];
        active.observedAtSec = clockSeconds(time[1]);
        continue;
      }
      const course = line.match(/(?:以|AT)\s*(\d+(?:[.,]\d+)?)\s*(?:节|KNOTS?).*?(\d{1,3}(?:[.,]\d+)?)\s*(?:°|DEG(?:REES?)?)?\s*(?:航向|COURSE|HEADING)/i)
        || line.match(/(?:航向|COURSE|HEADING)\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:°|DEG(?:REES?)?)?.*?(\d+(?:[.,]\d+)?)\s*(?:节|KNOTS?)/i);
      if (course) {
        const firstIsSpeed = /^(?:以|AT)/i.test(line);
        active.knots = numericValue(course[firstIsSpeed ? 1 : 2]);
        active.headingDeg = numericValue(course[firstIsSpeed ? 2 : 1]);
        continue;
      }
      const chineseRate = line.match(/(\d+(?:[.,]\d+)?)\s*秒\s*(?:航行|行驶|行进)\s*(\d+(?:[.,]\d+)?)\s*(?:千米|公里|km)/i);
      const englishRate = line.match(/(\d+(?:[.,]\d+)?)\s*(?:km|KILOMETERS?)\s*(?:TRAVELED|TRAVELLED)\s*(?:IN|PER)\s*(\d+(?:[.,]\d+)?)\s*S(?:EC(?:ONDS?)?)?/i);
      const rate = chineseRate ? { seconds: numericValue(chineseRate[1]), distance: numericValue(chineseRate[2]) }
        : englishRate ? { seconds: numericValue(englishRate[2]), distance: numericValue(englishRate[1]) } : null;
      if (rate?.seconds > 0 && rate.distance > 0) active.speedKmPerSec = rate.distance / rate.seconds;
      if (active.coordinate && active.observedAtSec != null && active.headingDeg != null && active.speedKmPerSec > 0) {
        tracks.push({ ...active, headingDeg: ((active.headingDeg % 360) + 360) % 360 });
        active = null;
      }
    }
    return tracks;
  }

  function extractImpactCorrectionBriefings(value) {
    const corrections = [];
    let active = null;
    for (const rawLine of cleanBriefingText(value).split('\n')) {
      const line = rawLine.replace(/[\t ]+/g, ' ').trim();
      if (!line) continue;
      const impactMatch = line.match(/(?:在|于)\s*(?:(\d{1,2}:\d{2}:\d{2})\s*时\s*)?([A-T])\s*(10|[1-9])\s*(?:发现)?落点/i);
      if (impactMatch) {
        active = { reportedTime: impactMatch[1] ? normalizeClockTime(impactMatch[1]) : null, reportedArea: `${impactMatch[2].toUpperCase()}${impactMatch[3]}`, targetLabel: null, targetType: null, markerType: null, bearingDeg: null, distanceKm: null };
        continue;
      }
      if (!active) continue;
      const targetMatch = line.match(/(?:最近敌方|最近目标|NEAREST\s*(?:ENEMY|TARGET))\s*[:：]\s*(.+?)\s*[。.]?$/i);
      if (targetMatch) {
        active.targetLabel = targetMatch[1].trim().slice(0, 120);
        active.targetType = targetTypeFrom(active.targetLabel);
        active.markerType = active.targetType === 'reference' ? 'green' : active.targetType.startsWith('friendly') ? 'blue' : 'red';
        continue;
      }
      const bearingMatch = line.match(/(?:方位(?:角)?|方向(?:角)?)\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:°|DEG(?:REE)?S?)?/i);
      const distanceMatch = line.match(/(?:距(?:离)?\s*(?:落点|着弹点|IMPACT(?:\s*POINT)?)|距离)\s*(\d+(?:[.,]\d+)?)\s*(km|公里|千米|m|米)/i);
      const bearingDeg = bearingMatch ? numericValue(bearingMatch[1]) : null;
      let distanceKm = distanceMatch ? numericValue(distanceMatch[1]) : null;
      if (distanceKm != null && /^(m|米)$/i.test(distanceMatch[2])) distanceKm /= 1000;
      if (bearingDeg != null && bearingDeg >= 0 && bearingDeg <= 360) active.bearingDeg = bearingDeg;
      if (distanceKm != null && distanceKm > 0) active.distanceKm = distanceKm;
      if (active.targetLabel && active.bearingDeg != null && active.distanceKm != null) {
        corrections.push({
          reportedTime: active.reportedTime,
          reportedArea: active.reportedArea,
          targetLabel: active.targetLabel,
          targetType: active.targetType,
          markerType: active.markerType,
          bearingDeg: active.bearingDeg,
          distanceKm: active.distanceKm,
          modifiers: { underground: false, highPriority: false, building: false }
        });
        active = null;
      }
    }
    return corrections;
  }

  return Object.freeze({ cleanBriefingText, extractBriefingEntries, extractObservationReports, extractRailwayBriefing, extractMovingTargetBriefings, extractImpactCorrectionBriefings, normalizeClockTime, clockSeconds, sourceLabelFrom, targetTypeFrom, groupObservationReports });
});
