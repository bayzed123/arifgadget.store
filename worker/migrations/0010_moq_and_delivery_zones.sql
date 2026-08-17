-- Order from one piece, and pay delivery by zone.
--
-- 1. Minimum order quantity drops to 1 on every product. The shop sells to
--    retailers who want a carton and to walk-ins who want a single piece;
--    forcing a five-unit minimum lost the second group. Volume tiers still
--    reward buying more — they just no longer gate buying at all.
--
-- 2. Delivery is charged by zone instead of one flat national rate:
--       inside Dhaka  ৳90
--       rest of Bangladesh ৳130
--    Amounts are poisha, as everywhere else in this schema.

UPDATE products SET moq = 1 WHERE moq <> 1;

INSERT INTO settings (key, value) VALUES ('shipping_dhaka', '9000')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('shipping_outside', '13000')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

-- Which zone the shopper picked, so the order keeps the rate it was quoted
-- even if the shop changes its charges later. No CHECK constraint: this
-- schema has already been bitten once by an un-alterable one.
ALTER TABLE orders ADD COLUMN delivery_zone TEXT NOT NULL DEFAULT 'outside';
