const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'assets', 'icons', 'svg');
fs.mkdirSync(outputDir, { recursive: true });

const palette = {
  friendly: '#79c8ce',
  friendlyStroke: '#274d4d',
  enemy: '#ef7e70',
  enemyStroke: '#71372f',
  reference: '#78d54c',
  referenceStroke: '#486a25',
  gold: '#f3bd31',
  goldStroke: '#76570b',
  building: '#6e512d',
  ink: '#20251f',
  markerRed: '#dc211f',
  markerGreen: '#58ef3c',
  markerBlue: '#7fc6dc'
};

const icons = [];

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function svgDocument(title, body, viewBox = '0 0 64 64') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title">
  <title id="title">${escapeXml(title)}</title>
  ${body.trim()}
</svg>
`;
}

function addIcon(id, title, category, body, viewBox = '0 0 64 64', options = {}) {
  const filename = `${id}.svg`;
  fs.writeFileSync(path.join(outputDir, filename), svgDocument(title, body, viewBox), 'utf8');
  const icon = { id, title, category, filename, viewBox, body: body.trim(), ...options };
  icons.push(icon);
  return icon;
}

function unitFrame(side, inner = '') {
  const friendly = side === 'friendly';
  const fill = friendly ? palette.friendly : palette.enemy;
  const stroke = friendly ? palette.friendlyStroke : palette.enemyStroke;
  const shape = friendly
    ? `<rect x="7" y="14" width="50" height="36" rx="1.5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
    : `<path d="M32 5 59 32 32 59 5 32Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  return `${shape}\n${inner.replaceAll('{stroke}', stroke)}`;
}

const crossed = `<path d="M11 18 53 46M53 18 11 46" fill="none" stroke="{stroke}" stroke-width="2.2" stroke-linecap="round"/>`;
const diagonal = `<path d="M12 46 52 18" fill="none" stroke="{stroke}" stroke-width="2.4" stroke-linecap="round"/>`;
const artillery = `<circle cx="32" cy="32" r="6" fill="{stroke}"/>`;
const mechanized = `<rect x="20" y="25" width="24" height="14" rx="7" fill="none" stroke="{stroke}" stroke-width="2.2"/>`;

addIcon('unit-friendly', '友军单位', '单位图例', unitFrame('friendly'));
addIcon('unit-enemy', '敌军单位', '单位图例', unitFrame('enemy'));
addIcon('unit-friendly-infantry', '友军步兵', '单位图例', unitFrame('friendly', crossed));
addIcon('unit-enemy-infantry', '敌军步兵', '单位图例', unitFrame('enemy', crossed));
addIcon('unit-friendly-recon', '友军侦察', '单位图例', unitFrame('friendly', diagonal));
addIcon('unit-enemy-recon', '敌军侦察', '单位图例', unitFrame('enemy', diagonal));
addIcon('unit-friendly-artillery', '友军炮兵', '单位图例', unitFrame('friendly', artillery));
addIcon('unit-enemy-artillery', '敌军炮兵', '单位图例', unitFrame('enemy', artillery));
addIcon('unit-friendly-mechanized', '友军机械化部队', '单位图例', unitFrame('friendly', mechanized));
addIcon('unit-enemy-mechanized', '敌军机械化部队', '单位图例', unitFrame('enemy', mechanized));

addIcon('map-reference-point', '参考点', '地图符号', `
  <path d="M10 10 54 54M54 10 10 54" fill="none" stroke="${palette.referenceStroke}" stroke-width="8" stroke-linecap="round"/>
  <path d="M10 10 54 54M54 10 10 54" fill="none" stroke="${palette.reference}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="9" fill="${palette.reference}" stroke="${palette.referenceStroke}" stroke-width="2"/>
  <circle cx="32" cy="32" r="2.5" fill="${palette.referenceStroke}"/>
`);

addIcon('modifier-underground', '地下修饰符', '单位上方修饰符', `
  <path d="M8 22V8l14-6 10 5 10-5 14 6v14" fill="none" stroke="${palette.referenceStroke}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M9 9l13-5 10 5 10-5 13 5" fill="none" stroke="${palette.reference}" stroke-width="2"/>
`, '0 0 64 24', { role: 'modifier', placement: 'above', previewBase: 'unit-enemy-artillery.svg' });

addIcon('modifier-high-priority', '高优先级修饰符', '单位上方修饰符', `
  <g fill="${palette.gold}" stroke="${palette.goldStroke}" stroke-width="1.4" stroke-linejoin="round">
    <path d="M15 3l3 6 7 .9-5 4.8 1.3 6.8L15 18l-6.3 3.5 1.3-6.8-5-4.8L12 9Z"/>
    <path d="M32 0l3 6 7 .9-5 4.8 1.3 6.8L32 15l-6.3 3.5 1.3-6.8-5-4.8L29 6Z"/>
    <path d="M49 3l3 6 7 .9-5 4.8 1.3 6.8L49 18l-6.3 3.5 1.3-6.8-5-4.8L46 9Z"/>
  </g>
`, '0 0 64 24', { role: 'modifier', placement: 'above', previewBase: 'unit-enemy-artillery.svg' });

addIcon('modifier-building', '建筑物修饰符', '单位上方修饰符', `
  <rect x="23" y="1" width="18" height="18" fill="${palette.building}" stroke="#3e2d1a" stroke-width="1.5"/>
`, '0 0 64 24', { role: 'modifier', placement: 'above', previewBase: 'unit-enemy-artillery.svg' });

addIcon('unit-enemy-fdc', '敌军炮兵指挥官', '特种单位', unitFrame('enemy', `
  <path d="M28 5V0h8v5" fill="${palette.ink}"/>
  <text x="32" y="24" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="${palette.ink}">FDC</text>
  <path d="M32 26 24 39h16Z" fill="none" stroke="${palette.ink}" stroke-width="1.7"/>
  <circle cx="32" cy="33" r="2" fill="${palette.ink}"/>
  <path d="M32 41v8m-5-4 5 5 5-5" fill="none" stroke="${palette.ink}" stroke-width="1.7" stroke-linecap="round"/>
`));

addIcon('unit-enemy-supply', '敌军补给仓库', '特种单位', unitFrame('enemy', `
  <path d="M28 5V0h8v5" fill="${palette.ink}"/>
  <path d="M23 42V28l3-5h12l3 5v14M27 42V30h10v12M30 30v-4h4v4" fill="none" stroke="${palette.ink}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M20 43h24" stroke="${palette.ink}" stroke-width="2"/>
`));

function markerBody(fill, stroke, label, ornament) {
  return `
    <path d="M32 7c-12.7 0-23 9.5-23 21.3 0 9.5 6.6 17.5 15.8 20.3L32 62l7.2-13.4C48.4 45.8 55 37.8 55 28.3 55 16.5 44.7 7 32 7Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>
    ${ornament}
    <text x="32" y="36" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="700" fill="#111">${escapeXml(label)}</text>
  `;
}

function redOrnament() {
  return `<path d="M13 18c4-8 11-9 17-5 5-5 12-3 16 3-6-2-9 0-11 3 7-1 12 1 16 5-8-3-13-1-17 2-5-5-12-7-21-8Z" fill="#8f1515" opacity=".92"/>`;
}

function greenOrnament() {
  return `<path d="M20 16V5m0 2c8 4 14-3 24 1-8 8-16 2-24 5" fill="none" stroke="#237f24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function blueOrnament() {
  return `<g fill="none" stroke="#315f6d" stroke-width="1.7" stroke-linecap="round"><path d="M19 18h26l-4-7H23Z"/><path d="M28 11 39 2M34 11 46 3"/><path d="M23 14 14 9m27 5 9-5"/></g>`;
}

for (let number = 1; number <= 10; number += 1) {
  addIcon(`marker-red-${number}`, `红色自定义标记 ${number}`, '自定义标记', markerBody(palette.markerRed, '#761516', number, redOrnament()));
}
for (const letter of ['A', 'B', 'C', 'D', 'E']) {
  addIcon(`marker-green-${letter.toLowerCase()}`, `绿色自定义标记 ${letter}`, '自定义标记', markerBody(palette.markerGreen, '#267d27', letter, greenOrnament()));
}
for (let number = 1; number <= 10; number += 1) {
  addIcon(`marker-blue-${number}`, `蓝色自定义标记 ${number}`, '自定义标记', markerBody(palette.markerBlue, '#315f6d', number, blueOrnament()));
}

const ironNestBody = `
  <defs>
    <linearGradient id="nest-metal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9bdddf"/>
      <stop offset="1" stop-color="#5aa9bd"/>
    </linearGradient>
  </defs>
  <path d="M64 8c-28.7 0-52 22.1-52 49.4 0 21.9 15 40.5 36.4 47L64 128l15.6-23.6c21.4-6.5 36.4-25.1 36.4-47C116 30.1 92.7 8 64 8Z" fill="url(#nest-metal)" stroke="#315f6d" stroke-width="3"/>
  <g transform="rotate(-34 64 60)" stroke="#315f6d" stroke-linejoin="round">
    <rect x="42" y="34" width="44" height="54" rx="3" fill="#79c8ce" stroke-width="2.5"/>
    <rect x="49" y="40" width="30" height="31" rx="2" fill="#70b9c7" stroke-width="2"/>
    <path d="M53 41V2h7v39M68 41V-3h7v44" fill="#8ed5da" stroke-width="2"/>
    <path d="M45 47 22 35l-7 10 26 17M83 47l23-12 7 10-26 17M45 75 22 88l-7-10 26-18M83 75l23 13 7-10-26-18" fill="#68aebe" stroke-width="2"/>
    <rect x="36" y="52" width="9" height="20" fill="#86d0d4" stroke-width="1.7"/>
    <rect x="83" y="52" width="9" height="20" fill="#86d0d4" stroke-width="1.7"/>
    <circle cx="64" cy="57" r="4" fill="#315f6d" stroke="none"/>
  </g>
`;
addIcon('iron-nest', '铁巢本体俯视图标', '铁巢本体', ironNestBody, '0 0 128 128');

const spriteSymbols = icons.map(icon => `  <symbol id="${icon.id}" viewBox="${icon.viewBox}">\n    <title>${escapeXml(icon.title)}</title>\n    ${icon.body}\n  </symbol>`).join('\n');
fs.writeFileSync(path.join(outputDir, 'iron-nest-symbols.svg'), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
${spriteSymbols}
</svg>
`, 'utf8');

const manifest = icons.map(({ body, ...metadata }) => metadata);
fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify({ version: 1, icons: manifest }, null, 2)}\n`, 'utf8');

const categories = [...new Set(icons.map(icon => icon.category))];
const catalogSections = categories.map(category => {
  const items = icons.filter(icon => icon.category === category).map(icon => {
    const preview = icon.role === 'modifier'
      ? `<div class="stacked-preview"><img class="base-icon" src="svg/${icon.previewBase}" alt=""><img class="modifier-icon" src="svg/${icon.filename}" alt="${escapeXml(icon.title)}"></div>`
      : `<img src="svg/${icon.filename}" alt="${escapeXml(icon.title)}">`;
    return `
      <figure>
        ${preview}
        <figcaption>${escapeXml(icon.title)}<code>${icon.id}</code></figcaption>
      </figure>`;
  }).join('');
  return `<section><h2>${escapeXml(category)}</h2><div class="grid">${items}\n    </div></section>`;
}).join('\n');

fs.writeFileSync(path.join(root, 'assets', 'icons', 'catalog.html'), `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>铁巢炮控 SVG 素材库</title>
  <style>
    :root{color-scheme:dark;--bg:#090e0b;--panel:#121a15;--line:#334238;--text:#edf2e8;--muted:#97a298;--accent:#e6b84f}
    *{box-sizing:border-box}body{margin:0;padding:28px;color:var(--text);background:var(--bg);font-family:Inter,"Microsoft YaHei",system-ui,sans-serif}header{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:28px}h1,h2,p{margin:0}h1{font-size:28px}p{color:var(--muted);font-size:13px}section{margin-top:28px}h2{margin-bottom:12px;color:var(--accent);font-size:15px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}figure{display:grid;grid-template-rows:82px auto;margin:0;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}img{width:72px;height:72px;margin:auto;object-fit:contain}.stacked-preview{position:relative;width:72px;height:72px;margin:auto}.stacked-preview .base-icon{position:absolute;left:8px;bottom:0;width:56px;height:56px}.stacked-preview .modifier-icon{position:absolute;left:8px;top:0;width:56px;height:22px}figcaption{font-size:12px;text-align:center}code{display:block;margin-top:5px;color:var(--muted);font-size:9px;word-break:break-all}@media(max-width:520px){body{padding:14px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}header{display:block}p{margin-top:8px}}
  </style>
</head>
<body>
  <header><div><h1>铁巢炮控 SVG 素材库</h1><p>标准化矢量图标 · 可独立引用或通过 SVG sprite 调用</p></div><p>${icons.length} 个独立素材</p></header>
  ${catalogSections}
</body>
</html>
`, 'utf8');

console.log(`Generated ${icons.length} icons in ${outputDir}`);
