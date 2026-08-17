-- Mobile-banking payment details and the customer's transaction reference.
--
-- When a shopper picks bKash, Nagad or Rocket they need to know which number
-- to send money to, and the shop needs the TrxID they get back. Both were
-- missing: the method was recorded but nothing told the customer what to do
-- with it, and no field existed to prove payment.

INSERT INTO settings (key, value) VALUES ('bkash_number', '01400290828')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('nagad_number', '01400290828')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('rocket_number', '01400290828')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('bank_details', 'Account name: Arif Gadgets · Ask us for the current account number before transferring.')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

-- The order number the shop sends money to WhatsApp, so every order can be
-- forwarded as a message the moment it is placed.
INSERT INTO settings (key, value) VALUES ('order_whatsapp', '8801400290828')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

-- What the customer typed after sending money: a bKash/Nagad/Rocket TrxID, or
-- a bank reference. Free text, because each provider formats it differently.
ALTER TABLE orders ADD COLUMN payment_reference TEXT NOT NULL DEFAULT '';
