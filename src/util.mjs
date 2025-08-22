import crypto from 'node:crypto';
import path from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function slugify(input, max = 120) {
  return String(input || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, max) || 'item';
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

export function sameHost(a, b) {
  try { return new URL(a).host === new URL(b).host; } catch { return false; }
}

export function joinUrl(base, href) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

export function extFor(contentType, url = '') {
  if (/pdf/i.test(contentType) || /\.pdf(\?.*)?$/i.test(url)) return '.pdf';
  return '.txt';
}

// --- very simple robots.txt evaluator (User-agent: * only) ---
export async function canFetch(url, ua) {
  try {
    const { origin } = new URL(url);
    const res = await fetch(origin + '/robots.txt', { cache: 'no-store' });
    if (!res.ok) return true;
    const txt = await res.text();
    return isAllowed(txt, url, ua);
  } catch {
    return true; // default allow on failure
  }
}

function isAllowed(robots, url, ua) {
  // minimal parser: supports User-agent / Disallow / Allow blocks, * only
  const u = new URL(url);
  const path = u.pathname;
  const lines = robots.split(/\r?\n/).map(l => l.trim());
  let applies = false;
  const rules = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(User-agent|Disallow|Allow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, valRaw] = m;
    const val = valRaw.trim();
    if (/^User-agent$/i.test(key)) {
      applies = val === '*' || (ua && val.toLowerCase() === ua.toLowerCase());
    } else if (applies && /^Disallow$/i.test(key)) {
      rules.push({ type: 'D', pat: val });
    } else if (applies && /^Allow$/i.test(key)) {
      rules.push({ type: 'A', pat: val });
    }
  }
  // longest-match wins; Allow beats Disallow on equal length
  function matchLen(pat) {
    if (!pat) return 0;
    if (pat === '/') return 1;
    const rx = new RegExp('^' + pat.split('*').map(escapeRx).join('.*') );
    const m = path.match(rx);
    return m ? m[0].length : 0;
  }
  let best = { len: -1, type: 'A' };
  for (const r of rules) {
    const len = matchLen(r.pat);
    if (len > best.len || (len === best.len && r.type === 'A' && best.type === 'D')) {
      best = { len, type: r.type };
    }
  }
  return best.type !== 'D';
}
function escapeRx(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
