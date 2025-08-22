import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }

export function slugify(s){
  return String(s||'').toLowerCase()
    .replace(/https?:\/\//,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,140);
}

export function stripText(s){
  return String(s||'')
    .replace(/\s+/g,' ')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .trim();
}

export async function writeJSON(p, obj){
  await fs.writeFile(p, JSON.stringify(obj, null, 2), 'utf8');
}

export function nowISO(){ return new Date().toISOString(); }

export function extFor(contentType, url){
  if ((contentType||'').includes('pdf') || /\.pdf(\?|#|$)/i.test(url||'')) return '.pdf';
  return '.txt';
}
