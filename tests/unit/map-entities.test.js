const test = require('node:test');
const assert = require('node:assert/strict');
const entities = require('../../src/shared/map-entities.js');

test('观测员编号只接受 1–999 的整数', () => {
  assert.equal(entities.normalizeObserverNumber('12'), 12);
  for (const value of [0, 1.5, 1000, 'abc']) {
    assert.throws(() => entities.normalizeObserverNumber(value), /1–999/);
  }
});

test('目标标记类型限制对应编号范围', () => {
  assert.deepEqual(entities.normalizeTargetMarker('red', 10), { markerType: 'red', markerCode: '10' });
  assert.deepEqual(entities.normalizeTargetMarker('green', 'e'), { markerType: 'green', markerCode: 'E' });
  assert.throws(() => entities.normalizeTargetMarker('green', 1), /编号无效/);
  assert.throws(() => entities.normalizeTargetMarker('yellow', 1), /目标类型/);
});

test('绿色标记使用北约音标且重复名称增加数字后缀', () => {
  const named = entities.assignTargetNames([
    { id: 1, markerType: 'green', markerCode: 'A' },
    { id: 2, markerType: 'green', markerCode: 'A' },
    { id: 3, markerType: 'green', markerCode: 'E' },
    { id: 4, markerType: 'red', markerCode: '1' },
    { id: 5, markerType: 'red', markerCode: '1' }
  ]);
  assert.deepEqual(named.map(target => target.name), ['ALPHA', 'ALPHA-2', 'ECHO', '红色#1', '红色#1-2']);
});

test('简报多解优先显示其独立身份，而不是下一个绿色标记名', () => {
  const named = entities.assignTargetNames([
    { id: 1, markerType: 'green', markerCode: 'A', briefingId: 'Alpha' },
    { id: 2, markerType: 'green', markerCode: 'A', briefingId: 'Alpha-2' }
  ]);
  assert.deepEqual(named.map(target => target.name), ['Alpha', 'Alpha-2']);
});
