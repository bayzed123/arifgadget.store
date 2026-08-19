-- A proper invoice number, separate from the order number.
--
-- The printed receipt headed its "Invoice" block with the order number, so the
-- shop had one identifier doing two jobs. A customer ringing up about a receipt
-- and a staff member searching the dashboard were quoting the same string for
-- different things, and there was no invoice reference to look up at all.
--
-- Derived from the row id rather than stored, for three reasons:
--
--   * it cannot drift out of sync, be skipped, or collide — the id already
--     guarantees that;
--   * every existing order gets one immediately, with no backfill to run and
--     no risk of two orders being handed the same number mid-migration;
--   * there is no counter table to lock, so concurrent checkouts never queue
--     behind each other for a number.
--
-- VIRTUAL rather than STORED because SQLite only permits virtual generated
-- columns to be added to an existing table — and there is nothing to store:
-- the value is a formatting of a column already on the row.
--
-- Zero-padded to six digits so invoices sort correctly as text and stay
-- readable over the phone: "INV-000042".
ALTER TABLE orders
  ADD COLUMN invoice_no TEXT GENERATED ALWAYS AS ('INV-' || printf('%06d', id)) VIRTUAL;

-- Dashboard search looks orders up by this, so give it an index. A generated
-- column can be indexed even when it is virtual; SQLite recomputes on write.
CREATE INDEX IF NOT EXISTS idx_orders_invoice_no ON orders(invoice_no);
