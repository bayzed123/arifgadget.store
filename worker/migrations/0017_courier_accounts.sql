-- Multiple courier accounts, added from the dashboard instead of a GitHub secret.
--
-- Until now the shop only ever had one Steadfast account, wired in at deploy
-- time as a Worker secret — right for a single account, but the owner runs a
-- second Steadfast account too, and there was no way to add it without a
-- developer editing repository secrets and redeploying. This table lets staff
-- add, switch and remove accounts themselves from Settings.
--
-- Keys are stored encrypted (AES-GCM, keyed from JWT_SECRET — see
-- worker/src/lib/crypto.ts) rather than in plain text, and the dashboard is
-- never handed the decrypted value back: `api_key_length`/`secret_key_length`
-- exist purely so the "present (32 characters)" style check the courier
-- banner already did for the old env-secret account keeps working without
-- ever decrypting a key just to report its size.
--
-- `provider` is deliberately here even though every row today is Steadfast:
-- it is the seam a genuinely different courier (Pathao, RedX, ...) would plug
-- into later without another migration.
CREATE TABLE courier_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'steadfast',
  label TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  secret_key_enc TEXT NOT NULL,
  api_key_length INTEGER NOT NULL,
  secret_key_length INTEGER NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  -- Exactly one account per provider is active at a time; enforced in
  -- application code (unset the others in the same request that sets this
  -- one), not by a constraint — SQLite has no partial-unique-index shorthand
  -- for "unique where is_active = 1" that ALTER TABLE can add later.
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_courier_accounts_active ON courier_accounts(provider, is_active);

-- Which account booked this order, for support: "why did this parcel go out
-- under the wrong Steadfast account" needs an answer that outlives whichever
-- account is active *now*. Null means it was booked before this table
-- existed, through the old env-secret account.
ALTER TABLE orders ADD COLUMN courier_account_id INTEGER;
