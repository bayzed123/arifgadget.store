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

async function workersSubdomain() {
  try {
    const res = await cf.call('/workers/subdomain');
    return res?.subdomain ?? null;
  } catch {
    return null; // token may not carry the scope; the caller falls back
  }
}

/**
 * Rewrites a key inside a specific TOML table — pass an empty table name for
 * the top-level preamble. Line-oriented rather than a full TOML parse so
 * comments and formatting survive untouched.
 */
function setTomlValue(source, table, key, value) {
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
      lines[i] = `${match[1]}${key} = "${value}"`;
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

const subdomain = await workersSubdomain();
const apiUrl = process.env.API_BASE_URL || (subdomain ? `https://${WORKER_NAME}.${subdomain}.workers.dev` : '');

if (apiUrl) console.log(`  API URL   ${apiUrl}`);
else console.log('  API URL   unknown — set the API_BASE_URL repository variable');

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `database_id=${databaseId}\nkv_id=${kvId}\napi_url=${apiUrl}\nr2_enabled=${r2Ready}\n`,
  );
}

console.log('');
