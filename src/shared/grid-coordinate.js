(function exposeGridCoordinate(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IronNestGrid = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGridCoordinateApi() {
  'use strict';

  const COLUMN_LETTERS = 'ABCDEFGHIJKLMNOPQRST';
  const WORLD_WIDTH_KM = 20;
  const WORLD_HEIGHT_KM = 10;
  const MAJOR_CELL_KM = 1;
  const MINOR_CELL_KM = 0.1;
  const cleanKm = value => Number(value.toFixed(10));

  function assertWorldPoint(xKm, yKm) {
    if (!Number.isFinite(xKm) || !Number.isFinite(yKm)) {
      throw new TypeError('世界坐标必须是有限数字');
    }
    if (xKm < 0 || xKm >= WORLD_WIDTH_KM || yKm < 0 || yKm >= WORLD_HEIGHT_KM) {
      throw new RangeError('坐标超出 A1–T10 地图范围');
    }
  }

  function worldToGrid(xKm, yKm) {
    assertWorldPoint(xKm, yKm);
    const columnIndex = Math.floor(xKm);
    const rowIndex = Math.floor(yKm);
    const minorX = Math.min(9, Math.floor((xKm - columnIndex) / MINOR_CELL_KM + 1e-9));
    const minorY = Math.min(9, Math.floor((yKm - rowIndex) / MINOR_CELL_KM + 1e-9));
    const major = `${COLUMN_LETTERS[columnIndex]}${rowIndex + 1}`;
    return {
      major,
      column: COLUMN_LETTERS[columnIndex],
      row: rowIndex + 1,
      minorX,
      minorY,
      coordinate: `${major} ${minorX}:${minorY}`
    };
  }

  function normalizeGridCoordinate(value) {
    if (typeof value !== 'string') throw new TypeError('坐标必须是字符串');
    const normalized = value.trim().toUpperCase();
    const match = normalized.match(/^([A-T])\s*(10|[1-9])\s+([0-9])\s*:\s*([0-9])$/)
      || normalized.match(/^([A-T])(10|[1-9])([0-9])([0-9])$/);
    if (!match) throw new SyntaxError('坐标格式应为 C3 7:7 或 C377');
    return `${match[1]}${match[2]} ${match[3]}:${match[4]}`;
  }

  function gridToWorld(value, anchor = 'center') {
    const coordinate = normalizeGridCoordinate(value);
    const match = coordinate.match(/^([A-T])(10|[1-9]) ([0-9]):([0-9])$/);
    const columnIndex = COLUMN_LETTERS.indexOf(match[1]);
    const rowIndex = Number(match[2]) - 1;
    const minorX = Number(match[3]);
    const minorY = Number(match[4]);
    const anchorOffset = anchor === 'southwest' ? 0 : 0.5;
    if (anchor !== 'center' && anchor !== 'southwest') {
      throw new RangeError('anchor 仅支持 center 或 southwest');
    }
    return {
      xKm: cleanKm(columnIndex + (minorX + anchorOffset) * MINOR_CELL_KM),
      yKm: cleanKm(rowIndex + (minorY + anchorOffset) * MINOR_CELL_KM),
      coordinate,
      major: `${match[1]}${match[2]}`,
      column: match[1],
      row: Number(match[2]),
      minorX,
      minorY
    };
  }

  function minorCellBounds(value) {
    const point = gridToWorld(value, 'southwest');
    return {
      xMinKm: point.xKm,
      yMinKm: point.yKm,
      xMaxKm: cleanKm(point.xKm + MINOR_CELL_KM),
      yMaxKm: cleanKm(point.yKm + MINOR_CELL_KM)
    };
  }

  return Object.freeze({
    COLUMN_LETTERS,
    WORLD_WIDTH_KM,
    WORLD_HEIGHT_KM,
    MAJOR_CELL_KM,
    MINOR_CELL_KM,
    normalizeGridCoordinate,
    worldToGrid,
    gridToWorld,
    minorCellBounds
  });
});
