import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const manifest = JSON.parse(await fs.readFile(path.join(DIST, 'manifest.json'), 'utf8'));
const approvals = JSON.parse(await fs.readFile(path.join(__dirname, 'approvals.json'), 'utf8'));

function match(url, pat){
  if (pat.endsWith('*')) return url.startsWith(pat.slice(0, -1));
  return url.startsWith(pat);
}

const allow = approvals.allow || [];
const approved = (manifest.items || []).filter(m => allow.some(p => match(m.url, p)));

await fs.writeFile(path.join(DIST, 'approved.json'), JSON.stringify({ items: approved }, null, 2));
const catalogApproved = approved.map(m => ({
  title: m.title || m.url,
  subtitle: `${m.host} — harvested ${m.fetchedAt?.slice(0,10) || ''}`,
  url: `harvest/${m.savedPath}`
}));
await fs.writeFile(path.join(DIST, 'catalog-approved.json'), JSON.stringify(catalogApproved, null, 2));

console.log(`[approve] approved items: ${approved.length}`);
