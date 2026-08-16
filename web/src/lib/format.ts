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
  packed: 'brand',
  shipped: 'info',
  delivered: 'ok',
  cancelled: 'out',
  refunded: 'out',
};
