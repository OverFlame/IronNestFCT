const test = require('node:test');
const assert = require('node:assert/strict');
const grid = require('../../src/shared/grid-coordinate');

test('地图四角映射到约定坐标', () => {
  assert.equal(grid.worldToGrid(0, 0).coordinate, 'A1 0:0');
  assert.equal(grid.worldToGrid(19.999999, 9.999999).coordinate, 'T10 9:9');
});

test('世界坐标按从左到右、从下到上编号', () => {
  assert.equal(grid.worldToGrid(2.75, 2.75).coordinate, 'C3 7:7');
  assert.equal(grid.worldToGrid(0.95, 4.35).coordinate, 'A5 9:3');
});

test('文本坐标允许常见空格并规范化', () => {
  assert.equal(grid.normalizeGridCoordinate(' c3  7 : 7 '), 'C3 7:7');
  assert.equal(grid.normalizeGridCoordinate('t10 9:9'), 'T10 9:9');
});

test('紧凑坐标不分大小写并自动展开', () => {
  assert.equal(grid.normalizeGridCoordinate('A320'), 'A3 2:0');
  assert.equal(grid.normalizeGridCoordinate('a320'), 'A3 2:0');
  assert.equal(grid.normalizeGridCoordinate('t1099'), 'T10 9:9');
  assert.equal(grid.gridToWorld('c377').coordinate, 'C3 7:7');
});

test('文本坐标定位到小格中心', () => {
  assert.deepEqual(grid.gridToWorld('C3 7:7'), {
    xKm: 2.75,
    yKm: 2.75,
    coordinate: 'C3 7:7',
    major: 'C3',
    column: 'C',
    row: 3,
    minorX: 7,
    minorY: 7
  });
  assert.deepEqual(grid.gridToWorld('A5 9:3'), {
    xKm: 0.95,
    yKm: 4.35,
    coordinate: 'A5 9:3',
    major: 'A5',
    column: 'A',
    row: 5,
    minorX: 9,
    minorY: 3
  });
});

test('小格边界宽高均为 100 米', () => {
  assert.deepEqual(grid.minorCellBounds('C3 7:7'), {
    xMinKm: 2.7,
    yMinKm: 2.7,
    xMaxKm: 2.8,
    yMaxKm: 2.8
  });
});

test('拒绝地图外坐标和错误格式', () => {
  assert.throws(() => grid.worldToGrid(-0.01, 0), RangeError);
  assert.throws(() => grid.worldToGrid(20, 10), RangeError);
  assert.throws(() => grid.gridToWorld('U1 0:0'), SyntaxError);
  assert.throws(() => grid.gridToWorld('A0 0:0'), SyntaxError);
  assert.throws(() => grid.gridToWorld('A1 10:0'), SyntaxError);
});
