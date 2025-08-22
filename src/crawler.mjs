// lex-co-harvest: allow-listed crawler with robots.txt, provenance, and safe exports.
// Node 20+ (global fetch). Outputs dist/harvest/*, dist/manifest.json, dist/catalog.json

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadHtml } from 'cheerio';
import mime from 'mime-types';
import sanitize from 'sanitize-filename';
import { sleep, sha256, slugify, normalizeUrl, joinUrl, extFor, canFetch } from './util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUTDIR = path.join(DIST, 'harvest');

const cfg = JSON.parse(await fs.readFile(path.join(__dirname, 'config.json'), 'utf8'));
const allow = JSON.parse(await fs.readFile(path.join(__dirname, 'allowlist.json'), 'utf8'));
const seeds = JSON.parse(await fs.readFile(path.join(__dirname, 'seeds.json'), 'utf8'));

// simple glob match for host paths
function pathAllowed(host, pth) {
  const globs = allow[host] || [];
  if (!globs.length) return false;
  return globs.some(g => globMatch(pth, g));
}
function globMatch(s, pat) {
  const rx = new RegExp('^' + pat.split('*').map(x => x.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return rx.test(s);
}

await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(OUTDIR, { recursive: true });

const manifest = [];
const visited = new Set();
const perHostCount = new Map();

const queue = []; // {url, depth}

for (const [host, list] of Object.entries(seeds)) {
  for (const u of list) queue.push({ url: normalizeUrl(u), depth: 0 });
}

console.log(`[harvest] seeds in queue: ${queue.length}`);

async function worker() {
  while (true) {
    const item = queue.shift();
    if (!item) break;
    const { url, depth } = item;

    if (visited.has(url)) continue;
    visited.add(url);

    const host = new URL(url).host;
    const cnt = perHostCount.get(host) || 0;
    if (cnt >= cfg.maxPerHost) continue;
    if (!pathAllowed(host, new URL(url).pathname)) continue;
    if (!(await canFetch(url, cfg.userAgent))) continue;

    try {
      await sleep(cfg.rateLimitMs);
      const res = await fetch(url, {
        headers: { 'User-Agent': cfg.userAgent, 'Accept': '*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(cfg.timeoutMs),
        cache: 'no-store'
      });
      if (!res.ok) { console.warn('[skip]', res.status, url); continue; }

      const ct = res.headers.get('content-type') || '';
      const buf = Buffer.from(await res.arrayBuffer());

      if (/pdf/i.test(ct) || /\.pdf(\?.*)?$/i.test(url)) {
        if (!cfg.savePdf) continue;
        const { savedPath, meta } = await savePdf(host, url, buf, ct);
        manifest.push(meta);
      } else if (/html/i.test(ct) || /xml/.test(ct)) {
        const html = buf.toString('utf8');
        const { text, title, links } = extractHtml(html, url);
        if (cfg.saveHtmlAsTxt && text.trim().length) {
          const { savedPath, meta } = await saveTxt(host, url, title, text, ct);
          manifest.push(meta);
        }
        // queue next links
        if (depth < cfg.maxDepth) {
          for (const href of links) {
            try {
              const abs = joinUrl(url, href);
              const h = new URL(abs).host;
              if (!allow[h]) continue; // only allowed hosts
              if (!pathAllowed(h, new URL(abs).pathname)) continue;
              if (!visited.has(abs)) queue.push({ url: normalizeUrl(abs), depth: depth + 1 });
            } catch { /* ignore bad href */ }
          }
        }
      } else {
        // other types -> skip silently
      }

      perHostCount.set(host, cnt + 1);
    } catch (e) {
      console.warn('[error]', url, e.message);
    }
  }
}

function extractHtml(html, baseUrl) {
  const $ = loadHtml(html);
  const hide = ['script','style','noscript','header','footer','nav'];
  hide.forEach(s => $(s).remove());
  const title = ($('title').first().text() || '').trim();
  const body = $('body').text().replace(/\s+\n/g, '\n').replace(/\s{2,}/g, ' ').trim();
  const links = $('a[href]').map((_,a)=>$(a).attr('href')).get();
  return { text: body, title, links };
}

async function saveTxt(host, url, title, text, contentType) {
  const dt = new Date().toISOString();
  const origin = host.split(':')[0];
  const fname = sanitize(slugify(`${origin}-${title || 'page'}-${sha256(Buffer.from(url)).slice(0,8)}`)) + '.txt';
  const folder = path.join(OUTDIR, origin);
  await fs.mkdir(folder, { recursive: true });
  const outPath = path.join(folder, fname);

  const header = [
    '--- provenance ---',
    `source-url: ${url}`,
    `fetched-at: ${dt}`,
    `content-type: ${contentType}`,
    `sha256-url: ${sha256(Buffer.from(url))}`,
    '-------------------',
    ''
  ].join('\n');

  await fs.writeFile(outPath, header + text, 'utf8');

  const meta = {
    kind: 'html->txt',
    host: origin,
    url,
    title,
    savedPath: rel(outPath),
    bytes: Buffer.byteLength(header + text),
    fetchedAt: dt
  };
  console.log('[saved txt]', meta.savedPath);
  return { savedPath: outPath, meta };
}

async function savePdf(host, url, buf, contentType) {
  const dt = new Date().toISOString();
  const origin = host.split(':')[0];
  const fname = sanitize(slugify(`${origin}-${path.basename(new URL(url).pathname)}-${sha256(buf).slice(0,8)}`)) + '.pdf';
  const folder = path.join(OUTDIR, origin);
  await fs.mkdir(folder, { recursive: true });
  const outPath = path.join(folder, fname);
  await fs.writeFile(outPath, buf);

  const meta = {
    kind: 'pdf',
    host: origin,
    url,
    title: path.basename(new URL(url).pathname),
    savedPath: rel(outPath),
    bytes: buf.length,
    fetchedAt: dt,
    contentType
  };
  console.log('[saved pdf]', meta.savedPath);
  return { savedPath: outPath, meta };
}

function rel(p) { return path.relative(DIST, p).replace(/\\/g,'/'); }

// Run workers with limited concurrency
const workers = [];
for (let i=0; i<cfg.concurrency; i++) workers.push(worker());
await Promise.all(workers);

// Write manifest + catalog
await fs.writeFile(path.join(DIST, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), items: manifest }, null, 2));

// Produce a simple catalog the indexer can consume (points to harvested files we will publish)
const catalog = manifest.map(m => ({
  title: m.title || m.url,
  subtitle: `${m.host} — harvested ${m.fetchedAt.slice(0,10)}`,
  url: `harvest/${m.savedPath}` // relative within gh-pages after publish
}));
await fs.writeFile(path.join(DIST, 'catalog.json'), JSON.stringify(catalog, null, 2));

console.log(`[harvest] done. items: ${manifest.length}`);
