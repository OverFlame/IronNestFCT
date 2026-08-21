'use strict';

// Generates the Tauri icon set (src-tauri/icons/*) from code — a custom gold crosshair
// on a dark background, matching the terminal's color scheme. Pure Node, zero dependencies.
// Tauri's build script requires icons/icon.ico for the Windows resource file; this script
// produces a valid multi-size ICO plus the PNG variants.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const iconsDir = path.join(root, 'src-tauri', 'icons');

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// ICO with PNG-compressed entries (supported by Windows Vista+ at all sizes).
function encodeIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(count * 16);
  let offset = 6 + count * 16;
  const images = [];
  entries.forEach((entry, index) => {
    const base = index * 16;
    dir[base] = entry.size >= 256 ? 0 : entry.size;
    dir[base + 1] = entry.size >= 256 ? 0 : entry.size;
    dir[base + 2] = 0; // palette
    dir[base + 3] = 0; // reserved
    dir.writeUInt16LE(1, base + 4); // planes
    dir.writeUInt16LE(32, base + 6); // bits per pixel
    dir.writeUInt32LE(entry.png.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    images.push(entry.png);
    offset += entry.png.length;
  });
  return Buffer.concat([header, dir, ...images]);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const DARK = [11, 16, 13]; // #0b100d
  const GOLD = [230, 184, 79]; // #e6b84f
  const center = size / 2;
  const outerRadius = size * 0.38;
  const ringHalf = Math.max(1.5, size * 0.022);
  const crossHalf = Math.max(1.5, size * 0.03);
  const dotRadius = size * 0.10;

  function put(x, y, color) {
    const i = (y * size + x) * 4;
    rgba[i] = color[0];
    rgba[i + 1] = color[1];
    rgba[i + 2] = color[2];
    rgba[i + 3] = 255;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.hypot(dx, dy);

      let color = DARK;
      if (Math.abs(dx) < crossHalf || Math.abs(dy) < crossHalf) color = GOLD;
      if (Math.abs(dist - outerRadius) < ringHalf) color = GOLD;
      if (dist < dotRadius) color = DARK;

      put(x, y, color);
    }
  }
  return rgba;
}

fs.mkdirSync(iconsDir, { recursive: true });

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoEntries = icoSizes.map(size => ({ size, png: encodePng(size, drawIcon(size)) }));
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), encodeIco(icoEntries));
fs.writeFileSync(path.join(iconsDir, 'icon.png'), encodePng(512, drawIcon(512)));
fs.writeFileSync(path.join(iconsDir, '32x32.png'), encodePng(32, drawIcon(32)));
fs.writeFileSync(path.join(iconsDir, '128x128.png'), encodePng(128, drawIcon(128)));
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), encodePng(256, drawIcon(256)));

console.log('Generated Tauri icons in', iconsDir);
