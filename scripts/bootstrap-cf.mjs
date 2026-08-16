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

async function ensureR2() {
  const list = await cf.call('/r2/buckets');
  if ((list?.buckets ?? []).some((b) => b.name === R2_NAME)) {
    console.log(`  R2        reuse   ${R2_NAME}`);
    return;
  }
  try {
    await cf.call('/r2/buckets', { method: 'POST', body: { name: R2_NAME } });
    console.log(`  R2        created ${R2_NAME}`);
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    console.log(`  R2        reuse   ${R2_NAME}`);
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

console.log('\nProvisioning Cloudflare resources\n');

const [databaseId, kvId] = await Promise.all([ensureD1(), ensureKV()]);
await ensureR2();

let toml = readFileSync(WRANGLER, 'utf8');
toml = setTomlValue(toml, 'd1_databases', 'database_id', databaseId);
toml = setTomlValue(toml, 'kv_namespaces', 'id', kvId);
toml = setTomlValue(toml, '', 'account_id', cf.accountId);
writeFileSync(WRANGLER, toml);
console.log('\n  wrangler.toml updated with the resolved IDs');

const subdomain = await workersSubdomain();
const apiUrl = process.env.API_BASE_URL || (subdomain ? `https://${WORKER_NAME}.${subdomain}.workers.dev` : '');

if (apiUrl) console.log(`  API URL   ${apiUrl}`);
else console.log('  API URL   unknown — set the API_BASE_URL repository variable');

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `database_id=${databaseId}\nkv_id=${kvId}\napi_url=${apiUrl}\n`,
  );
}

console.log('');
