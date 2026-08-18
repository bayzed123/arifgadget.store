-- Steadfast courier integration.
--
-- The shop delivers through Steadfast, so the courier — not the dashboard — is
-- what actually knows whether a parcel arrived, came back, or is still moving,
-- and whether the cash on delivery was collected. These columns hold the shop's
-- side of that conversation: what was booked, and what the courier last said.
--
-- `courier_status` deliberately stores Steadfast's own wording rather than ours.
-- Their vocabulary is wider than our six checkpoints — 'partial_delivered',
-- 'delivered_approval', 'hold', 'in_review' — and collapsing it on the way in
-- would throw away the detail the shop needs when a delivery goes sideways.
-- The mapping to a checkpoint happens in worker/src/lib/steadfast.ts, where it
-- can be read and corrected, and the raw word stays here next to it.
--
-- No CHECK constraints: this schema has already been bitten once by an
-- un-alterable one, and a courier is free to invent a status next quarter.

ALTER TABLE orders ADD COLUMN courier TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN consignment_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN tracking_code TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN courier_status TEXT NOT NULL DEFAULT '';

-- What was handed to the courier to collect, in poisha like every other amount
-- here. Zero for an order already paid by bKash, Nagad, Rocket or bank, which
-- is exactly how "COD outstanding" is told apart from "already settled".
ALTER TABLE orders ADD COLUMN courier_cod_amount INTEGER NOT NULL DEFAULT 0;

-- When the courier was last asked. Null means never — the order has not been
-- booked, or was booked and not yet refreshed.
ALTER TABLE orders ADD COLUMN courier_synced_at INTEGER;

-- Looking an order up by the courier's identifier is how a support call starts.
CREATE INDEX IF NOT EXISTS idx_orders_consignment ON orders(consignment_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier_status ON orders(courier_status);
