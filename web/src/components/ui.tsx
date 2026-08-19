import { useEffect, useRef, type ReactNode } from 'react';
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

/**
 * A confirmation the shopkeeper cannot miss.
 *
 * Replaces `window.confirm` for anything destructive. The native dialog is
 * unstyled, easy to dismiss by reflex, and on some mobile browsers can be
 * suppressed entirely — which is a poor way to guard removing a product.
 *
 * The cancel button holds focus rather than the destructive one, so a stray
 * Enter or a double-tap lands on the safe choice.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Yes, remove it',
  cancelLabel = 'No, keep it',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="offer-backdrop"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" style={{ maxWidth: 440, width: '100%' }}>
        <div className="panel-body stack gap-16" style={{ padding: 26 }}>
          <div>
            <h3 id="confirm-title" style={{ marginBottom: 6 }}>
              {title}
            </h3>
            <div className="small muted">{message}</div>
          </div>
          <div className="row gap-8 wrap-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" ref={cancelRef} onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
            <button className={`btn ${tone}`} onClick={onConfirm} disabled={busy}>
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
