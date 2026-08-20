'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'assets', 'icons', 'svg', 'app-icon.svg');
const outputPath = path.join(root, 'tray.ico');
const sizes = [16, 24, 32, 48, 64, 128, 256];

function dibBuffer(size, bitmap) {
  const rowLength = size * 4;
  const pixels = Buffer.alloc(bitmap.length);
  for (let row = 0; row < size; row += 1) bitmap.copy(pixels, (size - row - 1) * rowLength, row * rowLength, (row + 1) * rowLength);
  const andMask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(pixels.length, 20);
  return Buffer.concat([header, pixels, andMask]);
}

function iconBuffer(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, dib }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(dib.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += dib.length;
  });
  return Buffer.concat([header, ...images.map(image => image.dib)]);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 256, height: 256, transparent: true, frame: false });
  const svg = fs.readFileSync(sourcePath, 'utf8').replace(/^<\?xml[^>]*>\s*/i, '');
  await window.loadURL(`data:text/html,${encodeURIComponent(`<style>html,body,svg{margin:0;width:256px;height:256px;overflow:hidden}</style>${svg}`)}`);
  const source = await window.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  window.destroy();
  if (source.isEmpty()) throw new Error('无法光栅化应用图标 SVG');
  const images = sizes.map(size => {
    const bitmap = source.resize({ width: size, height: size }).toBitmap();
    if (bitmap.length !== size * size * 4) throw new Error('无法生成应用图标位图');
    return { size, dib: dibBuffer(size, bitmap) };
  });
  fs.writeFileSync(outputPath, iconBuffer(images));
  app.exit(0);
}).catch(error => {
  console.error(error.stack || error.message);
  app.exit(1);
});
