const test = require('node:test');
const assert = require('node:assert/strict');
const cards = require('../../src/shared/tactical-cards.js');

test('目标资料卡按标记颜色提供默认目标类型', () => {
  assert.equal(cards.normalizeTargetProfile({ markerType: 'red' }).targetType, 'custom');
  assert.equal(cards.normalizeTargetProfile({ markerType: 'blue', targetType: 'friendly' }).targetType, 'custom');
  assert.equal(cards.normalizeTargetProfile({ markerType: 'green', targetType: 'reference', typeSelected: true }).targetType, 'reference');
  assert.equal(cards.normalizeTargetProfile({ markerType: 'red', targetType: 'enemy-fdc' }).targetType, 'enemy-fdc');
});

test('目标资料卡规范化修饰词条、备注和边框色', () => {
  const profile = cards.normalizeTargetProfile({
    markerType: 'red', targetType: 'enemy-fdc', typeSelected: true,
    modifiers: { underground: 1, building: true }, note: '  FDC 掩体  '
  });
  assert.deepEqual(profile.modifiers, { underground: true, highPriority: false, building: true });
  assert.equal(profile.note, 'FDC 掩体');
  assert.equal(cards.targetTone(profile), 'red');
  assert.equal(cards.targetTone({ markerType: 'green', targetType: 'reference', typeSelected: true }), 'green');
});

test('目标资料卡保留特别关注状态', () => {
  assert.equal(cards.normalizeTargetProfile({ markerType: 'red', markerCode: '1', focused: true }).focused, true);
  assert.equal(cards.normalizeTargetProfile({ markerType: 'red', markerCode: '1' }).focused, false);
});

test('资料卡具体类型按红绿蓝标记颜色过滤且都保留自定义标记', () => {
  assert.deepEqual(cards.targetTypesForMarker('red'), ['custom', 'enemy', 'enemy-infantry', 'enemy-recon', 'enemy-artillery', 'enemy-mechanized', 'enemy-fdc', 'enemy-supply']);
  assert.deepEqual(cards.targetTypesForMarker('green'), ['custom', 'reference']);
  assert.deepEqual(cards.targetTypesForMarker('blue'), ['custom', 'friendly', 'friendly-infantry', 'friendly-recon', 'friendly-artillery', 'friendly-mechanized']);
});

test('自定义标记与具体单位类型各自解析到正确的 SVG 图标', () => {
  assert.equal(cards.iconIdForTarget({ markerType: 'blue', markerCode: '7', targetType: 'custom' }), 'marker-blue-7');
  assert.equal(cards.iconIdForTarget({ markerType: 'red', markerCode: '3', targetType: 'enemy-fdc', typeSelected: true }), 'unit-enemy-fdc');
});

test('具体目标类型使用独立编号而不占用自定义标记编号', () => {
  const named = cards.assignDisplayNames([
    { markerType: 'red', markerCode: '1', targetType: 'enemy-infantry', typeSelected: true },
    { markerType: 'blue', markerCode: '1', targetType: 'friendly-infantry', typeSelected: true },
    { markerType: 'green', markerCode: 'A', targetType: 'reference', typeSelected: true },
    { markerType: 'red', markerCode: '2', targetType: 'custom', name: '红色#2' }
  ]);
  assert.deepEqual(named.map(target => target.name), ['步兵#1', '步兵#2', 'ALPHA', '红色#2']);
});
