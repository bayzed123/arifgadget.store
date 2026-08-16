#!/usr/bin/env node
/**
 * Makes sure the deployed Worker has a JWT_SECRET.
 *
 * If the repository provides one it is written through; otherwise a strong
 * random value is generated on the first deploy and then left alone forever
 * after — rotating it on every run would sign every admin out each deploy.
 *
 * Run after `wrangler deploy` (the script has to exist first). Worker secrets
 * take effect immediately, so no redeploy is needed.
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
