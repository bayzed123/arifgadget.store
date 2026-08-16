-- Arif Gadgets — core schema
-- Money is stored in minor units (poisha/cents) as INTEGER to avoid float drift.

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin','staff')),
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '📦',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS products (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  sku                 TEXT NOT NULL UNIQUE,
  slug                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  brand               TEXT NOT NULL DEFAULT '',
  category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  summary             TEXT NOT NULL DEFAULT '',
  description         TEXT NOT NULL DEFAULT '',

  -- pricing (minor units)
  cost_price          INTEGER NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  price               INTEGER NOT NULL CHECK (price >= 0),
  compare_at_price    INTEGER NOT NULL DEFAULT 0 CHECK (compare_at_price >= 0),

  -- inventory
  -- the non-negative constraint is what makes overselling impossible: a
  -- concurrent checkout that would drive stock below zero aborts its transaction
  stock               INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  moq                 INTEGER NOT NULL DEFAULT 1 CHECK (moq >= 1),
  units_sold          INTEGER NOT NULL DEFAULT 0,

  image_url           TEXT NOT NULL DEFAULT '',
  gallery             TEXT NOT NULL DEFAULT '[]',   -- JSON array of urls
  specs               TEXT NOT NULL DEFAULT '{}',   -- JSON object
  tags                TEXT NOT NULL DEFAULT '',     -- comma separated

  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  featured            INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  rating              REAL NOT NULL DEFAULT 0,
  review_count        INTEGER NOT NULL DEFAULT 0,

  created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  -- ==== automated calculation: derived on every read, never stored stale ====
  profit_per_unit     INTEGER GENERATED ALWAYS AS (price - cost_price) VIRTUAL,
  margin_pct          REAL    GENERATED ALWAYS AS (
                        CASE WHEN price > 0
                             THEN ROUND((price - cost_price) * 100.0 / price, 2)
                             ELSE 0 END) VIRTUAL,
  markup_pct          REAL    GENERATED ALWAYS AS (
                        CASE WHEN cost_price > 0
                             THEN ROUND((price - cost_price) * 100.0 / cost_price, 2)
                             ELSE 0 END) VIRTUAL,
  discount_pct        REAL    GENERATED ALWAYS AS (
                        CASE WHEN compare_at_price > price AND compare_at_price > 0
                             THEN ROUND((compare_at_price - price) * 100.0 / compare_at_price, 0)
                             ELSE 0 END) VIRTUAL,
  stock_value         INTEGER GENERATED ALWAYS AS (stock * cost_price) VIRTUAL,
  retail_value        INTEGER GENERATED ALWAYS AS (stock * price) VIRTUAL,
  stock_state         TEXT    GENERATED ALWAYS AS (
                        CASE WHEN stock <= 0 THEN 'out'
                             WHEN stock <= low_stock_threshold THEN 'low'
                             ELSE 'ok' END) VIRTUAL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_created  ON products(created_at DESC);

-- Alibaba-style volume pricing: unit price drops as quantity climbs.
CREATE TABLE IF NOT EXISTS price_tiers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_qty    INTEGER NOT NULL CHECK (min_qty >= 1),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  UNIQUE (product_id, min_qty)
);
CREATE INDEX IF NOT EXISTS idx_tiers_product ON price_tiers(product_id, min_qty);

-- Append-only inventory ledger. Every stock change on the site lands here.
CREATE TABLE IF NOT EXISTS stock_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta         INTEGER NOT NULL,
  reason        TEXT NOT NULL CHECK (reason IN ('restock','sale','return','adjustment','damage','initial')),
  ref_type      TEXT NOT NULL DEFAULT '',
  ref_id        INTEGER,
  balance_after INTEGER NOT NULL,
  unit_cost     INTEGER NOT NULL DEFAULT 0,
  note          TEXT NOT NULL DEFAULT '',
  actor         TEXT NOT NULL DEFAULT 'system',
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_moves_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moves_created ON stock_movements(created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no       TEXT NOT NULL UNIQUE,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  city           TEXT NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'cod',

  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','packed','shipped','delivered','cancelled','refunded')),

  -- maintained by triggers below
  subtotal       INTEGER NOT NULL DEFAULT 0,
  cost_total     INTEGER NOT NULL DEFAULT 0,
  discount       INTEGER NOT NULL DEFAULT 0,
  shipping       INTEGER NOT NULL DEFAULT 0,
  tax            INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL DEFAULT 0,
  profit         INTEGER NOT NULL DEFAULT 0,

  created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  margin_pct     REAL GENERATED ALWAYS AS (
                   CASE WHEN (subtotal - discount) > 0
                        THEN ROUND(profit * 100.0 / (subtotal - discount), 2)
                        ELSE 0 END) VIRTUAL,
  -- revenue is only recognised once an order leaves 'pending' and isn't reversed
  counts_as_sale INTEGER GENERATED ALWAYS AS (
                   CASE WHEN status IN ('confirmed','packed','shipped','delivered')
                        THEN 1 ELSE 0 END) VIRTUAL
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  sku         TEXT NOT NULL,
  name        TEXT NOT NULL,
  image_url   TEXT NOT NULL DEFAULT '',
  qty         INTEGER NOT NULL CHECK (qty > 0),
  -- price/cost are snapshotted at purchase time so history stays truthful
  unit_price  INTEGER NOT NULL CHECK (unit_price >= 0),
  unit_cost   INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),

  line_total  INTEGER GENERATED ALWAYS AS (qty * unit_price) VIRTUAL,
  line_cost   INTEGER GENERATED ALWAYS AS (qty * unit_cost) VIRTUAL,
  line_profit INTEGER GENERATED ALWAYS AS (qty * (unit_price - unit_cost)) VIRTUAL
);
CREATE INDEX IF NOT EXISTS idx_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT NOT NULL DEFAULT 'system',
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);


-- ============================================================
--  TRIGGERS — the automated calculation layer
-- ============================================================

-- Keep products.updated_at honest.
CREATE TRIGGER IF NOT EXISTS trg_products_touch
AFTER UPDATE ON products
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE products SET updated_at = strftime('%s','now') WHERE id = NEW.id;
END;

-- Recalculate an order's money columns from its line items.
CREATE TRIGGER IF NOT EXISTS trg_order_items_ai
AFTER INSERT ON order_items
FOR EACH ROW
BEGIN
  -- 1. draw down inventory and bump the popularity counter
  UPDATE products
     SET stock      = stock - NEW.qty,
         units_sold = units_sold + NEW.qty,
         updated_at = strftime('%s','now')
   WHERE id = NEW.product_id;

  -- 2. write the ledger entry with the resulting balance
  INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id, balance_after, unit_cost, note)
  SELECT NEW.product_id, -NEW.qty, 'sale', 'order', NEW.order_id, p.stock, NEW.unit_cost,
         'Order line #' || NEW.id
    FROM products p WHERE p.id = NEW.product_id;

  -- 3. re-roll the order totals
  UPDATE orders SET
    subtotal   = (SELECT COALESCE(SUM(qty * unit_price), 0) FROM order_items WHERE order_id = NEW.order_id),
    cost_total = (SELECT COALESCE(SUM(qty * unit_cost),  0) FROM order_items WHERE order_id = NEW.order_id),
    updated_at = strftime('%s','now')
  WHERE id = NEW.order_id;

  UPDATE orders SET
    total  = subtotal - discount + shipping + tax,
    profit = (subtotal - discount) - cost_total
  WHERE id = NEW.order_id;
END;

-- Editing shipping/discount/tax must re-derive total and profit.
CREATE TRIGGER IF NOT EXISTS trg_orders_money_au
AFTER UPDATE OF discount, shipping, tax ON orders
FOR EACH ROW
BEGIN
  UPDATE orders SET
    total      = subtotal - discount + shipping + tax,
    profit     = (subtotal - discount) - cost_total,
    updated_at = strftime('%s','now')
  WHERE id = NEW.id;
END;

-- Cancelling or refunding an order returns every unit to the shelf, once.
CREATE TRIGGER IF NOT EXISTS trg_orders_restock
AFTER UPDATE OF status ON orders
FOR EACH ROW
WHEN NEW.status IN ('cancelled','refunded') AND OLD.status NOT IN ('cancelled','refunded')
BEGIN
  UPDATE products
     SET stock      = stock + (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = NEW.id AND product_id = products.id),
         units_sold = units_sold - (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = NEW.id AND product_id = products.id),
         updated_at = strftime('%s','now')
   WHERE id IN (SELECT product_id FROM order_items WHERE order_id = NEW.id AND product_id IS NOT NULL);

  INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id, balance_after, unit_cost, note)
  SELECT oi.product_id, oi.qty,
         CASE WHEN NEW.status = 'refunded' THEN 'return' ELSE 'adjustment' END,
         'order', NEW.id, p.stock, oi.unit_cost,
         'Auto-restock: order ' || NEW.order_no || ' → ' || NEW.status
    FROM order_items oi JOIN products p ON p.id = oi.product_id
   WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL;
END;

-- A new product opens its ledger with its starting count.
CREATE TRIGGER IF NOT EXISTS trg_products_ai
AFTER INSERT ON products
FOR EACH ROW WHEN NEW.stock <> 0
BEGIN
  INSERT INTO stock_movements (product_id, delta, reason, ref_type, balance_after, unit_cost, note, actor)
  VALUES (NEW.id, NEW.stock, 'initial', 'product', NEW.stock, NEW.cost_price, 'Opening stock', 'admin');
END;

-- Manual stock edits from the dashboard still get a ledger row.
CREATE TRIGGER IF NOT EXISTS trg_products_stock_au
AFTER UPDATE OF stock ON products
FOR EACH ROW
WHEN NEW.stock <> OLD.stock
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements
     WHERE product_id = NEW.id AND balance_after = NEW.stock
       AND created_at >= strftime('%s','now') - 2
  )
BEGIN
  INSERT INTO stock_movements (product_id, delta, reason, ref_type, balance_after, unit_cost, note, actor)
  VALUES (NEW.id, NEW.stock - OLD.stock,
          CASE WHEN NEW.stock > OLD.stock THEN 'restock' ELSE 'adjustment' END,
          'manual', NEW.stock, NEW.cost_price, 'Dashboard stock edit', 'admin');
END;


-- ============================================================
--  VIEWS — analytics read models
-- ============================================================

CREATE VIEW IF NOT EXISTS v_daily_sales AS
SELECT date(created_at, 'unixepoch')        AS day,
       COUNT(*)                             AS orders,
       COALESCE(SUM(total), 0)              AS revenue,
       COALESCE(SUM(cost_total), 0)         AS cost,
       COALESCE(SUM(profit), 0)             AS profit,
       COALESCE(SUM(subtotal - discount), 0) AS net_sales
  FROM orders
 WHERE counts_as_sale = 1
 GROUP BY day;

CREATE VIEW IF NOT EXISTS v_product_performance AS
SELECT p.id, p.sku, p.name, p.image_url, p.stock, p.stock_state, p.price, p.cost_price,
       c.name                                          AS category,
       COALESCE(SUM(oi.qty), 0)                        AS units_sold,
       COALESCE(SUM(oi.qty * oi.unit_price), 0)        AS revenue,
       COALESCE(SUM(oi.qty * (oi.unit_price - oi.unit_cost)), 0) AS profit
  FROM products p
  LEFT JOIN categories c  ON c.id = p.category_id
  LEFT JOIN order_items oi ON oi.product_id = p.id
  LEFT JOIN orders o       ON o.id = oi.order_id AND o.counts_as_sale = 1
 GROUP BY p.id;

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('currency',              'BDT'),
  ('currency_symbol',       '৳'),
  ('shipping_flat',         '8000'),
  ('free_shipping_over',    '500000'),
  ('tax_pct',               '0'),
  ('store_name',            'Arif Gadgets'),
  ('store_tagline',         'Premium Tech Marketplace'),
  ('support_phone',         '+880 1700-000000'),
  ('support_email',         'support@arifgadget.store');
