#!/usr/bin/env node
/**
 * Creates or updates the dashboard owner account directly in D1.
 *
 * Doing this from the deploy pipeline closes the window in which the open
 * first-run `/api/admin/setup` endpoint would accept a stranger's account.
 * Re-running it resets the password to whatever ADMIN_PASSWORD currently is.
 *
 *   ADMIN_USERNAME=… ADMIN_PASSWORD=… node scripts/create-admin.mjs
 *
 * Skips quietly when the credentials are not configured. Nothing is printed
 * except the username — the password never reaches the build log.
 */

import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { client, requireEnv } from './lib/cf.mjs';

const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || 'Store Owner';
// Optional: only used for contact, never for signing in.
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || `${username}@local`;

if (!username || !password) {
  console.log('ADMIN_USERNAME / ADMIN_PASSWORD not set — skipping admin provisioning.');
  console.log('The dashboard will offer first-run account creation instead.');
  process.exit(0);
}
if (password.length < 10) {
  console.error('ADMIN_PASSWORD must be at least 10 characters.');
  process.exit(1);
}

// Must match worker/src/lib/auth.ts exactly or the login will never verify.
const salt = randomBytes(16).toString('base64');
const hash = pbkdf2Sync(password, Buffer.from(salt, 'base64'), 100_000, 32, 'sha256').toString('base64');

const databaseId = requireEnv('D1_DATABASE_ID');
const cf = client();

async function query(sql, params) {
  return cf.call(`/d1/database/${databaseId}/query`, { method: 'POST', body: { sql, params } });
}

// The row may already exist under either identifier, so update by whichever
// matches before falling back to an insert.
const existing = await query(
  'SELECT id FROM admins WHERE lower(username) = ? OR lower(email) = ? LIMIT 1',
  [username, email],
);
const found = existing?.[0]?.results?.[0];

if (found) {
  await query(
    `UPDATE admins
        SET username = ?, name = ?, password_hash = ?, salt = ?, role = 'owner'
      WHERE id = ?`,
    [username, name, hash, salt, found.id],
  );
  console.log(`Owner account updated: ${username}`);
} else {
  await query(
    `INSERT INTO admins (email, username, name, password_hash, salt, role)
     VALUES (?, ?, ?, ?, ?, 'owner')`,
    [email, username, name, hash, salt],
  );
  console.log(`Owner account created: ${username}`);
}
