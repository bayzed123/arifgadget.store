#!/usr/bin/env node
/**
 * Idempotent Cloudflare provisioning.
 *
 * Creates the D1 database, R2 bucket and KV namespace if they are missing,
 * reuses them if they are not, then writes their real IDs into
 * worker/wrangler.toml so `wrangler deploy` binds to them. Safe to run on
 * every deploy — a second run just resolves the existing resources.
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/bootstrap-cf.mjs
 */

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { client, isAlreadyExists } from './lib/cf.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(ROOT, 'worker', 'wrangler.toml');

const D1_NAME = process.env.D1_NAME ?? 'arif-gadgets';
const R2_NAME = process.env.R2_NAME ?? 'arif-gadgets-media';
const KV_TITLE = process.env.KV_TITLE ?? 'arif-gadgets-cache';
const WORKER_NAME = process.env.WORKER_NAME ?? 'arif-gadgets-api';

const cf = client();

async function ensureD1() {
  const existing = await cf.call(`/d1/database?name=${encodeURIComponent(D1_NAME)}&per_page=50`);
  const match = (existing ?? []).find((db) => db.name === D1_NAME);
  if (match) {
    console.log(`  D1        reuse   ${D1_NAME} (${match.uuid})`);
    return match.uuid;
  }

  try {
    const created = await cf.call('/d1/database', {
      method: 'POST',
      body: { name: D1_NAME, primary_location_hint: process.env.D1_LOCATION ?? 'apac' },
    });
    console.log(`  D1        created ${D1_NAME} (${created.uuid})`);
    return created.uuid;
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    const retry = await cf.call(`/d1/database?name=${encodeURIComponent(D1_NAME)}&per_page=50`);
    const found = (retry ?? []).find((db) => db.name === D1_NAME);
    if (!found) throw err;
    console.log(`  D1        reuse   ${D1_NAME} (${found.uuid})`);
    return found.uuid;
  }
}

/** Cloudflare returns 10042 until R2 is switched on for the account. */
function isR2Disabled(err) {
  return (err.errors ?? []).some((e) => e.code === 10042 || /enable R2/i.test(e.message ?? ''));
}

/**
 * R2 only backs admin image uploads. If the account has not opted into R2 yet
 * we skip it and drop the binding rather than failing the whole deploy — the
 * storefront, dashboard and analytics do not depend on it.
 *
 * @returns true when the bucket is ready to bind.
 */
async function ensureR2() {
  try {
    const list = await cf.call('/r2/buckets');
    if ((list?.buckets ?? []).some((b) => b.name === R2_NAME)) {
      console.log(`  R2        reuse   ${R2_NAME}`);
      return true;
    }
    await cf.call('/r2/buckets', { method: 'POST', body: { name: R2_NAME } });
    console.log(`  R2        created ${R2_NAME}`);
    return true;
  } catch (err) {
    if (isAlreadyExists(err)) {
      console.log(`  R2        reuse   ${R2_NAME}`);
      return true;
    }
    if (isR2Disabled(err)) {
      console.log(`  R2        SKIPPED — not enabled on this Cloudflare account`);
      return false;
    }
    throw err;
  }
}

async function ensureKV() {
  const list = await cf.call('/storage/kv/namespaces?per_page=100');
  const match = (list ?? []).find((ns) => ns.title === KV_TITLE);
  if (match) {
    console.log(`  KV        reuse   ${KV_TITLE} (${match.id})`);
    return match.id;
  }
  try {
    const created = await cf.call('/storage/kv/namespaces', { method: 'POST', body: { title: KV_TITLE } });
    console.log(`  KV        created ${KV_TITLE} (${created.id})`);
    return created.id;
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    const retry = await cf.call('/storage/kv/namespaces?per_page=100');
    const found = (retry ?? []).find((ns) => ns.title === KV_TITLE);
    if (!found) throw err;
    return found.id;
  }
}

/**
 * A Worker has no public URL until the account registers a workers.dev
 * subdomain — a one-time onboarding step. The name is account-wide and
 * effectively permanent, so it is only ever registered when explicitly
 * requested via the WORKERS_SUBDOMAIN variable, never guessed.
 */
async function workersSubdomain() {
  let current = null;
  try {
    const res = await cf.call('/workers/subdomain');
    current = res?.subdomain || null;
  } catch {
    return null; // token may not carry the scope; the caller falls back
  }

  if (current) {
    console.log(`  Subdomain reuse   ${current}.workers.dev`);
    return current;
  }

  const wanted = process.env.WORKERS_SUBDOMAIN?.trim().toLowerCase();
  if (!wanted) return null;

  try {
    await cf.call('/workers/subdomain', { method: 'PUT', body: { subdomain: wanted } });
    console.log(`  Subdomain created ${wanted}.workers.dev`);
    return wanted;
  } catch (err) {
    console.error(`  Subdomain FAILED  "${wanted}" — ${err.message}`);
    console.error('  It is probably already taken. Pick another WORKERS_SUBDOMAIN value.');
    return null;
  }
}

/**
 * Rewrites a key inside a specific TOML table — pass an empty table name for
 * the top-level preamble. Line-oriented rather than a full TOML parse so
 * comments and formatting survive untouched.
 */
function setTomlValue(source, table, key, value, { raw = false } = {}) {
  const lines = source.split('\n');
  let inTable = table === '';
  let replaced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = line.trim().match(/^\[\[?([^\]]+)\]\]?$/);
    if (header) {
      inTable = header[1] === table;
      continue;
    }
    if (!inTable || replaced) continue;

    const match = line.match(new RegExp(`^(\\s*)${key}\\s*=`));
    if (match) {
      lines[i] = `${match[1]}${key} = ${raw ? value : `"${value}"`}`;
      replaced = true;
    }
  }

  if (!replaced) throw new Error(`Could not find ${key} under [${table}] in wrangler.toml`);
  return lines.join('\n');
}

/** Drops a whole TOML table — used to remove the R2 binding when R2 is off. */
function removeTomlTable(source, table) {
  const lines = source.split('\n');
  const out = [];
  let skipping = false;

  for (const line of lines) {
    const header = line.trim().match(/^\[\[?([^\]]+)\]\]?$/);
    if (header) skipping = header[1] === table;
    if (!skipping) out.push(line);
  }
  return out.join('\n');
}

console.log('\nProvisioning Cloudflare resources\n');

const [databaseId, kvId] = await Promise.all([ensureD1(), ensureKV()]);
const r2Ready = await ensureR2();

let toml = readFileSync(WRANGLER, 'utf8');
toml = setTomlValue(toml, 'd1_databases', 'database_id', databaseId);
toml = setTomlValue(toml, 'kv_namespaces', 'id', kvId);
toml = setTomlValue(toml, '', 'account_id', cf.accountId);
// Binding a bucket that does not exist would fail `wrangler deploy` outright.
if (!r2Ready) toml = removeTomlTable(toml, 'r2_buckets');
writeFileSync(WRANGLER, toml);
console.log('\n  wrangler.toml updated with the resolved IDs');

if (!r2Ready) {
  console.log('');
  console.log('  ┌────────────────────────────────────────────────────────────────┐');
  console.log('  │  Product image upload is DISABLED for this deploy.             │');
  console.log('  │                                                                │');
  console.log('  │  R2 is not enabled on this Cloudflare account. Everything      │');
  console.log('  │  else — storefront, dashboard, orders, analytics — works.      │');
  console.log('  │  Products fall back to generated category artwork.             │');
  console.log('  │                                                                │');
  console.log('  │  To turn uploads on: Cloudflare dashboard → R2 → enable it     │');
  console.log('  │  (needs a payment method, the free tier is generous), then     │');
  console.log('  │  re-run this workflow. Nothing else to change.                 │');
  console.log('  └────────────────────────────────────────────────────────────────┘');
  console.log('');
}

/**
 * Preferred production setup: the API on your own hostname. wrangler creates
 * the Cloudflare custom domain itself, provided the zone sits in this account.
 */
const requestedDomain = process.env.API_DOMAIN?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

/**
 * A Worker custom domain only works when the hostname sits inside a zone this
 * Cloudflare account controls. If the domain's DNS lives elsewhere, wrangler
 * fails with "Can't infer zone from route" — so check first and fall back
 * rather than breaking the deploy.
 */
async function zoneFor(host) {
  const zones = await cf.callRoot(`/zones?account.id=${cf.accountId}&per_page=50`);
  if (!Array.isArray(zones)) return null;
  const match = zones
    .map((z) => z.name)
    .filter((name) => host === name || host.endsWith(`.${name}`))
    .sort((a, b) => b.length - a.length)[0];
  return match ?? null;
}

let apiDomain = requestedDomain;
if (apiDomain) {
  const zone = await zoneFor(apiDomain);
  if (!zone) {
    console.log('');
    console.log(`  API_DOMAIN "${apiDomain}" IGNORED — no matching zone in this Cloudflare account.`);
    console.log('  A Worker custom domain needs the domain\'s DNS hosted on Cloudflare.');
    console.log('  Add the domain as a zone (and point its nameservers at Cloudflare)');
    console.log('  to use it; falling back to workers.dev for now.');
    console.log('');
    apiDomain = '';
  } else {
    console.log(`  Zone      ${zone} (matched for ${apiDomain})`);
  }
}

if (apiDomain) {
  toml = setTomlValue(toml, '', 'workers_dev', 'false', { raw: true });
  if (!toml.includes('[[routes]]')) {
    toml += `\n[[routes]]\npattern = "${apiDomain}"\ncustom_domain = true\n`;
  } else {
    toml = setTomlValue(toml, 'routes', 'pattern', apiDomain);
  }
  writeFileSync(WRANGLER, toml);
  console.log(`  Route     ${apiDomain} (Cloudflare custom domain)`);
}

const subdomain = apiDomain ? null : await workersSubdomain();
const custom = process.env.API_BASE_URL?.trim();
const apiUrl =
  custom ||
  (apiDomain ? `https://${apiDomain}` : subdomain ? `https://${WORKER_NAME}.${subdomain}.workers.dev` : '');

if (apiUrl) {
  console.log(`  API URL   ${apiUrl}`);
} else {
  // Without a subdomain `wrangler deploy` aborts on workers_dev = true. Turning
  // it off lets the Worker still upload, so migrations and the admin account
  // are in place the moment a route exists.
  toml = setTomlValue(toml, '', 'workers_dev', 'false', { raw: true });
  writeFileSync(WRANGLER, toml);

  console.log('');
  console.log('  ┌────────────────────────────────────────────────────────────────┐');
  console.log('  │  This Cloudflare account has no workers.dev subdomain yet, so  │');
  console.log('  │  the API has no public address. One of these fixes it:         │');
  console.log('  │                                                                │');
  console.log('  │  a) Set the WORKERS_SUBDOMAIN repository variable to the name  │');
  console.log('  │     you want (e.g. "arifgadgets") and re-run. The API becomes  │');
  console.log('  │     https://arif-gadgets-api.<name>.workers.dev                │');
  console.log('  │                                                                │');
  console.log('  │  b) Register it once in the Cloudflare dashboard under         │');
  console.log('  │     Workers & Pages, then re-run.                              │');
  console.log('  │                                                                │');
  console.log('  │  c) Put the API on your own domain and set the API_BASE_URL    │');
  console.log('  │     repository variable to it.                                 │');
  console.log('  │                                                                │');
  console.log('  │  The Worker still uploads and the database is migrated, so     │');
  console.log('  │  the store is live the moment an address exists.               │');
  console.log('  └────────────────────────────────────────────────────────────────┘');
  console.log('');
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `database_id=${databaseId}\nkv_id=${kvId}\napi_url=${apiUrl}\nr2_enabled=${r2Ready}\n`,
  );
}

console.log('');
