const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../../src/shared/briefing-parser.js');

test('extracts and classifies game briefing grid coordinates', () => {
  const entries = parser.extractBriefingEntries(`
    <b>铁巢</b> - B2 5:5
    观测单位：
    友方观测员#3 - C3 7:7
    地下高价值敌方炮兵指挥中心#1 已发现。坐标 G6 9:1
    参考点A 位于 D4 2:0
  `);

  assert.deepEqual(entries.map(({ kind, coordinate }) => ({ kind, coordinate })), [
    { kind: 'iron-nest', coordinate: 'B2 5:5' },
    { kind: 'observer', coordinate: 'C3 7:7' },
    { kind: 'target', coordinate: 'G6 9:1' },
    { kind: 'target', coordinate: 'D4 2:0' }
  ]);
  assert.equal(entries[1].observerNumber, 3);
  assert.equal(entries[2].targetType, 'enemy-fdc');
  assert.deepEqual(entries[2].modifiers, { underground: true, highPriority: true, building: false });
  assert.equal(entries[3].targetType, 'reference');
  assert.equal(entries[3].markerType, 'green');
});

test('accepts compact and lower-case coordinates without treating times as coordinates', () => {
  const entries = parser.extractBriefingEntries('T=10:16:50\n敌方步兵位于 a320\n友军机械化部队：T10 9:9');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(entry => [entry.coordinate, entry.targetType, entry.markerType]), [
    ['A3 2:0', 'enemy-infantry', 'red'],
    ['T10 9:9', 'friendly-mechanized', 'blue']
  ]);
});

test('deduplicates repeated coordinates of the same entity kind', () => {
  const entries = parser.extractBriefingEntries('铁巢：B2 5:5\n检查铁巢位置 B2 5:5');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].coordinate, 'B2 5:5');
});

test('reads pasted observer bearing and distance reports from the game briefing format', () => {
  const text = 'Observer #7 B2 2:0 | Bearing: 90.0° | Distance: 2.50 km';
  const entries = parser.extractBriefingEntries(text);
  const reports = parser.extractObservationReports(text);
  assert.deepEqual(entries.map(entry => [entry.kind, entry.coordinate, entry.observerNumber]), [['observer', 'B2 2:0', 7]]);
  assert.deepEqual(reports.map(report => [report.coordinate, report.observerNumber, report.bearingDeg, report.distanceKm]), [['B2 2:0', 7, 90, 2.5]]);
});

test('collects split-line observation data and converts metres to kilometres', () => {
  const reports = parser.extractObservationReports('FO #4 C3 7:7\nBearing = 270.5\nDistance: 450 m');
  assert.deepEqual(reports.map(report => [report.coordinate, report.observerNumber, report.bearingDeg, report.distanceKm]), [['C3 7:7', 4, 270.5, 0.45]]);
});

test('reads cardinal-direction distance reports from listening posts', () => {
  const reports = parser.extractObservationReports(`
    监听哨#1位于 <b>M6 5:7</b> 音频报告：
    <b>岸防炮台#1</b>：
    自<b>监听哨#1</b> <b>3.73km</b> <b>南</b>
    .
    <b>岸防炮台#2</b>：
    自<b>监听哨#1</b> <b>4.87km</b> <b>南</b>
  `);
  assert.deepEqual(reports.map(report => [report.targetLabel, report.sourceLabel, report.observerNumber, report.observerRole, report.bearingDeg, report.distanceKm]), [
    ['岸防炮台#1', '监听哨#1', 1, 'listener', 180, 3.73],
    ['岸防炮台#2', '监听哨#1', 1, 'listener', 180, 4.87]
  ]);
});

test('reads game audio reports with a distance measured from a temporary grid source', () => {
  const text = `
    FO#2 音频报告 皇家海军罗金厄姆号: 5.12km 自 L2 3:1 . . .
      - - -
    FO 音频报告 皇家海军罗金厄姆号: 6.15km 自 F2 9:7 . . .
  `;
  const reports = parser.extractObservationReports(text);
  assert.deepEqual(reports.map(report => [report.targetLabel, report.targetGroupKey, report.coordinate, report.coordinateIsSource, report.observerNumber, report.distanceKm, report.targetType]), [
    ['皇家海军罗金厄姆号', 'audio-target:皇家海军罗金厄姆号', 'L2 3:1', true, 2, 5.12, 'enemy'],
    ['皇家海军罗金厄姆号', 'audio-target:皇家海军罗金厄姆号', 'F2 9:7', true, null, 6.15, 'enemy']
  ]);
  assert.deepEqual(parser.extractBriefingEntries(text), []);
});

test('reads game audio reports with bearings measured from temporary grid sources', () => {
  const reports = parser.extractObservationReports(`
    FO#2 音频报告 敌方信号站: 方位角 45° 自 L2 3:1 . . .
    FO 音频报告 敌方信号站: 270° 自 F2 9:7 . . .
  `);
  assert.deepEqual(reports.map(report => [report.targetLabel, report.coordinate, report.coordinateIsSource, report.observerNumber, report.bearingDeg, report.distanceKm]), [
    ['敌方信号站', 'L2 3:1', true, 2, 45, null],
    ['敌方信号站', 'F2 9:7', true, null, 270, null]
  ]);
});

test('reads FO discovery bearings from temporary grid sources without creating observers', () => {
  const text = `
    FO#2发现 皇家海军罗金厄姆号: 002 自 K2 1:1 . . .
    - - -
    FO发现 皇家海军罗金厄姆号: 049 自 F2 3:7 . . .
  `;
  const reports = parser.extractObservationReports(text);
  assert.deepEqual(reports.map(report => [report.targetLabel, report.targetGroupKey, report.coordinate, report.coordinateIsSource, report.observerNumber, report.bearingDeg]), [
    ['皇家海军罗金厄姆号', 'audio-target:皇家海军罗金厄姆号', 'K2 1:1', true, 2, 2],
    ['皇家海军罗金厄姆号', 'audio-target:皇家海军罗金厄姆号', 'F2 3:7', true, null, 49]
  ]);
  assert.deepEqual(parser.extractBriefingEntries(text), []);
});

test('reads FO discovery distances from temporary grid sources without creating observers', () => {
  const text = `
    FO#2发现 皇家海军罗金厄姆号: 5.12km 自 L2 3:1 . . .
    - - -
    FO发现 皇家海军罗金厄姆号: 6.15km 自 F2 9:7 . . .
  `;
  const reports = parser.extractObservationReports(text);
  assert.deepEqual(reports.map(report => [report.targetLabel, report.coordinate, report.coordinateIsSource, report.observerNumber, report.bearingDeg, report.distanceKm]), [
    ['皇家海军罗金厄姆号', 'L2 3:1', true, 2, null, 5.12],
    ['皇家海军罗金厄姆号', 'F2 9:7', true, null, null, 6.15]
  ]);
  assert.deepEqual(parser.extractBriefingEntries(text), []);
});

test('keeps mixed FO bearing and distance reports in one temporary target group', () => {
  const text = `
    FO#12发现 幽灵炮台: 114 自 D5 5:3 . . .
    - - -
    FO#11 音频报告 幽灵炮台: 1.32km 自 C5 9:2 . . .
    - - -
    FO#10发现 幽灵炮台: 184 自 E7 4:6 . . .
  `;
  const reports = parser.extractObservationReports(text);
  assert.deepEqual(parser.extractBriefingEntries(text), []);
  assert.deepEqual(reports.map(report => [report.targetGroupKey, report.coordinate, report.bearingDeg, report.distanceKm]), [
    ['audio-target:幽灵炮台', 'D5 5:3', 114, null],
    ['audio-target:幽灵炮台', 'C5 9:2', null, 1.32],
    ['audio-target:幽灵炮台', 'E7 4:6', 184, null]
  ]);
});

test('reads bearing-distance fire requests from a friendly position without creating an observer', () => {
  const text = '请求向方位角 <b>201°</b>、距我方阵地 <b>N3 3:9</b> <b>0.98km</b>处发射<u><b>HE弹</b></u>，请于 <u>10:09:08</u>之前';
  const reports = parser.extractObservationReports(text);
  assert.deepEqual(parser.extractBriefingEntries(text), []);
  assert.deepEqual(reports.map(report => [report.coordinate, report.coordinateIsSource, report.bearingDeg, report.distanceKm, report.requestedShellType, report.requestedDeadline, report.targetLabel, report.targetType]), [
    ['N3 3:9', true, 201, 0.98, 'HE', '10:09:08', '火力请求目标', 'enemy']
  ]);
});

test('reads multi-line ordered fire requests without treating the friendly grid as an observer', () => {
  const text = `
    步兵#10被据点炮火压制!
    请求先发射<u><b>TEAR弹</b></u>，再发射<u><b>HE弹</b></u>，
    方位角 <b>275°</b>，距我方阵地 <b>N3 3:4</b> <b>1.26km</b>
    <u>注意：</u>先发射<u><b>TEAR弹</b></u>，再发射<u><b>HE弹</b></u>。
    请于 <u>10:11:43</u>前响应
  `;
  const reports = parser.extractObservationReports(text);
  assert.deepEqual(parser.extractBriefingEntries(text), []);
  assert.deepEqual(reports.map(report => [report.coordinate, report.coordinateIsSource, report.bearingDeg, report.distanceKm, report.requestedShellType, report.requestedShellTypes, report.requestedDeadline, report.targetLabel, report.targetType]), [
    ['N3 3:4', true, 275, 1.26, 'TEAR', ['TEAR', 'HE'], '10:11:43', '步兵#10', 'enemy-infantry']
  ]);
});

test('reads activity-grid reports and observer measurement tables with sixteen-wind bearings', () => {
  const text = `
    敌方信号站：
      报告活动于坐标 <b>G5</b>
    .
    <b>敌方集结区</b>：
      <b>观测员#2</b>：<b>7.68km</b>
      <b>观测员#3</b>：<b>269°</b>
      <b>观测员#1</b>：<b>西北偏西</b>
    .
    <b>敌方野战指挥部</b>：
      <b>观测员#2</b>：<b>9.18km</b>
      <b>观测员#3</b>：<b>西南偏西</b>
      <b>观测员#1</b>：<b>西</b>
  `;
  assert.deepEqual(parser.extractBriefingEntries(text).map(entry => [entry.coordinate, entry.kind, entry.targetType, entry.briefingLabel]), [
    ['G5 5:5', 'target', 'enemy', '敌方信号站']
  ]);
  assert.deepEqual(parser.extractObservationReports(text).map(report => [report.targetLabel, report.observerNumber, report.bearingDeg, report.bearingToleranceDeg, report.distanceKm]), [
    ['敌方集结区', 2, null, null, 7.68],
    ['敌方集结区', 3, 269, null, null],
    ['敌方集结区', 1, 292.5, 11.25, null],
    ['敌方野战指挥部', 2, null, null, 9.18],
    ['敌方野战指挥部', 3, 247.5, 11.25, null],
    ['敌方野战指挥部', 1, 270, 11.25, null]
  ]);
});

test('reads moving-target time, position, course, and briefing speed conversion', () => {
  const tracks = parser.extractMovingTargetBriefings(`
    皇家邮轮卢西塔尼亚号已发现：
      在 <b>T:11:11:08</b> 时经过 <b>R1 4:8</b>。
      以9.7节速度航行12°航向。
      9.7节 = 20秒行驶0.10千米。
      9.7节 = 3分20秒行驶1.00千米。
  `);
  assert.deepEqual(tracks, [{
    label: '皇家邮轮卢西塔尼亚号', coordinate: 'R1 4:8', observedTime: '11:11:08', observedAtSec: 40268,
    knots: 9.7, headingDeg: 12, speedKmPerSec: 0.005
  }]);
});

test('keeps heading-based observer reports separated by their target', () => {
  const reports = parser.extractObservationReports(`
    <b>步兵#1:</b>
    自<b>观测员#1</b>的方位角231°
    自<b>观测员#2</b>的方位角263°
    .
    <b>步兵#2:</b>
    自<b>观测员#2</b>的方位角285°
    自<b>观测员#3</b>的方位角343°
    .
    <b>步兵#3:</b>
    自<b>观测员#1</b>的距离10.83km
    自<b>观测员#3</b>的距离4.66km
  `);

  assert.deepEqual(reports.map(report => [report.targetLabel, report.observerNumber, report.bearingDeg, report.distanceKm, report.targetType]), [
    ['步兵#1', 1, 231, null, 'enemy-infantry'],
    ['步兵#1', 2, 263, null, 'enemy-infantry'],
    ['步兵#2', 2, 285, null, 'enemy-infantry'],
    ['步兵#2', 3, 343, null, 'enemy-infantry'],
    ['步兵#3', 1, null, 10.83, 'enemy-infantry'],
    ['步兵#3', 3, null, 4.66, 'enemy-infantry']
  ]);
});

test('uses independent groups for every target heading, including repeated and non-infantry types', () => {
  const reports = parser.extractObservationReports(`
    <b>友军火炮#1:</b>
    自<b>观测员#1</b>的方位角45°
    <b>参考点 ALPHA:</b>
    自<b>观测员#2</b>的距离1.20km
    <b>友军火炮#1:</b>
    自<b>观测员#3</b>的方位角90°
  `);

  assert.deepEqual(reports.map(report => [report.targetLabel, report.targetGroupKey, report.targetType, report.markerType]), [
    ['友军火炮#1', 'briefing-target-1', 'friendly-artillery', 'blue'],
    ['参考点 ALPHA', 'briefing-target-2', 'reference', 'green'],
    ['友军火炮#1', 'briefing-target-3', 'friendly-artillery', 'blue']
  ]);
});

test('extracts the game railway reinforcement briefing without treating route points as targets', () => {
  const railway = parser.extractRailwayBriefing(`
    到达站：
      穆拉谷地<b>总站</b>: <b>J6 0:4</b>
    .
    估计到站时间：T=<u><b>10:16:50</b></u>
    .
    轨道走向：
      铁路线走向笔直。自<b>总站</b>的方位角 <b>090</b>° .
    .
    最终进入段：
      <b>路径点-A</b> - 距车站<b>6.00km</b>：T=<u><b>10:06:50</b></u>
      <b>路径点-B</b> - 距车站<b>4.00km</b>：T=<u><b>10:10:10</b></u>
      <b>路径点-C</b> - 距车站<b>2.00km</b>：T=<u><b>10:13:30</b></u>
  `);

  assert.deepEqual(railway, {
    station: { name: '穆拉谷地总站', coordinate: 'J6 0:4' },
    arrivalTime: '10:16:50',
    bearingDeg: 90,
    waypoints: [
      { label: '路径点-A', distanceKm: 6, time: '10:06:50' },
      { label: '路径点-B', distanceKm: 4, time: '10:10:10' },
      { label: '路径点-C', distanceKm: 2, time: '10:13:30' }
    ]
  });
});

test('recognizes a railway station line even when the copied briefing omits the arrival-station heading', () => {
  const railway = parser.extractRailwayBriefing(`
    穆拉谷地<b>总站</b>: <b>J6 0:4</b>
    .
    估计到站时间：T=<u><b>10:16:50</b></u>
    .
    轨道走向：
      铁路线走向笔直。自<b>总站</b>的方位角 <b>090</b>° .
    .
    最终进入段：
      <b>路径点-A</b> - 距车站<b>6.00km</b>：T=<u><b>10:06:50</b></u>
      <b>路径点-B</b> - 距车站<b>4.00km</b>：T=<u><b>10:10:10</b></u>
      <b>路径点-C</b> - 距车站<b>2.00km</b>：T=<u><b>10:13:30</b></u>
  `);

  assert.equal(railway.station.coordinate, 'J6 0:4');
  assert.equal(railway.station.name, '穆拉谷地总站');
  assert.equal(railway.bearingDeg, 90);
  assert.equal(railway.waypoints.length, 3);
});

test('reads train carriage count from a railway briefing composition line', () => {
  const railway = parser.extractRailwayBriefing(`
    到达站：
      穆拉谷地总站: J6 0:4
    估计到站时间：T=10:16:50
    轨道走向：铁路线走向笔直。自总站的方位角 090°。
    最终进入段：
      路径点-A - 距车站6.00km：T=10:06:50
      路径点-B - 距车站4.00km：T=10:10:10
    列车已确认进入通道。五节车厢，机车在前，运兵车在后。
  `);

  assert.equal(railway.carriageCount, 5);
});

test('preserves named observation sources for chained briefing calculations', () => {
  const reports = parser.extractObservationReports(`
    敌方信号站:
      自<b>观测员#1</b>的距离<b>2.52km</b>
      自<b>观测员#2</b>的距离<b>1.49km</b>
      自<b>观测员#3</b>的距离<b>11.46km</b>
    .
    <b>敌方集结区</b>:
      自<b>敌方信号站</b>的方位角<b>244</b>°
      自<b>观测员#1</b>的方位角<b>272</b>°
    .
    <b>敌方野战指挥部</b>:
      自<b>敌方信号站</b>的方位角<b>249</b>°
      自<b>敌方集结区</b>的距离<b>4.32km</b>
  `);

  assert.deepEqual(reports.map(report => [report.targetLabel, report.sourceLabel, report.observerNumber, report.bearingDeg, report.distanceKm]), [
    ['敌方信号站', '观测员#1', 1, null, 2.52],
    ['敌方信号站', '观测员#2', 2, null, 1.49],
    ['敌方信号站', '观测员#3', 3, null, 11.46],
    ['敌方集结区', '敌方信号站', null, 244, null],
    ['敌方集结区', '观测员#1', 1, 272, null],
    ['敌方野战指挥部', '敌方信号站', null, 249, null],
    ['敌方野战指挥部', '敌方集结区', null, null, 4.32]
  ]);
});

test('keeps compact reference-point headings available to chained reports', () => {
  const reports = parser.extractObservationReports(`
    参考点<b>Alpha</b>:
      自<b>观测员#1</b>的方位角<b>343°</b>
      自<b>观测员#2</b>的距离<b>4.53km</b>
    .
    <b>敌方炮兵指挥中心#1</b>:
      自<b>Alpha</b>的方位角<b>289°</b>
      自<b>观测员#3</b>的方位角<b>303°</b>
  `);
  assert.deepEqual(reports.map(report => [report.targetLabel, report.sourceLabel, report.bearingDeg, report.distanceKm]), [
    ['参考点Alpha', '观测员#1', 343, null],
    ['参考点Alpha', '观测员#2', null, 4.53],
    ['敌方炮兵指挥中心#1', 'Alpha', 289, null],
    ['敌方炮兵指挥中心#1', '观测员#3', 303, null]
  ]);
});

test('normalizes compact mission clocks for interception inputs', () => {
  assert.equal(parser.normalizeClockTime('111108'), '11:11:08');
  assert.equal(parser.normalizeClockTime('91108'), '09:11:08');
  assert.equal(parser.normalizeClockTime('11:11:08'), '11:11:08');
  assert.equal(parser.clockSeconds('111108'), 40268);
  assert.equal(parser.normalizeClockTime('246060'), null);
});

test('reads impact-correction reports that require a manually entered impact point', () => {
  const corrections = parser.extractImpactCorrectionBriefings(`
    在 <u>11:12:43</u> 时 <b>Q8</b> 发现落点。
    - 最近敌方：<b>防空炮#1</b>
      方位角 <b>182°</b>
      距落点 <b>1.91km</b>。
  `);
  assert.deepEqual(corrections, [{
    reportedTime: '11:12:43', reportedArea: 'Q8', targetLabel: '防空炮#1', targetType: 'enemy-artillery', markerType: 'red',
    bearingDeg: 182, distanceKm: 1.91,
    modifiers: { underground: false, highPriority: false, building: false }
  }]);
});

test('读取可用于反推的同行方位与距离关系', () => {
  const reports = parser.extractObservationReports(`
敌方防空炮:
  自<b>敌方炮兵指挥中心#2</b>的方位角<b>275°</b>及距离<b>10.59km</b>
  `);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].targetLabel, '敌方防空炮');
  assert.equal(reports[0].sourceLabel, '敌方炮兵指挥中心#2');
  assert.equal(reports[0].bearingDeg, 275);
  assert.equal(reports[0].distanceKm, 10.59);
});

test('reads compact spotted reports with repeated observer bearings or an implicit bearing-distance pair', () => {
  const bearingReports = parser.extractObservationReports('\u76ee\u6807#5\u5df2\u53d1\u73b0\u3002\u81ea<b>\u89c2\u6d4b\u5458#3</b>\u65b9\u4f4d\u89d2<b>093\u00b0</b>\uff0c\u81ea<b>\u89c2\u6d4b\u5458#2</b>\u65b9\u4f4d\u89d2<b>093\u00b0</b>');
  assert.deepEqual(bearingReports.map(report => [report.targetLabel, report.targetGroupKey, report.sourceLabel, report.observerNumber, report.bearingDeg, report.distanceKm]), [
    ['\u76ee\u6807#5', 'briefing-spotted-1', '\u89c2\u6d4b\u5458#3', 3, 93, null],
    ['\u76ee\u6807#5', 'briefing-spotted-1', '\u89c2\u6d4b\u5458#2', 2, 93, null]
  ]);

  const distanceReport = parser.extractObservationReports('<b>\u8865\u7ed9\u4ed3\u5e93#4</b>\u5df2\u53d1\u73b0\u3002<b>095</b>\uff0c\u8ddd<b>\u89c2\u6d4b\u5458#3</b> <b>12.92km</b> . . .');
  assert.deepEqual(distanceReport.map(report => [report.targetLabel, report.sourceLabel, report.observerNumber, report.bearingDeg, report.distanceKm, report.targetType]), [
    ['\u8865\u7ed9\u4ed3\u5e93#4', '\u89c2\u6d4b\u5458#3', 3, 95, 12.92, 'enemy-supply']
  ]);
});

test('merges same-name FO audio observations into one unambiguous regular briefing target group', () => {
  const groups = parser.groupObservationReports([
    { targetGroupKey: 'briefing-target-1', targetLabel: '\u5730\u5821#2', bearingDeg: 0 },
    { targetGroupKey: 'briefing-target-1', targetLabel: '\u5730\u5821#2', distanceKm: 0.77 },
    { targetGroupKey: 'audio-target:\u5730\u5821#2', targetLabel: '\u5730\u5821#2', distanceKm: 1.08 },
    { targetGroupKey: 'audio-target:\u5730\u5821#2', targetLabel: '\u5730\u5821#2', distanceKm: 1.16 }
  ]);
  assert.equal(groups.size, 1);
  assert.equal(groups.get('briefing-target-1').length, 4);
});
