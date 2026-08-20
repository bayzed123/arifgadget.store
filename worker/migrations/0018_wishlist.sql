-- Customer wishlists.
--
-- Requires a signed-in account, same as order history — there is nowhere
-- meaningful to keep a saved-items list for a guest checkout, and a phone
-- number alone (the tracking pattern used for reviews) is not proof of who
-- is asking, only proof of what they bought.

CREATE TABLE IF NOT EXISTS wishlist_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Saving the same product twice is a no-op, not a second row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlist_once ON wishlist_items(customer_id, product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_customer ON wishlist_items(customer_id, created_at DESC);
