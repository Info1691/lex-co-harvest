// Copies dist/* to a local checkout of law-index (gh-pages) if available.
// In CI we use the workflow below; this file is handy for local dry runs.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// adjust if you keep a sibling checkout of law-index
const LAW_INDEX_LOCAL = path.resolve(ROOT, '../law-index-gh-pages');

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const items = await fs.readdir(src, { withFileTypes: true });
  for (const it of items) {
    const sp = path.join(src, it.name);
    const dp = path.join(dst, it.name);
    if (it.isDirectory()) await copyDir(sp, dp);
    else await fs.copyFile(sp, dp);
  }
}

try {
  await copyDir(path.join(DIST, 'harvest'), path.join(LAW_INDEX_LOCAL, 'harvest'));
  await fs.copyFile(path.join(DIST, 'manifest.json'), path.join(LAW_INDEX_LOCAL, 'harvest-manifest.json'));
  await fs.copyFile(path.join(DIST, 'catalog.json'),  path.join(LAW_INDEX_LOCAL, 'harvest', 'catalog.json'));
  console.log('Copied to local law-index checkout.');
} catch (e) {
  console.error('Local publish failed:', e.message);
}
