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

// No Gemini API keys to provision any more — the admin assistant, support
// chat, daily health check, and weekly developer report all run on
// Cloudflare Workers AI now (see worker/src/lib/ai.ts), authenticated by
// this same Cloudflare account via the [ai] binding in wrangler.toml rather
// than a per-feature secret. This codebase used to carry four separate
// Gemini keys here (ADMIN_GEMINI_API_KEY, SUPPORT_GEMINI_API_KEY,
// ALERT_GEMINI_API_KEY, DEVLOPER_REPORT_GEMENI) until the Google Cloud
// project behind them was denied access to the Gemini API outright — see
// ai.ts's own comment for the full story.

/**
 * Optional second, independent free provider for the same four AI features
 * — tried only when Workers AI itself fails (see lib/ai.ts). Absent is
 * fine: everything keeps running on Workers AI alone.
 */
if (process.env.GROQ_API_KEY) {
  await put('GROQ_API_KEY', process.env.GROQ_API_KEY);
  console.log('GROQ_API_KEY set from the repository secret.');
} else if (names.has('GROQ_API_KEY')) {
  console.log('GROQ_API_KEY already present on the Worker — left unchanged.');
} else {
  console.log('GROQ_API_KEY not provided — the AI features run on Workers AI alone, with no fallback.');
}

/**
 * Secret path segment for the weekly developer report's manual GitHub
 * Actions trigger (see .github/workflows/dev-report-trigger.yml). Same
 * "absent is fine" rule as everything else here: without it the trigger
 * workflow's request 404s and the report simply keeps running on its
 * Monday cron and the dashboard's Run now button instead.
 */
const devReportTriggerToken = process.env.DEV_REPORT_TRIGGER_TOKEN?.trim();
if (devReportTriggerToken) {
  await put('DEV_REPORT_TRIGGER_TOKEN', devReportTriggerToken);
  console.log('DEV_REPORT_TRIGGER_TOKEN set from the repository secret.');
} else if (names.has('DEV_REPORT_TRIGGER_TOKEN')) {
  console.log('DEV_REPORT_TRIGGER_TOKEN already present on the Worker — left unchanged.');
} else {
  console.log('DEV_REPORT_TRIGGER_TOKEN not provided — the GitHub Actions manual trigger will not work yet.');
}

/**
 * Resend API key for the new-order alert email (worker/src/lib/email.ts).
 * Same "absent is fine" rule as everything else here: without it, checkout
 * just doesn't send an email — nothing about placing an order depends on it.
 */
const resendApiKey = process.env.RESEND_API_KEY?.trim();
if (resendApiKey) {
  await put('RESEND_API_KEY', resendApiKey);
  console.log('RESEND_API_KEY set from the repository secret.');
} else if (names.has('RESEND_API_KEY')) {
  console.log('RESEND_API_KEY already present on the Worker — left unchanged.');
} else {
  console.log('RESEND_API_KEY not provided — new-order alert emails will not be sent.');
}

/**
 * Meta browser/server tracking. The Pixel ID is public in the storefront,
 * while META-CAPI is only read by the Worker. Empty repository values leave
 * existing Cloudflare secrets untouched.
 */
const META_SECRETS = {
  'DATA-META-PIXEL-ID': process.env.DATA_META_PIXEL_ID,
  'META-CAPI': process.env.META_CAPI,
};
for (const [name, raw] of Object.entries(META_SECRETS)) {
  const value = raw?.trim();
  if (value) {
    await put(name, value);
    console.log(`${name} set from the repository secret.`);
  } else if (names.has(name)) {
    console.log(`${name} already present on the Worker — left unchanged.`);
  } else {
    console.log(`${name} not provided — Meta server-side tracking is not configured yet.`);
  }
}
