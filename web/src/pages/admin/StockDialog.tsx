import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { money, number, relativeTime } from '../../lib/format';
import { useToast } from '../../lib/store';
import type { AdminProduct, StockMovement } from '../../lib/types';

const REASONS = [
  { key: 'restock', label: 'Restock — new delivery arrived' },
  { key: 'return', label: 'Return — customer sent it back' },
  { key: 'damage', label: 'Damage — write off broken units' },
  { key: 'adjustment', label: 'Adjustment — correcting a count' },
];

/**
 * Stock is never edited as a plain field. Every change goes through this
 * dialog so the ledger records how many, why, and who.
 */
export function StockDialog({
  product,
  onClose,
  onSaved,
}: {
  product: AdminProduct;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'delta' | 'set'>('delta');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('restock');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<StockMovement[]>([]);

  useEffect(() => {
    api<{ movements: StockMovement[] }>(`/api/admin/products/${product.id}/movements`, { auth: true })
      .then((res) => setHistory(res.movements))
      .catch(() => setHistory([]));
  }, [product.id]);

  const parsed = Number(amount) || 0;
  const signed = reason === 'damage' && mode === 'delta' ? -Math.abs(parsed) : parsed;
  const resulting = mode === 'set' ? parsed : product.stock + signed;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!amount) {
      setError('Enter a quantity');
      return;
    }
    if (resulting < 0) {
      setError(`That would leave ${resulting} units — only ${product.stock} are in stock`);
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/products/${product.id}/stock`, {
        method: 'POST',
        auth: true,
        body: mode === 'set' ? { set: parsed, reason, note } : { delta: signed, reason, note },
      });
      toast(`${product.name}: ${product.stock} → ${resulting}`, 'success');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update stock');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="modal" style={{ maxWidth: 660 }} role="dialog" aria-modal="true" aria-label="Adjust stock">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Adjust stock</span>
            <h2 style={{ fontSize: '1.1rem' }}>{product.name}</h2>
            <span className="tiny dim mono">{product.sku}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="modal-body stack gap-16" onSubmit={submit}>
          <div className="row gap-16 wrap-row">
            <div>
              <span className="eyebrow">Currently</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800 }} className="num">
                {number(product.stock)}
              </div>
            </div>
            <div style={{ fontSize: '1.4rem', color: 'var(--ink-3)' }} aria-hidden="true">
              →
            </div>
            <div>
              <span className="eyebrow">After this change</span>
              <div
                style={{ fontSize: '1.6rem', fontWeight: 800, color: resulting < 0 ? 'var(--bad)' : 'var(--good)' }}
                className="num"
              >
                {number(resulting)}
              </div>
            </div>
            <div className="grow" />
            <div className="right">
              <span className="eyebrow">Value at cost</span>
              <div style={{ fontWeight: 700 }} className="num">
                {money(Math.max(resulting, 0) * product.cost_price)}
              </div>
            </div>
          </div>

          <div className="pill-tabs" style={{ alignSelf: 'flex-start' }}>
            <button type="button" className={mode === 'delta' ? 'active' : ''} onClick={() => setMode('delta')}>
              Add / remove
            </button>
            <button type="button" className={mode === 'set' ? 'active' : ''} onClick={() => setMode('set')}>
              Set exact count
            </button>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="samt">{mode === 'set' ? 'New total' : 'Quantity'}</label>
              <input
                id="samt"
                className="input"
                type="number"
                min={mode === 'set' ? 0 : undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={mode === 'set' ? 'e.g. 120' : 'e.g. 50 (or -5 to remove)'}
                autoFocus
              />
              {mode === 'delta' && reason === 'damage' && <span className="hint">Damage always removes units.</span>}
            </div>

            <div className="field">
              <label htmlFor="sreason">Reason</label>
              <select id="sreason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="snote">Note (optional)</label>
            <input
              id="snote"
              className="input"
              maxLength={300}
              placeholder="Supplier invoice number, shelf location…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <div className="alert error">{error}</div>}

          <div className="modal-foot" style={{ marginTop: 0 }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Apply change'}
            </button>
          </div>

          {history.length > 0 && (
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
                Ledger history
              </span>
              <div className="table-scroll" style={{ maxHeight: 220, overflowY: 'auto' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th className="num">Balance</th>
                      <th>Reason</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((movement) => (
                      <tr key={movement.id}>
                        <td>
                          <strong style={{ color: movement.delta > 0 ? 'var(--good)' : 'var(--bad)' }}>
                            {movement.delta > 0 ? '+' : ''}
                            {movement.delta}
                          </strong>
                        </td>
                        <td className="num">{movement.balance_after}</td>
                        <td className="small">
                          {movement.reason}
                          {movement.note && <div className="tiny dim truncate">{movement.note}</div>}
                        </td>
                        <td className="tiny dim">
                          {relativeTime(movement.created_at)}
                          <div>{movement.actor}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
