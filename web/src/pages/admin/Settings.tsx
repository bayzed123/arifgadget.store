import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import { useAuth, useToast } from '../../lib/store';
import { Empty, Spinner } from '../../components/ui';

interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  detail: string;
  created_at: number;
}

/** Money settings are stored in poisha but edited in taka. */
const MONEY_KEYS = new Set(['shipping_flat', 'free_shipping_over']);

const LABELS: Record<string, { label: string; hint: string }> = {
  store_name: { label: 'Store name', hint: 'Shown in the API and page titles' },
  store_tagline: { label: 'Tagline', hint: 'Short line under the logo' },
  store_address: { label: 'Shop address', hint: 'Shown in the footer so customers can visit' },
  support_phone: { label: 'Main phone', hint: 'Displayed in the header bar and footer' },
  support_phone_2: { label: 'Second phone', hint: 'Optional extra number in the footer' },
  whatsapp_number: { label: 'WhatsApp number', hint: 'The floating chat button opens a chat with this number' },
  support_email: { label: 'Support email', hint: 'Displayed in the footer' },
  credit_dev_name: { label: 'Footer credit — dev', hint: 'Name shown after "Dev:" in the footer' },
  credit_dev_url: { label: 'Footer credit — dev link', hint: 'Where that name links to' },
  credit_author_name: { label: 'Footer credit — developer', hint: 'Name shown after "Developer:"' },
  credit_author_url: { label: 'Footer credit — developer link', hint: 'Where that name links to' },
  currency: { label: 'Currency code', hint: 'e.g. BDT' },
  currency_symbol: { label: 'Currency symbol', hint: 'e.g. ৳' },
  shipping_flat: { label: 'Flat delivery charge (৳)', hint: 'Applied below the free-delivery threshold' },
  free_shipping_over: { label: 'Free delivery over (৳)', hint: 'Order value that unlocks free delivery' },
  tax_pct: { label: 'Tax percentage', hint: 'Applied to the net order value. 0 disables it.' },
};

export function Settings() {
  const { admin } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<{ settings: { key: string; value: string }[] }>('/api/admin/settings', { auth: true }),
      api<{ entries: AuditEntry[] }>('/api/admin/audit?limit=40', { auth: true }),
    ])
      .then(([settings, log]) => {
        const map: Record<string, string> = {};
        for (const row of settings.settings) {
          map[row.key] = MONEY_KEYS.has(row.key) ? String(Number(row.value) / 100) : row.value;
        }
        setValues(map);
        setAudit(log.entries);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      payload[key] = MONEY_KEYS.has(key) ? String(Math.round((Number(value) || 0) * 100)) : value;
    }

    try {
      await api('/api/admin/settings', { method: 'PATCH', auth: true, body: payload });
      toast('Settings saved', 'success');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save settings';
      setError(message);
      toast(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  const canEdit = admin?.role === 'owner' || admin?.role === 'admin';

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Configuration</span>
          <h1>Store settings</h1>
          <p className="small muted">
            Shipping and tax feed straight into the checkout calculation — changes apply to the next quote.
          </p>
        </div>
      </div>

      <div className="chart-grid split">
        <form className="panel" onSubmit={save}>
          <div className="panel-head">
            <h3>Storefront &amp; pricing</h3>
          </div>
          <div className="panel-body stack gap-16">
            <div className="form-grid">
              {Object.keys(LABELS).map((key) => (
                <div className="field" key={key}>
                  <label htmlFor={`set-${key}`}>{LABELS[key].label}</label>
                  <input
                    id={`set-${key}`}
                    className="input"
                    type={MONEY_KEYS.has(key) || key === 'tax_pct' ? 'number' : 'text'}
                    step={MONEY_KEYS.has(key) ? '0.01' : key === 'tax_pct' ? '0.1' : undefined}
                    min={MONEY_KEYS.has(key) || key === 'tax_pct' ? '0' : undefined}
                    disabled={!canEdit}
                    value={values[key] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                  <span className="hint">{LABELS[key].hint}</span>
                </div>
              ))}
            </div>

            <div className="alert warn small">
              A ৳1,000 order currently pays{' '}
              <strong>
                {Number(values.free_shipping_over ?? 0) * 100 <= 100000
                  ? 'free delivery'
                  : money(Math.round((Number(values.shipping_flat) || 0) * 100))}
              </strong>
              . Free delivery unlocks at {money(Math.round((Number(values.free_shipping_over) || 0) * 100))}.
            </div>

            {error && <div className="alert error">{error}</div>}

            {canEdit ? (
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save settings'}
              </button>
            ) : (
              <p className="small dim">Your role can view settings but not change them.</p>
            )}
          </div>
        </form>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Activity log</h3>
              <p className="tiny dim">Who changed what, most recent first.</p>
            </div>
          </div>
          <div className="table-scroll" style={{ maxHeight: 560, overflowY: 'auto' }}>
            {audit.length === 0 ? (
              <Empty icon="📋" title="Nothing logged yet" />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>By</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <span className="badge info">{entry.action}</span>
                        {entry.detail && <div className="tiny dim truncate" style={{ maxWidth: 240 }}>{entry.detail}</div>}
                      </td>
                      <td className="small truncate" style={{ maxWidth: 140 }}>
                        {entry.actor}
                      </td>
                      <td className="tiny dim">{dateTime(entry.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
