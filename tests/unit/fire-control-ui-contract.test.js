const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mapHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/map.html'), 'utf8');

test('target cards route both gun buttons through the shared fire-control action', () => {
  assert.match(mapHtml, /data-card-action="send-fire" data-gun-id="gun-a" data-id="\$\{target\.id\}">送左炮/);
  assert.match(mapHtml, /data-card-action="send-fire" data-gun-id="gun-b" data-id="\$\{target\.id\}">送右炮/);
  assert.match(mapHtml, /function sendTargetToFireControl\(target, gunId\)/);
  assert.match(mapHtml, /action === 'send-fire' && target\) \{\s*sendTargetToFireControl\(target, button\.dataset\.gunId\);/);
  assert.doesNotMatch(mapHtml, /targetList\.querySelectorAll\('\[data-card-action="send-fire"\]'\)\.forEach/);
  assert.match(mapHtml, /calculateIronNestFireSolution\(gunId\)/);
});
