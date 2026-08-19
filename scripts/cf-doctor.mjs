#!/usr/bin/env node
/**
 * Cloudflare account and API-token health check.
 *
 * Deploys fail with opaque messages like "You do not have permission to
 * perform this operation. [code: 7500]" that name neither the missing
 * permission nor the fix. This probes every capability the deploy actually
 * needs, one at a time, and prints the exact dashboard change for each
 * failure — so a token is repaired in one visit rather than five.
 *
 * Read-only apart from two probes that clean up after themselves. The token
 * is never printed; only whether each call was accepted.
 *
 *   CLOUD_FLARE_API=… CLOUD_FLARE_ACCOUNT_ID=… node scripts/cf-doctor.mjs
 */

import { client } from './lib/cf.mjs';

const cf = client();
const D1_NAME = process.env.D1_NAME ?? 'arif-gadgets';
const KV_TITLE = process.env.KV_TITLE ?? 'arif-gadgets-cache';
const SITE_DOMAIN = (process.env.API_DOMAIN ?? '').replace(/^api\./, '') || 'arifgadget.store';

/** Each entry records one capability so the summary can name the fix. */
const results = [];

async function probe(label, permission, fn) {
  try {
    const note = await fn();
    results.push({ label, permission, ok: true, note: note ?? '' });
    console.log(`  ✅ ${label.padEnd(34)} ${note ?? ''}`);
    return true;
  } catch (err) {
    const detail = (err.errors ?? []).map((e) => `${e.code} ${e.message}`).join('; ') || err.message;
    results.push({ label, permission, ok: false, note: detail });
    console.log(`  ❌ ${label.padEnd(34)} ${detail}`);
    return false;
  }
}

console.log('\nCloudflare deploy readiness\n');
console.log(`  Account ${cf.accountId.slice(0, 6)}…${cf.accountId.slice(-4)}  (masked)\n`);

/* ── account ─────────────────────────────────────────────────────────── */

await probe('Account readable', 'Account Settings: Read', async () => {
  const account = await cf.call('');
  return account?.name ? `"${account.name}"` : 'ok';
});

/**
 * Which token is actually in the repository secret, and what it can do.
 *
 * Ticking a box in the dashboard and saving it are two different things, and a
 * repository with several similarly-named secrets makes it easy to paste a new
 * token over the wrong one. Both mistakes look identical from the outside — the
 * calls simply keep getting refused — so this asks Cloudflare to name the token
 * and list its own permissions rather than inferring from failures.
 *
 * Never prints the token, only its name and the permissions attached to it.
 */
async function describeToken() {
  const verified = await cf.callRoot('/user/tokens/verify');
  if (!verified?.id) {
    console.log('  ℹ️  Token identity          could not be read (needs "User API Tokens: Read")');
    return;
  }

  let token = null;
  try {
    token = await cf.call(`/tokens/${verified.id}`);
  } catch {
    try {
      token = await cf.callRoot(`/user/tokens/${verified.id}`);
    } catch {
      /* fall through */
    }
  }

  if (!token) {
    console.log(`  ℹ️  Token identity          id ${verified.id.slice(0, 8)}… — status ${verified.status}`);
    console.log('      Its permission list is not readable with this token, so the checks below');
    console.log('      are the only evidence of what it can do.');
    return;
  }

  const groups = (token.policies ?? []).flatMap((p) => (p.permission_groups ?? []).map((g) => g.name));
  const writes = groups.filter((name) => /write|edit/i.test(name));

  console.log(`  ℹ️  Token in CLOUD_FLARE_API  "${token.name ?? 'unnamed'}" — ${groups.length} permissions`);
  console.log(`      of which write-capable:   ${writes.length}`);
  for (const name of ['D1', 'Workers Scripts', 'Workers KV Storage', 'Workers R2 Storage']) {
    const held = groups.filter((g) => g.startsWith(name));
    const canWrite = held.some((g) => /write|edit/i.test(g));
    console.log(`      ${canWrite ? '✅' : '❌'} ${name.padEnd(20)} ${held.join(', ') || 'not granted at all'}`);
  }
  console.log('');
}

await describeToken();

/* ── D1 ──────────────────────────────────────────────────────────────── */

let databaseId = null;

await probe('D1 databases listable', 'D1: Read (or Edit)', async () => {
  const list = await cf.call(`/d1/database?name=${encodeURIComponent(D1_NAME)}&per_page=50`);
  const match = (list ?? []).find((db) => db.name === D1_NAME);
  databaseId = match?.uuid ?? null;
  return match ? `${D1_NAME} → ${match.uuid}` : `no database named ${D1_NAME} yet`;
});

// The one that broke the deploy: migrations are writes, and a read-only token
// is refused with 7500 the moment one runs.
//
// It has to be probed with an actual write. D1 happily runs a SELECT through
// the same endpoint for a read-only token, so probing with one reports a false
// green and the deploy dies a step later instead.
await probe('D1 writes allowed', 'D1: Edit', async () => {
  if (!databaseId) throw new Error('skipped — no database resolved above');
  await cf.call(`/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: { sql: "UPDATE settings SET value = value WHERE key = '__doctor_write_probe__'" },
  });
  const tables = await cf.call(`/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: { sql: "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'" },
  });
  const n = tables?.[0]?.results?.[0]?.n ?? '?';
  return `write accepted — database holds ${n} table(s)`;
});

/* ── KV ──────────────────────────────────────────────────────────────── */

let kvId = null;

await probe('KV namespaces listable', 'Workers KV Storage: Read (or Edit)', async () => {
  const list = await cf.call('/storage/kv/namespaces?per_page=100');
  const match = (list ?? []).find((ns) => ns.title === KV_TITLE);
  kvId = match?.id ?? null;
  return match ? `${KV_TITLE} → ${match.id}` : `no namespace named ${KV_TITLE} yet`;
});

await probe('KV writes allowed', 'Workers KV Storage: Edit', async () => {
  if (!kvId) throw new Error('skipped — no namespace resolved above');
  const key = '__cf_doctor__';
  await cf.call(`/storage/kv/namespaces/${kvId}/bulk`, {
    method: 'PUT',
    body: [{ key, value: 'probe', expiration_ttl: 60 }],
  });
  // Leave nothing behind; the TTL is only a safety net if this delete fails.
  await cf.call(`/storage/kv/namespaces/${kvId}/bulk`, { method: 'DELETE', body: [key] });
  return 'write and delete both accepted';
});

/* ── Workers ─────────────────────────────────────────────────────────── */

/**
 * Read-only on purpose, and therefore not proof of anything.
 *
 * The only call that proves a token can publish is uploading a script, and a
 * diagnostic must not deploy over the live Worker to find out. So this reports
 * what it can see and the summary below always asks for Workers Scripts: Edit
 * alongside any other missing permission — a token short of one Edit is
 * invariably short of that one too, and a green tick here has already been
 * misread once as "publishing works".
 */
await probe('Worker scripts listable (read only)', 'Workers Scripts: Edit', async () => {
  const scripts = await cf.call('/workers/scripts');
  const names = (scripts ?? []).map((s) => s.id);
  return `${names.length ? names.join(', ') : 'none deployed yet'} — publishing is not probed here`;
});

let subdomain = null;

await probe('workers.dev subdomain', 'Workers Scripts: Edit', async () => {
  const res = await cf.call('/workers/subdomain');
  subdomain = res?.subdomain || null;
  return subdomain ? `${subdomain}.workers.dev` : 'NOT REGISTERED — the API would have no public address';
});

/* ── R2 and zones ────────────────────────────────────────────────────── */

await probe('R2 enabled', 'Workers R2 Storage: Edit', async () => {
  const list = await cf.call('/r2/buckets');
  const names = (list?.buckets ?? []).map((b) => b.name);
  return names.length ? names.join(', ') : 'enabled, no buckets yet';
});

await probe(`Zone for ${SITE_DOMAIN}`, 'Zone: Read', async () => {
  const zones = await cf.callRoot(`/zones?account.id=${cf.accountId}&per_page=50`);
  if (!Array.isArray(zones)) throw new Error('zone list refused — token has no Zone:Read, or none exist');
  const match = zones.find((z) => z.name === SITE_DOMAIN);
  return match ? `hosted here (${match.status})` : `not in this account — API stays on workers.dev`;
});

/* ── verdict ─────────────────────────────────────────────────────────── */

const failed = results.filter((r) => !r.ok);
const missing = [...new Set(failed.map((r) => r.permission))];

// Publishing cannot be probed without deploying, so it is inferred: a token
// missing any Edit permission has never yet turned out to hold this one.
if (missing.length && !missing.includes('Workers Scripts: Edit')) {
  missing.push('Workers Scripts: Edit (cannot be probed — asked for on principle)');
}

console.log('\n────────────────────────────────────────────────────────────────\n');

if (failed.length === 0 && subdomain) {
  console.log('  Everything the deploy needs is in place. Re-run the Deploy workflow.\n');
  process.exit(0);
}

if (missing.length) {
  console.log('  The API token is missing permissions. Fix it once, in one place:\n');
  console.log('    Cloudflare dashboard → My Profile → API Tokens → your token → Edit');
  console.log('    Add these permissions, all of type Account:\n');
  for (const permission of missing) console.log(`      • ${permission}`);
  console.log('\n    Then Continue → Save, and update the CLOUD_FLARE_API repository secret');
  console.log('    if the token value changed.\n');
  console.log('    Faster alternative: create a fresh token from the "Edit Cloudflare');
  console.log('    Workers" template — it grants Workers, KV, D1 and R2 in one click —');
  console.log('    and paste it into the CLOUD_FLARE_API secret.\n');
}

if (!subdomain) {
  console.log('  This account has no workers.dev subdomain, so the Worker has nowhere');
  console.log('  to answer from and the storefront build stops. Pick a name once:\n');
  console.log('    Set the WORKERS_SUBDOMAIN repository variable (Settings → Secrets and');
  console.log('    variables → Actions → Variables) to the name you want, e.g. arifgadget.');
  console.log('    The next deploy registers it and the API becomes');
  console.log('    https://arif-gadgets-api.<name>.workers.dev\n');
  console.log('    Or register it by hand: Cloudflare dashboard → Workers & Pages →');
  console.log('    the subdomain prompt shown on first visit.\n');
}

// Reporting a problem is the job here; a red X would hide the report behind a
// failed step for no benefit.
process.exit(0);
