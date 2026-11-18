#!/usr/bin/env node
// npm run copy order-confirmation
// Copies dist/<name>.liquid to the clipboard, ready to paste into
// Settings → Notifications → <notification> → Edit code.
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const name = process.argv[2];

if (!name) {
  const built = (await readdir(dist).catch(() => [])).filter((f) => f.endsWith('.liquid'));
  console.error('Usage: npm run copy <name>');
  console.error(built.length ? `Built: ${built.map((f) => f.replace('.liquid', '')).join(', ')}` : 'Nothing built yet — run npm run build');
  process.exit(1);
}

const html = await readFile(path.join(dist, `${name}.liquid`), 'utf8');
const clipboard =
  process.platform === 'darwin' ? ['pbcopy', []] :
  process.platform === 'win32' ? ['clip', []] :
  ['xclip', ['-selection', 'clipboard']];
const result = spawnSync(clipboard[0], clipboard[1], { input: html });
if (result.status !== 0) {
  console.error(`Couldn't run ${clipboard[0]}; open dist/${name}.liquid and copy it manually.`);
  process.exit(1);
}
console.log(`Copied dist/${name}.liquid (${(html.length / 1024).toFixed(1)} KB) to the clipboard.`);
