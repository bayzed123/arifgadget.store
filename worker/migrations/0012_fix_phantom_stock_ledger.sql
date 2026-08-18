-- Stop every sale and every return writing a phantom "Dashboard stock edit".
--
-- trg_products_stock_au exists to catch stock changed by hand, and it is meant
-- to stay quiet when something else has already accounted for the change. Its
-- guard looks for a ledger row that already carries the new balance:
--
--   AND NOT EXISTS (SELECT 1 FROM stock_movements
--                    WHERE product_id = NEW.id AND balance_after = NEW.stock
--                      AND created_at >= strftime('%s','now') - 2)
--
-- The admin stock endpoint satisfies that guard correctly: it inserts the
-- ledger row first, then updates the stock. The two order triggers did it the
-- other way round — update first, write the ledger afterwards — so at the
-- moment the UPDATE fired there was nothing for the guard to find, and it
-- logged a manual adjustment on top of the real row.
--
-- The effect was two ledger entries for every order line: a truthful 'sale'
-- and a phantom 'adjustment' attributed to an admin who never touched
-- anything. Stock levels were always right — trg_products_stock_au only ever
-- writes a ledger row, it never moves stock — but the stock history in the
-- dashboard read as if staff were hand-editing inventory on every order, and
-- the forty-row movement feed showed twenty real events instead of forty.
--
-- Both triggers are rewritten to write the ledger first, deriving the balance
-- arithmetically instead of re-reading it after the update. That satisfies the
-- guard exactly as the admin endpoint does, and no other behaviour changes.

DROP TRIGGER IF EXISTS trg_order_items_ai;

CREATE TRIGGER trg_order_items_ai
AFTER INSERT ON order_items
FOR EACH ROW
BEGIN
  -- 1. ledger first, carrying the balance this line will leave behind, so the
  --    manual-edit trigger recognises the change as already accounted for
  INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id, balance_after, unit_cost, note)
  SELECT NEW.product_id, -NEW.qty, 'sale', 'order', NEW.order_id, p.stock - NEW.qty, NEW.unit_cost,
         'Order line #' || NEW.id
    FROM products p WHERE p.id = NEW.product_id;

  -- 2. draw down inventory and bump the popularity counter
  UPDATE products
     SET stock      = stock - NEW.qty,
         units_sold = units_sold + NEW.qty,
         updated_at = strftime('%s','now')
   WHERE id = NEW.product_id;

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

DROP TRIGGER IF EXISTS trg_orders_restock;

CREATE TRIGGER trg_orders_restock
AFTER UPDATE OF status ON orders
FOR EACH ROW
WHEN NEW.status IN ('cancelled','refunded') AND OLD.status NOT IN ('cancelled','refunded')
BEGIN
  -- One row per product rather than per order line, carrying the balance the
  -- restock will leave behind. An order holding two lines of the same product
  -- returns its units once, at the right closing balance, which is also what
  -- lets the guard below match.
  INSERT INTO stock_movements (product_id, delta, reason, ref_type, ref_id, balance_after, unit_cost, note)
  SELECT oi.product_id,
         SUM(oi.qty),
         CASE WHEN NEW.status = 'refunded' THEN 'return' ELSE 'adjustment' END,
         'order', NEW.id,
         p.stock + SUM(oi.qty),
         MAX(oi.unit_cost),
         'Auto-restock: order ' || NEW.order_no || ' → ' || NEW.status
    FROM order_items oi JOIN products p ON p.id = oi.product_id
   WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL
   GROUP BY oi.product_id;

  UPDATE products
     SET stock      = stock + (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = NEW.id AND product_id = products.id),
         units_sold = units_sold - (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = NEW.id AND product_id = products.id),
         updated_at = strftime('%s','now')
   WHERE id IN (SELECT product_id FROM order_items WHERE order_id = NEW.id AND product_id IS NOT NULL);
END;

-- Clear the phantom rows already written. Matched narrowly: a manual-looking
-- row that sits on the same product and the same closing balance as a real
-- order movement written in the same second is the trigger's own echo, and
-- nothing a person did produces that pattern.
DELETE FROM stock_movements
 WHERE ref_type = 'manual'
   AND note = 'Dashboard stock edit'
   AND EXISTS (
     SELECT 1 FROM stock_movements real
      WHERE real.ref_type = 'order'
        AND real.product_id = stock_movements.product_id
        AND real.balance_after = stock_movements.balance_after
        AND real.created_at BETWEEN stock_movements.created_at - 2 AND stock_movements.created_at + 2
   );
