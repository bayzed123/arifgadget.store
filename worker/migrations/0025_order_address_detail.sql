-- Structured address fields captured alongside the existing free-text
-- address/city, once the checkout's postcode/district/upazila auto-fill
-- (see bd_districts/bd_upazilas/bd_postcodes, migration 0023) resolves them.
-- All optional and additive — a guest who never sees the new picker (or an
-- older client hitting this API) still checks out exactly as before.
ALTER TABLE orders ADD COLUMN upazila  TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN union_name TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN postcode TEXT NOT NULL DEFAULT '';
