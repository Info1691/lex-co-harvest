# lex-co-harvest
Allow-listed crawler/ingester for Channel Islands (Jersey-centric) legal sources.

- Respects `robots.txt`
- Crawls only the hosts in `src/allowlist.json`
- Starts from `src/seeds.json`
- Normalizes HTML pages to TXT (with provenance header)
- Saves PDFs as-is (no parsing here)
- Writes a manifest + catalog of harvested items
- (Optional) Publishes sanitized outputs to the public `law-index` repo (gh-pages) under `/harvest/`

> Keep this repo **private**. The public `law-index` serves only static artifacts.

## Quick start (local)
```bash
npm ci
node src/crawler.mjs
