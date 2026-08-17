import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { getDirectBuy, setDirectBuy, useCart, useCustomer, useToast } from '../lib/store';
import { money, number } from '../lib/format';
import type { DeliveryZone, StoreSettings } from '../lib/types';
import { Empty, Spinner } from '../components/ui';
import { OrderSummary, useQuote } from './Cart';

/** Delivery zones, priced from store settings so the shop can change the rates. */
const ZONES: { key: DeliveryZone; label: string; hint: string }[] = [
  { key: 'dhaka', label: 'Inside Dhaka', hint: 'Dhaka city and metro area' },
  { key: 'outside', label: 'Outside Dhaka', hint: 'Anywhere else in Bangladesh' },
];

const PAYMENTS = [
  { key: 'cod', label: 'Cash on delivery', hint: 'Pay the courier' },
  { key: 'bkash', label: 'bKash', hint: 'Send money, share the TrxID' },
  { key: 'nagad', label: 'Nagad', hint: 'Send money, share the TrxID' },
  { key: 'rocket', label: 'Rocket', hint: 'Dutch-Bangla mobile banking' },
  { key: 'bank', label: 'Bank transfer', hint: 'For wholesale accounts' },
];

interface Placed {
  order_no: string;
  total: number;
  status: string;
}

export function Checkout() {
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const { customer } = useCustomer();

  // "Shop now" checks out one product on its own; the cart stays where it was.
  const [direct] = useState(getDirectBuy);
  const lineItems = useMemo(
    () => (direct ? [{ product_id: direct.product_id, qty: direct.qty }] : cart.items),
    [direct, cart.items],
  );
  const [zone, setZone] = useState<DeliveryZone>('outside');

  // The zone rates are shop settings, so the picker shows what each one costs.
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  useEffect(() => {
    api<StoreSettings>('/api/settings')
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);
  const { quote, loading } = useQuote(lineItems, zone);

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    address: '',
    city: '',
    note: '',
    payment_method: 'cod',
  });
  const [submitting, setSubmitting] = useState(false);

  // Signed-in shoppers should not retype what we already know.
  useEffect(() => {
    if (!customer) return;
    setForm((prev) => ({
      ...prev,
      customer_name: prev.customer_name || customer.name,
      customer_phone: prev.customer_phone || customer.phone,
      customer_email: prev.customer_email || customer.email || '',
      address: prev.address || customer.address || '',
      city: prev.city || customer.city || '',
    }));
  }, [customer]);

  const [error, setError] = useState('');
  const [placed, setPlaced] = useState<Placed | null>(null);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await api<{ order: Placed }>('/api/orders', {
        method: 'POST',
        customerAuth: true,
        body: {
          ...form,
          delivery_zone: zone,
          items: lineItems.map((i) => ({ product_id: i.product_id, qty: i.qty })),
        },
      });
      setPlaced(res.order);
      if (direct) setDirectBuy(null);
      else cart.clear();
      toast('Order placed — we will call to confirm', 'success');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not place the order';
      setError(message);
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (placed) {
    return (
      <div className="panel" style={{ maxWidth: 560, margin: '20px auto', textAlign: 'center' }}>
        <div className="panel-body" style={{ padding: 36 }}>
          <div style={{ fontSize: '3rem' }} aria-hidden="true">
            ✅
          </div>
          <h1 style={{ marginBlock: '10px 6px' }}>Order confirmed</h1>
          <p className="muted">We will call you shortly to confirm delivery.</p>

          <div
            style={{
              margin: '22px 0',
              padding: '16px',
              background: 'var(--surface-inset)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div className="eyebrow">Order number</div>
            <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.02em' }}>
              {placed.order_no}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Total {money(placed.total)} · {placed.status}
            </div>
          </div>

          <p className="small muted">Keep this number — you will need it with your phone number to track the order.</p>

          <div className="row gap-8" style={{ justifyContent: 'center', marginTop: 18 }}>
            <button className="btn primary" onClick={() => navigate(`/track?order=${placed.order_no}`)}>
              Track order
            </button>
            <Link to="/catalog" className="btn ghost">
              Keep shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (lineItems.length === 0) {
    return (
      <>
        <h1>Checkout</h1>
        <Empty icon="🛒" title="Your cart is empty" hint="Add something before checking out." />
        <div className="center">
          <Link to="/catalog" className="btn primary">
            Browse products
          </Link>
        </div>
      </>
    );
  }

  const shortLines = quote?.lines.filter((line) => !line.in_stock) ?? [];

  return (
    <>
      <div className="section-head">
        <div>
          <div className="rule" />
          <h1>Checkout</h1>
          <p className="small muted">
            {direct
              ? 'Buying one product directly'
              : `${number(cart.count)} units · ${cart.items.length} products`}
          </p>
        </div>
      </div>

      {direct && (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          You are buying <strong>{direct.name}</strong> on its own.
          {cart.items.length > 0 && (
            <>
              {' '}Your cart with {number(cart.count)} unit{cart.count === 1 ? '' : 's'} is saved —{' '}
              <Link
                to="/cart"
                style={{ textDecoration: 'underline' }}
                onClick={() => setDirectBuy(null)}
              >
                check out the whole cart instead
              </Link>
              .
            </>
          )}
        </div>
      )}

      <form className="cart-layout" onSubmit={submit}>
        <div className="stack gap-16">
          <div className="panel">
            <div className="panel-head">
              <h3>Delivery details</h3>
            </div>
            <div className="panel-body stack gap-16">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="name">Full name *</label>
                  <input
                    id="name"
                    className="input"
                    required
                    maxLength={120}
                    value={form.customer_name}
                    onChange={(e) => set('customer_name', e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="field">
                  <label htmlFor="phone">Mobile number *</label>
                  <input
                    id="phone"
                    className="input"
                    required
                    maxLength={32}
                    placeholder="01XXXXXXXXX"
                    value={form.customer_phone}
                    onChange={(e) => set('customer_phone', e.target.value)}
                    autoComplete="tel"
                  />
                  <span className="hint">Used to confirm delivery and to track the order.</span>
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="email">Email (optional)</label>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    maxLength={160}
                    value={form.customer_email}
                    onChange={(e) => set('customer_email', e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="field">
                  <label htmlFor="city">City / district *</label>
                  <input
                    id="city"
                    className="input"
                    required
                    maxLength={80}
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                    autoComplete="address-level2"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="address">Full delivery address *</label>
                <textarea
                  id="address"
                  className="textarea"
                  required
                  maxLength={400}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  autoComplete="street-address"
                />
              </div>

              <div className="field">
                <label htmlFor="note">Order note (optional)</label>
                <textarea
                  id="note"
                  className="textarea"
                  maxLength={500}
                  style={{ minHeight: 64 }}
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Delivery area</h3>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                {ZONES.map((option) => (
                  <label
                    key={option.key}
                    className="row gap-12"
                    style={{
                      padding: '13px 15px',
                      border: `1.5px solid ${zone === option.key ? 'var(--brand)' : 'var(--line)'}`,
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      background: zone === option.key ? 'var(--brand-soft)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="delivery_zone"
                      value={option.key}
                      checked={zone === option.key}
                      onChange={() => setZone(option.key)}
                    />
                    <span>
                      <strong style={{ display: 'block', fontSize: '0.9rem' }}>{option.label}</strong>
                      <span className="tiny dim">{option.hint}</span>
                    </span>
                    <span className="num" style={{ marginLeft: 'auto', fontWeight: 700 }}>
                      {settings
                        ? money(option.key === 'dhaka' ? settings.shipping_dhaka : settings.shipping_outside)
                        : ''}
                    </span>
                  </label>
                ))}
              </div>
              {quote?.free_shipping_applied && (
                <p className="tiny" style={{ color: 'var(--good)', fontWeight: 700, marginTop: 10 }}>
                  This order is over the free-delivery threshold, so there is no charge either way.
                </p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Payment method</h3>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                {PAYMENTS.map((option) => (
                  <label
                    key={option.key}
                    className="row gap-12"
                    style={{
                      padding: '13px 15px',
                      border: `1.5px solid ${form.payment_method === option.key ? 'var(--brand)' : 'var(--line)'}`,
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      background: form.payment_method === option.key ? 'var(--brand-soft)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={option.key}
                      checked={form.payment_method === option.key}
                      onChange={() => set('payment_method', option.key)}
                    />
                    <span>
                      <strong style={{ display: 'block', fontSize: '0.9rem' }}>{option.label}</strong>
                      <span className="tiny dim">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside>
          <div className="panel" style={{ position: 'sticky', top: 'calc(var(--header-h) + 16px)' }}>
            <div className="panel-head">
              <h3>Your order</h3>
            </div>
            <div className="panel-body">
              {!quote && loading ? (
                <Spinner />
              ) : (
                <>
                  <div className="stack gap-8" style={{ marginBottom: 14 }}>
                    {quote?.lines.map((line) => (
                      <div key={line.product_id} className="between small">
                        <span className="truncate" style={{ maxWidth: '65%' }}>
                          {line.qty} × {line.name}
                        </span>
                        <span className="num" style={{ fontWeight: 700 }}>
                          {money(line.line_total)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <OrderSummary quote={quote} loading={loading} />
                </>
              )}

              {shortLines.length > 0 && (
                <div className="alert error" style={{ marginTop: 14 }}>
                  Not enough stock for {shortLines.map((l) => l.name).join(', ')}. Adjust quantities in your{' '}
                  <Link to="/cart" style={{ textDecoration: 'underline' }}>
                    cart
                  </Link>
                  .
                </div>
              )}

              {error && (
                <div className="alert error" style={{ marginTop: 14 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn primary lg block"
                style={{ marginTop: 18 }}
                disabled={submitting || !quote || shortLines.length > 0}
              >
                {submitting ? 'Placing order…' : `Place order · ${quote ? money(quote.total) : ''}`}
              </button>

              <p className="tiny dim center" style={{ marginTop: 10 }}>
                By placing this order you agree to our seven-day return policy.
              </p>
            </div>
          </div>
        </aside>
      </form>
    </>
  );
}
