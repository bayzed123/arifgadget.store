-- Customer ratings, colour variants, and per-product return eligibility.
--
-- Three things the shop asked for that all touch the catalogue, kept in one
-- migration because the product page renders them together.

-- ============================================================
--  Ratings from customers who actually bought the thing
-- ============================================================
--
-- `products.rating` and `review_count` already existed but held seeded
-- numbers — plausible-looking figures nobody earned. This gives them a real
-- source, and the trigger below keeps the two columns as a running summary so
-- the catalogue list stays a single cheap query.
--
-- Eligibility is enforced at write time in the Worker, not here: a rating is
-- only accepted from a phone number with a *delivered* order containing that
-- product. Storing `order_id` records which purchase earned the right, and the
-- unique index makes a second rating for the same purchase impossible.
CREATE TABLE IF NOT EXISTS reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- The order that entitles this rating. Kept even if the order is later
  -- deleted, so the review does not silently vanish from the average.
  order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  customer_phone TEXT NOT NULL,
  customer_name  TEXT NOT NULL DEFAULT '',
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT NOT NULL DEFAULT '',
  -- Staff can hide a review without deleting the evidence.
  visible       INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- One rating per customer per product per order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_once
  ON reviews(product_id, customer_phone, order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, visible, created_at DESC);

/**
 * Keeping products.rating and review_count true.
 *
 * Recalculated from the reviews themselves rather than incremented, because an
 * average maintained by addition drifts the first time a row is hidden or
 * removed — and hiding a review is a thing staff can do.
 */
CREATE TRIGGER IF NOT EXISTS trg_reviews_ai
AFTER INSERT ON reviews
FOR EACH ROW
BEGIN
  UPDATE products SET
    rating = (SELECT COALESCE(ROUND(AVG(rating), 2), 0) FROM reviews WHERE product_id = NEW.product_id AND visible = 1),
    review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id AND visible = 1)
  WHERE id = NEW.product_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_reviews_au
AFTER UPDATE ON reviews
FOR EACH ROW
BEGIN
  UPDATE products SET
    rating = (SELECT COALESCE(ROUND(AVG(rating), 2), 0) FROM reviews WHERE product_id = NEW.product_id AND visible = 1),
    review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id AND visible = 1)
  WHERE id = NEW.product_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_reviews_ad
AFTER DELETE ON reviews
FOR EACH ROW
BEGIN
  UPDATE products SET
    rating = (SELECT COALESCE(ROUND(AVG(rating), 2), 0) FROM reviews WHERE product_id = OLD.product_id AND visible = 1),
    review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = OLD.product_id AND visible = 1)
  WHERE id = OLD.product_id;
END;

-- The seeded figures were never earned by anyone. Clearing them means a star
-- rating on the site always represents a real customer, and a product with no
-- ratings honestly shows none.
UPDATE products SET rating = 0, review_count = 0;

-- ============================================================
--  Colour variants
-- ============================================================
--
-- A JSON array of colour names, e.g. ["Black","Silver","Blue"]. Deliberately
-- not a separate table with its own stock: the shop counts stock per product,
-- not per colour, and inventing per-colour inventory would make every existing
-- stock figure wrong. The customer picks a colour, it is recorded on the order
-- line, and staff pack accordingly.
ALTER TABLE products ADD COLUMN colours TEXT NOT NULL DEFAULT '[]';

-- Which colour this line was ordered in. Empty when the product has none.
ALTER TABLE order_items ADD COLUMN colour TEXT NOT NULL DEFAULT '';

-- ============================================================
--  Return eligibility, decided per product by staff
-- ============================================================
--
-- Most stock is returnable; clearance and sealed-software lines are not. The
-- product page states which, so a customer knows before buying rather than
-- after.
ALTER TABLE products ADD COLUMN returnable INTEGER NOT NULL DEFAULT 1;

-- ============================================================
--  Shop identity
-- ============================================================

-- The registered name, for invoices and anywhere the shop states who it is.
-- `store_name` stays as the shorter brand used in the site header and logo.
INSERT INTO settings (key, value) VALUES ('legal_name', 'ARIF GADGET STORE')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('support_email', 'arifgadgetstore@gmail.com')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');

INSERT INTO settings (key, value) VALUES ('support_whatsapp_url', 'https://wa.me/8801400290828')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now');
