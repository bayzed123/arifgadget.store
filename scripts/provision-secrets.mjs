#!/usr/bin/env node
/**
 * Puts the Worker's secrets in place: a JWT signing key, and the Steadfast
 * courier credentials.
 *
 * JWT_SECRET is written through when the repository provides one; otherwise a
 * strong random value is generated on the first deploy and then left alone
 * forever after — rotating it on every run would sign every admin out each
 * deploy.
 *
 * The courier keys are only ever written when the repository supplies them.
 * Writing an empty string instead would be worse than leaving them unset: the
 * Worker would believe it was configured and every courier call would fail
 * against the portal, rather than the dashboard simply saying "not connected".
 *
 * Run after `wrangler deploy` (the script has to exist first). Worker secrets
 * take effect immediately, so no redeploy is needed. No secret value is ever
 * printed — only its name and what happened to it.
 */

import { randomBytes } from 'node:crypto';
import { client } from './lib/cf.mjs';

const WORKER = process.env.WORKER_NAME ?? 'arif-gadgets-api';
const cf = client();

const existing = await cf.call(`/workers/scripts/${WORKER}/secrets`).catch(() => []);
const names = new Set((existing ?? []).map((entry) => entry.name));

async function put(name, text) {
  await cf.call(`/workers/scripts/${WORKER}/secrets`, {
    method: 'PUT',
    body: { name, text, type: 'secret_text' },
  });
}

if (process.env.JWT_SECRET) {
  await put('JWT_SECRET', process.env.JWT_SECRET);
  console.log('JWT_SECRET set from the repository secret.');
} else if (names.has('JWT_SECRET')) {
  console.log('JWT_SECRET already present on the Worker — left unchanged.');
} else {
  await put('JWT_SECRET', randomBytes(48).toString('base64url'));
  console.log('JWT_SECRET generated and stored on the Worker (first deploy).');
}

/**
 * Steadfast courier credentials. Absent is a valid, working state — the
 * courier panel reports itself as not connected and the rest of the shop is
 * unaffected — so a missing key is reported, never invented.
 */
const COURIER_SECRETS = {
  STEADFAST_API_KEY: 'the courier panel reports itself as not connected',
  STEADFAST_SECRET_KEY: 'the courier panel reports itself as not connected',
  // Genuinely optional, and the shop is fully connected without it — saying
  // otherwise made a healthy deploy read like a broken one.
  STEADFAST_WEBHOOK_TOKEN: 'courier updates arrive on refresh rather than instantly, which is fine',
};

for (const [name, consequence] of Object.entries(COURIER_SECRETS)) {
  const value = process.env[name]?.trim();
  if (value) {
    await put(name, value);
    console.log(`${name} set from the repository secret.`);
  } else if (names.has(name)) {
    console.log(`${name} already present on the Worker — left unchanged.`);
  } else {
    console.log(`${name} not provided — ${consequence}.`);
  }
}

/**
 * Google service-account credentials (a full JSON key), for the Analytics
 * panel to call GA4 and Search Console with real data. Same "absent is fine"
 * rule as the courier keys: without it the panel reports itself as not
 * connected instead of the dashboard failing to load.
 *
 * The value is the entire downloaded JSON key file, pasted as one repository
 * secret — never written to a file in this repository, never logged, and
 * this script only ever reports whether it was set, not what it holds.
 */
const value = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
if (value) {
  await put('GOOGLE_SERVICE_ACCOUNT_JSON', value);
  console.log('GOOGLE_SERVICE_ACCOUNT_JSON set from the repository secret.');
} else if (names.has('GOOGLE_SERVICE_ACCOUNT_JSON')) {
  console.log('GOOGLE_SERVICE_ACCOUNT_JSON already present on the Worker — left unchanged.');
} else {
  console.log('GOOGLE_SERVICE_ACCOUNT_JSON not provided — the Analytics panel reports itself as not connected.');
}
