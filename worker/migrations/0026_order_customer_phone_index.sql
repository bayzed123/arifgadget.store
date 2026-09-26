-- Powers the per-customer order-history lookup on the admin order list/detail
-- (total orders, delivered, cancelled/returned by phone) — a correlated
-- subquery run against every row on every page load, so it needs an index to
-- stay cheap as the orders table grows.
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
