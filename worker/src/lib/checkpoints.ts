/**
 * The shop's delivery checkpoints, and the rules for moving between them.
 *
 * Extracted from the admin routes because the courier now moves orders too —
 * through the webhook and through the sync button — and two copies of a
 * transition table is exactly how an order eventually restocks twice.
 */

/**
 * Courier-style delivery checkpoints. Two stored values carry a friendlier
 * label on screen, because `orders.status` has a CHECK constraint from the
 * first migration and rebuilding that table on a live shop is not worth a
 * rename (see migration 0009):
 *
 *   shipped  → "On the way"
 *   refunded → "Returned"
 */
export const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'refunded', 'cancelled'];

/** "returned" is the word everyone uses; accept it and store the legacy value. */
export const STATUS_ALIASES: Record<string, string> = { returned: 'refunded', on_the_way: 'shipped' };

/**
 * Which checkpoint may follow which. This is not decoration: `returned` and
 * `cancelled` put every unit back on the shelf, so a route back into the
 * pipeline would leave stock credited twice and the ledger telling a lie.
 * Terminal states are therefore terminal.
 */
export const NEXT_STATUSES: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  refunded: [],
  cancelled: [],
};

/** What the shop calls each checkpoint, for messages staff and shoppers read. */
export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Order confirmed',
  shipped: 'On the way',
  delivered: 'Delivered',
  refunded: 'Returned',
  cancelled: 'Cancelled',
};

export const label = (status: string): string => STATUS_LABELS[status] ?? status;

/** True when an order has finished moving and its stock is already settled. */
export const isFinal = (status: string): boolean => (NEXT_STATUSES[status] ?? []).length === 0;
