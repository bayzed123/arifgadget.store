-- Customer accounts and promotional banners.

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Phone is the identity here: everyone has one, and it is already what
  -- order tracking and delivery are keyed on.
  phone         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_login_at INTEGER
);

-- Guest checkout stays supported, so this is nullable.
ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS banners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  subtitle   TEXT NOT NULL DEFAULT '',
  image_url  TEXT NOT NULL DEFAULT '',
  link_url   TEXT NOT NULL DEFAULT '',
  cta_label  TEXT NOT NULL DEFAULT 'Shop the offer',
  -- popup = modal on arrival, home = strip on the homepage, both = each
  placement  TEXT NOT NULL DEFAULT 'popup' CHECK (placement IN ('popup','home','both')),
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  starts_at  INTEGER,
  ends_at    INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 50,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(active, sort_order);

-- A starter offer so the popup can be seen working; edit or switch it off in
-- the dashboard under Content → Offers.
INSERT OR IGNORE INTO banners (id, title, subtitle, link_url, cta_label, placement, active, sort_order)
VALUES (1,
        'Volume pricing on every carton',
        'Unit prices drop automatically as your quantity grows — no codes, no haggling.',
        '/catalog?sort=discount', 'See the offers', 'both', 1, 10);
