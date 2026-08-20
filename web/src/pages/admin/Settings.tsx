import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, mediaUrl, uploadImage } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import { useAuth, useToast } from '../../lib/store';
import { Empty, Spinner, ConfirmDialog } from '../../components/ui';
import { CourierBanner } from '../../components/CourierBanner';
import type { CourierAccount, CourierConnection, CourierPayment } from '../../lib/types';

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
const MONEY_KEYS = new Set(['shipping_dhaka', 'shipping_outside', 'free_shipping_over']);

const LABELS: Record<string, { label: string; hint: string }> = {
  store_name: { label: 'Store name', hint: 'Shown in the API and page titles' },
  store_tagline: { label: 'Tagline', hint: 'Short line under the logo' },
  store_address: { label: 'Shop address', hint: 'Shown in the footer so customers can visit' },
  owner_name: { label: 'Owner name', hint: 'Shown in the footer and on the About Us page' },
  facebook_url: { label: 'Facebook page', hint: 'Full URL — shows the Facebook icon in the footer' },
  support_phone: { label: 'Main phone', hint: 'Displayed in the header bar and footer' },
  support_phone_2: { label: 'Second phone', hint: 'Optional extra number in the footer' },
  whatsapp_number: { label: 'WhatsApp number', hint: 'The floating chat button opens a chat with this number' },
  support_email: { label: 'Support email', hint: 'Displayed in the footer' },
  bkash_number: { label: 'bKash number', hint: 'Shown to the customer when they choose bKash' },
  nagad_number: { label: 'Nagad number', hint: 'Shown to the customer when they choose Nagad' },
  rocket_number: { label: 'Rocket number', hint: 'Shown to the customer when they choose Rocket' },
  bank_details: { label: 'Bank transfer details', hint: 'Shown when the customer chooses bank transfer' },
  order_whatsapp: { label: 'Order WhatsApp number', hint: 'Where the "Send order on WhatsApp" button sends orders, e.g. 8801400290828' },
  currency: { label: 'Currency code', hint: 'e.g. BDT' },
  currency_symbol: { label: 'Currency symbol', hint: 'e.g. ৳' },
  shipping_dhaka: { label: 'Delivery inside Dhaka (৳)', hint: 'Charged when the shopper picks "Inside Dhaka"' },
  shipping_outside: { label: 'Delivery outside Dhaka (৳)', hint: 'Charged everywhere else in Bangladesh' },
  free_shipping_over: { label: 'Free delivery over (৳)', hint: 'Order value that unlocks free delivery' },
  tax_pct: { label: 'Tax percentage', hint: 'Applied to the net order value. 0 disables it.' },
  site_url: {
    label: 'Live storefront URL',
    hint: 'e.g. https://arifgadget.store — used by the daily site health check to confirm the live site is actually up',
  },
};

/**
 * The big image at the very top of the shop. Used to be a bundled SVG file
 * that only a developer could change; this lets staff replace it any time —
 * uploaded through the same media pipeline as product photos, and live the
 * moment it saves, no redeploy.
 */
function HeroBannerPanel({
  url,
  onSaved,
  canEdit,
}: {
  url: string;
  onSaved: (url: string) => void;
  canEdit: boolean;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function save(next: string) {
    try {
      await api('/api/admin/settings', { method: 'PATCH', auth: true, body: { hero_banner_url: next } });
      onSaved(next);
      toast(next ? 'Homepage banner updated' : 'Homepage banner reset to the default', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save the banner', 'error');
    }
  }

  async function onFile(file: File) {
    setUploading(true);
    try {
      const uploaded = await uploadImage(file);
      await save(uploaded.url);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Homepage banner</h3>
          <p className="tiny dim">
            The big image at the top of the shop. Replace it any time — it goes live immediately, no redeploy.
          </p>
        </div>
      </div>
      <div className="panel-body stack gap-16">
        <div className="hero-banner" style={{ maxWidth: 480 }}>
          <img
            src={url ? mediaUrl(url) : `${import.meta.env.BASE_URL}brand/banner.svg`}
            alt="Current homepage banner"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
        {canEdit && (
          <div className="row gap-8 wrap-row">
            <button className="btn ghost sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? 'Uploading…' : url ? 'Replace banner' : 'Upload banner'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void onFile(file);
              }}
            />
            {url && (
              <button className="btn ghost sm" disabled={uploading} onClick={() => save('')}>
                Reset to default
              </button>
            )}
          </div>
        )}
        <p className="tiny dim">Best results: a wide banner, around 1600 × 560 pixels, under 5 MB.</p>
      </div>
    </div>
  );
}

/**
 * The shop runs more than one Steadfast account. This panel lets staff add,
 * switch and remove them without touching a GitHub secret or waiting on a
 * redeploy — a key typed in here works on the very next courier call. Keys
 * are encrypted before they reach the database and this panel never gets one
 * back after saving, matching the same never-show-a-character rule the
 * courier banner already followed for the single deploy-secret account.
 */
function CourierAccountsPanel({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [status, setStatus] = useState<CourierConnection | null>(null);
  const [accounts, setAccounts] = useState<CourierAccount[]>([]);
  const [payments, setPayments] = useState<CourierPayment[]>([]);
  const [paymentsError, setPaymentsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | 'new' | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CourierAccount | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ label: '', api_key: '', secret_key: '', base_url: '' });

  async function load() {
    setLoading(true);
    try {
      const [statusRes, accountsRes, paymentsRes] = await Promise.all([
        api<CourierConnection>('/api/admin/courier', { auth: true }),
        api<{ accounts: CourierAccount[] }>('/api/admin/courier/accounts', { auth: true }),
        api<{ ok: boolean; error: string; payments: CourierPayment[] }>('/api/admin/courier/payments', { auth: true }),
      ]);
      setStatus(statusRes);
      setAccounts(accountsRes.accounts);
      setPaymentsError(paymentsRes.ok ? '' : paymentsRes.error);
      setPayments(paymentsRes.payments);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load courier accounts', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addAccount(event: FormEvent) {
    event.preventDefault();
    if (!form.label.trim() || !form.api_key.trim() || !form.secret_key.trim()) {
      toast('Fill in a label, API key and secret key', 'error');
      return;
    }
    setBusyId('new');
    try {
      await api('/api/admin/courier/accounts', {
        method: 'POST',
        auth: true,
        body: {
          label: form.label.trim(),
          api_key: form.api_key.trim(),
          secret_key: form.secret_key.trim(),
          base_url: form.base_url.trim(),
        },
      });
      toast(`"${form.label.trim()}" added`, 'success');
      setForm({ label: '', api_key: '', secret_key: '', base_url: '' });
      setShowAdd(false);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not add the account', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function activate(account: CourierAccount) {
    setBusyId(account.id);
    try {
      await api(`/api/admin/courier/accounts/${account.id}/activate`, { method: 'POST', auth: true });
      toast(`"${account.label}" is now the active account`, 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not switch accounts', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!removeTarget) return;
    setBusyId(removeTarget.id);
    try {
      await api(`/api/admin/courier/accounts/${removeTarget.id}`, { method: 'DELETE', auth: true });
      toast(`"${removeTarget.label}" removed`, 'success');
      setRemoveTarget(null);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not remove the account', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Courier accounts</h3>
          <p className="tiny dim">
            Steadfast can hold more than one account here — whichever is marked active books every new parcel.
          </p>
        </div>
        {canEdit && (
          <button className="btn ghost sm" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Cancel' : '+ Add account'}
          </button>
        )}
      </div>
      <div className="panel-body stack gap-16">
        {loading ? (
          <Spinner />
        ) : (
          <>
            <CourierBanner
              state={status}
              action={
                <button className="btn ghost sm" onClick={load}>
                  Refresh
                </button>
              }
            />

            {showAdd && canEdit && (
              <form
                className="stack gap-12"
                onSubmit={addAccount}
                style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 16 }}
              >
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="ca-label">Label</label>
                    <input
                      id="ca-label"
                      className="input"
                      placeholder="e.g. Main account, Second account"
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ca-api">API key</label>
                    <input
                      id="ca-api"
                      className="input"
                      type="password"
                      autoComplete="off"
                      value={form.api_key}
                      onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ca-secret">Secret key</label>
                    <input
                      id="ca-secret"
                      className="input"
                      type="password"
                      autoComplete="off"
                      value={form.secret_key}
                      onChange={(e) => setForm((f) => ({ ...f, secret_key: e.target.value }))}
                    />
                    <span className="hint">
                      From the Steadfast merchant portal → API Support. Stored encrypted — nobody, including this
                      dashboard, can read it back afterwards.
                    </span>
                  </div>
                </div>
                <button className="btn primary" type="submit" disabled={busyId === 'new'}>
                  {busyId === 'new' ? 'Adding…' : 'Add account'}
                </button>
              </form>
            )}

            {accounts.length === 0 ? (
              <Empty
                icon="🚚"
                title="No accounts added yet"
                hint={
                  canEdit
                    ? 'Add one above, or the shop keeps using whatever was set as a Worker secret at deploy time.'
                    : undefined
                }
              />
            ) : (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Keys</th>
                      <th></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.label}</strong>
                          {a.active && (
                            <span className="badge ok" style={{ marginLeft: 8 }}>
                              Active
                            </span>
                          )}
                        </td>
                        <td className="tiny dim mono">
                          API {a.api_key_present ? `${a.api_key_length} chars` : 'missing'} · Secret{' '}
                          {a.secret_key_present ? `${a.secret_key_length} chars` : 'missing'}
                        </td>
                        <td>
                          {!a.active && canEdit && (
                            <button className="btn ghost sm" disabled={busyId !== null} onClick={() => activate(a)}>
                              {busyId === a.id ? 'Switching…' : 'Make active'}
                            </button>
                          )}
                        </td>
                        <td>
                          {canEdit && (
                            <button
                              className="btn danger sm"
                              disabled={busyId !== null}
                              onClick={() => setRemoveTarget(a)}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <h4 style={{ marginBottom: 8 }}>Courier payments</h4>
              <p className="tiny dim" style={{ marginBottom: 10 }}>
                Real money Steadfast has remitted to the shop for delivered COD parcels — separate from the running
                balance above.
              </p>
              {paymentsError ? (
                <div className="alert warn small">{paymentsError}</div>
              ) : payments.length === 0 ? (
                <Empty icon="💰" title="No payments recorded by Steadfast yet" />
              ) : (
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, i) => (
                        <tr key={p.reference || i}>
                          <td className="mono small">{p.reference || '—'}</td>
                          {/* Steadfast reports this in taka directly — unlike every amount stored in this
                              shop's own database, it never passed through the poisha conversion, so it is
                              formatted here rather than with the money() helper. */}
                          <td>৳{p.amount.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td>
                            <span className="badge info">{p.status || '—'}</span>
                          </td>
                          <td className="tiny dim">{p.paidAt || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Remove "${removeTarget?.label}"?`}
        message="This deletes the stored keys for this account. Orders already booked through it keep their own record — nothing about past deliveries changes."
        busy={busyId === removeTarget?.id}
        onConfirm={remove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

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

    // Only the keys this form actually renders — the settings table also holds
    // fixed values the API refuses, and sending them back would fail the save.
    const payload: Record<string, string> = {};
    for (const key of Object.keys(LABELS)) {
      const value = values[key] ?? '';
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

      <div style={{ marginBottom: 24 }}>
        <HeroBannerPanel
          url={values.hero_banner_url ?? ''}
          canEdit={canEdit}
          onSaved={(next) => setValues((prev) => ({ ...prev, hero_banner_url: next }))}
        />
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
                {Number(values.free_shipping_over) > 0 && Number(values.free_shipping_over) <= 1000
                  ? 'free delivery'
                  : `${money(Math.round((Number(values.shipping_dhaka) || 0) * 100))} inside Dhaka, ` +
                    `${money(Math.round((Number(values.shipping_outside) || 0) * 100))} elsewhere`}
              </strong>
              .{' '}
              {Number(values.free_shipping_over) > 0
                ? `Free delivery unlocks at ${money(Math.round(Number(values.free_shipping_over) * 100))}.`
                : 'Free delivery is switched off, so every order pays the charge.'}
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

      <div style={{ marginTop: 24 }}>
        <CourierAccountsPanel canEdit={canEdit} />
      </div>
    </>
  );
}
