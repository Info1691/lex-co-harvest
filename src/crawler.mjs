import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { ensureDir, slugify, stripText, writeJSON, nowISO, extFor } from './util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT  = path.join(DIST, 'harvest');

const cfg   = JSON.parse(await fs.readFile(path.join(__dirname, 'config.json'), 'utf8'));
const seeds = JSON.parse(await fs.readFile(path.join(__dirname, 'seeds.json'), 'utf8'));
const allow = new Set(JSON.parse(await fs.readFile(path.join(__dirname, 'allowlist.json'), 'utf8')).hosts);

function allowed(u){
  try { return allow.has(new URL(u).host); }
  catch { return false; }
}

async function fetchUrl(url){
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), cfg.timeoutMs||20000);
  const res = await fetch(url, {
    signal: controller.signal,
    headers: { 'User-Agent': cfg.userAgent }
  });
  clearTimeout(id);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  const buf = ct.includes('text') || ct.includes('html') ? Buffer.from(await res.text(), 'utf8')
                                                         : Buffer.from(await res.arrayBuffer());
  return { buf, ct };
}

function htmlToText(html){
  const root = parse(html);
  // remove noise
  root.querySelectorAll('script,style,noscript,header,footer,nav').forEach(n=>n.remove());
  const title = stripText(root.querySelector('title')?.text || '');
  const body  = stripText(root.text);
  return { title, text: body };
}

await ensureDir(OUT);
const items = [];
let count = 0;

for (const url of seeds){
  if (!allowed(url)) { console.log(`[skip] not in allowlist: ${url}`); continue; }
  try {
    const { buf, ct } = await fetchUrl(url);
    const ext = extFor(ct, url);
    let savedPath, title='', textPreview='';

    if (ext === '.pdf'){
      savedPath = `${slugify(url)}.pdf`;
      await fs.writeFile(path.join(OUT, savedPath), buf);
      title = new URL(url).pathname.split('/').pop() || 'PDF';
    } else {
      // HTML/text → extract text to .txt
      const { title: t, text } = htmlToText(buf.toString('utf8'));
      title = t || (new URL(url).hostname);
      textPreview = text.slice(0, 500);
      savedPath = `${slugify(url)}.txt`;
      await fs.writeFile(path.join(OUT, savedPath), text, 'utf8');
    }

    items.push({
      url, savedPath, title,
      host: new URL(url).host,
      contentType: ct,
      fetchedAt: nowISO()
    });
    count++;
    console.log(`[ok] ${url} -> ${savedPath}`);
  } catch (e){
    console.warn(`[fail] ${url}: ${e.message}`);
  }
}

// Emit manifest + catalog the indexer and UI expect
await writeJSON(path.join(DIST, 'manifest.json'), { items });

const catalog = items.map(i => ({
  title: i.title || i.url,
  subtitle: `${i.host} — harvested ${i.fetchedAt.slice(0,10)}`,
  url: `harvest/${i.savedPath}`
}));
await writeJSON(path.join(DIST, 'catalog.json'), catalog);

console.log(`[done] harvested ${count} / ${seeds.length}`);
