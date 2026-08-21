#!/usr/bin/env node
/**
 * Builds sitemap.xml from the live API after the storefront has built, and
 * appends the Sitemap: line to the already-built robots.txt. Runs every
 * deploy, so every product, category, page and blog post that exists right
 * now is in it — nobody has to remember to hand-maintain a URL list, and
 * nothing gets left out just because it was added yesterday.
 *
 * Deliberately excludes cart, checkout, track, account and invoice — none of
 * those have unique content to rank on, and account/invoice are per-shopper
 * private pages that would be actively wrong to invite a crawler into.
 */

import { writeFileSync, appendFileSync, existsSync } from 'node:fs';

const API_BASE = (process.env.VITE_API_BASE ?? '').replace(/\/$/, '');
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/$/, '');
const OUT_DIR = process.env.SITEMAP_OUT_DIR ?? 'web/dist';

if (!API_BASE || !SITE_URL) {
  console.error('generate-sitemap: both VITE_API_BASE and SITE_URL are required');
  process.exit(1);
}

/** Paginates through a listing endpoint until it runs out of pages. */
async function fetchAll(path, key, limit) {
  const all = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${API_BASE}${path}?limit=${limit}&page=${page}`);
    if (!res.ok) {
      console.warn(`generate-sitemap: ${path} page ${page} returned ${res.status} — stopping there`);
      break;
    }
    const json = await res.json();
    const items = json[key] ?? [];
    all.push(...items);
    if (!json.pages || page >= json.pages || items.length === 0) break;
  }
  return all;
}

async function fetchOne(path, key) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    console.warn(`generate-sitemap: ${path} returned ${res.status} — treating as empty`);
    return [];
  }
  const json = await res.json();
  return json[key] ?? [];
}

const today = new Date().toISOString().slice(0, 10);
const isoDate = (unixSeconds) => (unixSeconds ? new Date(unixSeconds * 1000).toISOString().slice(0, 10) : today);

const urls = [];
const add = (loc, lastmod) => urls.push({ loc: `${SITE_URL}${loc}`, lastmod: lastmod ?? today });

add('/');
add('/catalog');
add('/blog');
add('/press');

const [products, categories, pages, posts] = await Promise.all([
  fetchAll('/api/products', 'products', 60),
  fetchOne('/api/categories', 'categories'),
  fetchOne('/api/pages', 'pages'),
  fetchAll('/api/posts', 'posts', 50),
]);

for (const p of products) add(`/product/${p.slug}`, isoDate(p.updated_at));
for (const c of categories) add(`/catalog?category=${c.slug}`);
for (const pg of pages) add(`/page/${pg.slug}`, isoDate(pg.updated_at));
for (const post of posts) add(`/blog/${post.slug}`, isoDate(post.published_at));

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n') +
  '\n</urlset>\n';

writeFileSync(`${OUT_DIR}/sitemap.xml`, xml);
console.log(`generate-sitemap: wrote ${urls.length} URLs to ${OUT_DIR}/sitemap.xml`);

const robotsPath = `${OUT_DIR}/robots.txt`;
if (existsSync(robotsPath)) {
  appendFileSync(robotsPath, `\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`generate-sitemap: appended Sitemap: line to ${robotsPath}`);
} else {
  console.warn(`generate-sitemap: ${robotsPath} does not exist — nothing to append the Sitemap: line to`);
}
