import type { ReactNode } from 'react';
import { percent } from '../lib/format';

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Empty({ icon = '🔍', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="ic" aria-hidden="true">
        {icon}
      </div>
      <p style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{title}</p>
      {hint && <p className="small">{hint}</p>}
    </div>
  );
}

export function StockBadge({ state, stock }: { state: string; stock: number }) {
  if (state === 'out') {
    return (
      <span className="badge out">
        <span className="dot" /> Out of stock
      </span>
    );
  }
  if (state === 'low') {
    return (
      <span className="badge low">
        <span className="dot" /> Only {stock} left
      </span>
    );
  }
  return (
    <span className="badge ok">
      <span className="dot" /> {stock} in stock
    </span>
  );
}

/**
 * Period-over-period delta. `null` means there was no baseline to compare
 * against, which is different from "no change" and is labelled as such.
 */
export function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="delta flat">no prior data</span>;
  if (Math.abs(value) < 0.05) return <span className="delta flat">no change</span>;

  const rising = value > 0;
  const good = invert ? !rising : rising;
  return (
    <span className={`delta ${good ? 'up' : 'down'}`}>
      <span aria-hidden="true">{rising ? '▲' : '▼'}</span>
      {percent(Math.abs(value))}
    </span>
  );
}

export function Stat({
  label,
  value,
  foot,
  delta,
  invertDelta,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  delta?: number | null;
  invertDelta?: boolean;
}) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <span className="foot">
        {delta !== undefined && <Delta value={delta} invert={invertDelta} />}
        {foot}
      </span>
    </div>
  );
}

export function Rating({ value, count }: { value: number; count: number }) {
  const full = Math.round(value);
  return (
    <span className="row gap-4 tiny dim" title={`${value.toFixed(1)} out of 5`}>
      <span style={{ color: 'var(--gold)', letterSpacing: '1px' }} aria-hidden="true">
        {'★'.repeat(full)}
        {'☆'.repeat(5 - full)}
      </span>
      <span>
        {value.toFixed(1)} ({count})
      </span>
    </span>
  );
}
