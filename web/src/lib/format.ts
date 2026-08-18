/** Every money value from the API is an integer in poisha (৳1 = 100). */

let symbol = '৳';

export function setCurrencySymbol(next: string): void {
  if (next) symbol = next;
}

export function money(poisha: number, { decimals = false } = {}): string {
  const taka = poisha / 100;
  return `${symbol}${taka.toLocaleString('en-US', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

/** Compact form for chart axes and dense tiles: ৳12.4k, ৳1.2M. */
export function moneyShort(poisha: number): string {
  const taka = poisha / 100;
  const abs = Math.abs(taka);
  if (abs >= 10_000_000) return `${symbol}${(taka / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `${symbol}${(taka / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${symbol}${(taka / 1_000).toFixed(taka >= 10_000 ? 0 : 1)}k`;
  return `${symbol}${Math.round(taka)}`;
}

export function number(value: number): string {
  return value.toLocaleString('en-US');
}

export function percent(value: number | null, { sign = false } = {}): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const prefix = sign && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(Math.abs(value) < 10 ? 1 : 0)}%`;
}

export function date(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function dateTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(unix: number): string {
  const seconds = Math.floor(Date.now() / 1000) - unix;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date(unix);
}

/** Short axis label for a YYYY-MM-DD day key. */
export function dayLabel(day: string): string {
  const [, m, d] = day.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1] ?? ''}`;
}

export const ORDER_STATUS_TONE: Record<string, 'ok' | 'low' | 'out' | 'info' | 'brand'> = {
  pending: 'low',
  confirmed: 'brand',
  shipped: 'info',
  delivered: 'ok',
  refunded: 'out',
  cancelled: 'out',
  // Retired checkpoint, kept so any historical row still renders a sane badge.
  packed: 'brand',
};

/**
 * The five delivery checkpoints in order. `shipped` is stored short but always
 * reads as "On the way" — courier language the shop and the buyer share.
 */
export const DELIVERY_STAGES = ['pending', 'confirmed', 'shipped', 'delivered'] as const;

/** Checkpoints that end an order and send its stock back to the shelf. */
export const REVERSED_STATUSES = ['refunded', 'cancelled'];

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Order confirmed',
  shipped: 'On the way',
  delivered: 'Delivered',
  // Stored as 'refunded' since the first migration; a return is what it means.
  refunded: 'Returned',
  cancelled: 'Cancelled',
  packed: 'Packed',
};

/** Human label for a stored status. Falls back to the raw value. */
export function orderStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Steadfast's delivery vocabulary in plain words. Wider than the shop's own
 * checkpoints on purpose: "awaiting approval" and "on hold" are exactly the
 * states staff need to see, and they justify no checkpoint change at all.
 */
const COURIER_LABELS: Record<string, string> = {
  pending: 'With courier',
  in_review: 'In review',
  hold: 'On hold',
  delivered_approval: 'Delivered — awaiting approval',
  partial_delivered_approval: 'Partly delivered — awaiting approval',
  cancelled_approval: 'Returned — awaiting approval',
  unknown_approval: 'Unknown — awaiting approval',
  delivered: 'Delivered',
  partial_delivered: 'Partly delivered',
  cancelled: 'Returned to shop',
  unknown: 'Unknown',
};

export function courierStatus(status: string): string {
  return COURIER_LABELS[status] ?? status;
}

export const COURIER_TONE: Record<string, 'ok' | 'low' | 'out' | 'info' | 'brand'> = {
  pending: 'info',
  in_review: 'info',
  hold: 'low',
  delivered_approval: 'brand',
  partial_delivered_approval: 'low',
  cancelled_approval: 'low',
  unknown_approval: 'low',
  delivered: 'ok',
  partial_delivered: 'low',
  cancelled: 'out',
  unknown: 'low',
};
