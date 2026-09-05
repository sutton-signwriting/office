import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'downloads', 'office-model.pdf');
await mkdir(path.dirname(output), { recursive: true });
const result = spawnSync(process.env.CHROMIUM_BIN || '/snap/bin/chromium', [
  '--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
  `--print-to-pdf=${output}`, pathToFileURL(path.join(root, 'dist', 'office-model.html')).href
], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'Office model PDF rendering failed');
console.log('Rendered downloads/office-model.pdf.');
