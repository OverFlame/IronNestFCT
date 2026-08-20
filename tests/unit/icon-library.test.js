const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const iconDir = path.join(root, 'assets', 'icons', 'svg');
const manifest = JSON.parse(fs.readFileSync(path.join(iconDir, 'manifest.json'), 'utf8'));

test('素材清单包含 42 个唯一图标', () => {
  assert.equal(manifest.icons.length, 42);
  assert.equal(new Set(manifest.icons.map(icon => icon.id)).size, 42);
});

test('三种附加状态仅作为单位上方修饰符', () => {
  const modifiers = manifest.icons.filter(icon => icon.role === 'modifier');
  assert.deepEqual(modifiers.map(icon => icon.id).sort(), [
    'modifier-building',
    'modifier-high-priority',
    'modifier-underground'
  ]);
  for (const modifier of modifiers) {
    assert.equal(modifier.placement, 'above');
    assert.equal(modifier.previewBase, 'unit-enemy-artillery.svg');
  }
  assert.equal(manifest.icons.some(icon => icon.id === 'map-underground'), false);
  assert.equal(manifest.icons.some(icon => icon.id === 'map-high-priority'), false);
  assert.equal(manifest.icons.some(icon => icon.id === 'map-building'), false);
});

test('自定义标记数量与参考图一致', () => {
  assert.equal(manifest.icons.filter(icon => icon.id.startsWith('marker-red-')).length, 10);
  assert.equal(manifest.icons.filter(icon => icon.id.startsWith('marker-green-')).length, 5);
  assert.equal(manifest.icons.filter(icon => icon.id.startsWith('marker-blue-')).length, 10);
});

test('所有清单文件均为独立矢量 SVG 且不嵌入位图', () => {
  for (const icon of manifest.icons) {
    const source = fs.readFileSync(path.join(iconDir, icon.filename), 'utf8');
    assert.match(source, /<svg\b/);
    assert.match(source, /viewBox=/);
    assert.doesNotMatch(source, /<image\b|data:image\//);
  }
});

test('sprite 包含清单中的每个图标', () => {
  const sprite = fs.readFileSync(path.join(iconDir, 'iron-nest-symbols.svg'), 'utf8');
  for (const icon of manifest.icons) {
    assert.match(sprite, new RegExp(`<symbol id="${icon.id}"`));
  }
});

