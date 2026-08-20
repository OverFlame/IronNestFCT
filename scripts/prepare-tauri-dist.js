const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tauri-dist');
const prefix = `${root}${path.sep}`;

if (!output.startsWith(prefix)) {
  throw new Error(`Refusing to clean unexpected path: ${output}`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

fs.copyFileSync(path.join(root, 'overlay.html'), path.join(output, 'overlay.html'));
copyDir(path.join(root, 'src'), path.join(output, 'src'));

const iconRoot = path.join(root, 'assets', 'icons', 'svg');
if (fs.existsSync(iconRoot)) {
  copyDir(iconRoot, path.join(output, 'assets', 'icons', 'svg'));
}

console.log(`Prepared Tauri frontend assets at ${path.relative(root, output)}`);
