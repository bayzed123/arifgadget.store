import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { getDirectBuy, setDirectBuy, useCart, useCustomer, useToast } from '../lib/store';
import { money, number } from '../lib/format';
import type { DeliveryZone, StoreSettings } from '../lib/types';
import {
  trackAddPaymentInfo,
  trackAddShippingInfo,
  trackBeginCheckout,
  trackContact,
  trackPurchase,
} from '../lib/analytics';
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

/** Which methods need the shop's number and a transaction ID back. */
const MOBILE_BANKING = ['bkash', 'nagad', 'rocket'];

interface Placed {
  order_no: string;
  total: number;
  status: string;
}

/**
 * The order as a WhatsApp message. The shop has no inbox to watch, so the
 * fastest reliable notification is the customer forwarding the order to the
 * shop's number the moment it is placed.
 */
function whatsappMessage(args: {
  order: Placed;
  form: Record<string, string>;
  lines: { qty: number; name: string; line_total: number }[];
  shipping: number;
  zone: DeliveryZone;
}): string {
  const { order, form, lines, shipping, zone } = args;
  const rows = lines.map((l) => `• ${l.qty} × ${l.name} — ${money(l.line_total)}`).join('\n');
  return [
    `*New order ${order.order_no}*`,
    '',
    rows,
    '',
    `Delivery (${zone === 'dhaka' ? 'inside Dhaka' : 'outside Dhaka'}): ${shipping === 0 ? 'Free' : money(shipping)}`,
    `*Total: ${money(order.total)}*`,
    '',
    `Name: ${form.customer_name}`,
    `Phone: ${form.customer_phone}`,
    `Address: ${form.address}, ${form.city}`,
    `Payment: ${form.payment_method.toUpperCase()}${form.payment_reference ? ` — TrxID ${form.payment_reference}` : ''}`,
    form.note ? `Note: ${form.note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
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
    payment_reference: '',
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

  // One begin_checkout per visit to this screen, fired once the server has
  // priced the basket so the reported value matches what will be charged.
  const startedCheckout = useRef(false);
  useEffect(() => {
    if (placed || startedCheckout.current || !quote || quote.lines.length === 0) return;
    startedCheckout.current = true;
    trackBeginCheckout(quote.lines, quote.total);
  }, [quote, placed]);

  // The zone and the payment method each get their own funnel step, so the
  // shop can see where a shopper stops.
  const reportedZone = useRef('');
  useEffect(() => {
    if (placed || !quote || reportedZone.current === zone) return;
    reportedZone.current = zone;
    trackAddShippingInfo(quote.lines, quote.total, zone);
  }, [zone, quote, placed]);

  /** The shop's receiving number for whichever mobile-banking method is picked. */
  const payNumber =
    form.payment_method === 'bkash'
      ? settings?.bkash_number
      : form.payment_method === 'nagad'
        ? settings?.nagad_number
        : form.payment_method === 'rocket'
          ? settings?.rocket_number
          : '';

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
      trackPurchase({
        orderNo: res.order.order_no,
        value: res.order.total,
        shipping: quote?.shipping ?? 0,
        tax: quote?.tax ?? 0,
        items: quote?.lines ?? [],
        paymentMethod: form.payment_method,
        zone,
      });
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
    const shopNumber = (settings?.order_whatsapp || '8801400290828').replace(/\D/g, '');
    const waHref = `https://wa.me/${shopNumber}?text=${encodeURIComponent(
      whatsappMessage({
        order: placed,
        form,
        lines: (quote?.lines ?? []).map((l) => ({ qty: l.qty, name: l.name, line_total: l.line_total })),
        shipping: quote?.shipping ?? 0,
        zone,
      }),
    )}`;

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

          <a
            className="btn whatsapp lg block"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackContact('whatsapp_order')}
            style={{ marginTop: 4 }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.470 1.44 1.09 2.83 1.24 3.03.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Z" />
            </svg>
            Send order details on WhatsApp
          </a>
          <p className="tiny dim" style={{ marginTop: 8 }}>
            This opens WhatsApp with your order already written out — just press send. It reaches the shop
            straight away.
          </p>

          <div className="row gap-8 wrap-row" style={{ justifyContent: 'center', marginTop: 18 }}>
            <button className="btn primary" onClick={() => navigate(`/track?order=${placed.order_no}`)}>
              Track order
            </button>
            <Link
              to={`/invoice/${placed.order_no}?phone=${encodeURIComponent(form.customer_phone)}`}
              className="btn dark"
            >
              🧾 Invoice
            </Link>
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
                      onChange={() => {
                        set('payment_method', option.key);
                        if (quote) trackAddPaymentInfo(quote.lines, quote.total, option.key);
                      }}
                    />
                    <span>
                      <strong style={{ display: 'block', fontSize: '0.9rem' }}>{option.label}</strong>
                      <span className="tiny dim">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              {MOBILE_BANKING.includes(form.payment_method) && (
                <div className="pay-instructions">
                  <h4>
                    How to pay with {PAYMENTS.find((p) => p.key === form.payment_method)?.label}
                  </h4>
                  <ol className="guide-steps" style={{ marginTop: 10 }}>
                    <li>
                      Open your {PAYMENTS.find((p) => p.key === form.payment_method)?.label} app and choose{' '}
                      <strong>Send Money</strong>.
                    </li>
                    <li>
                      Send{' '}
                      <strong className="num">{quote ? money(quote.total) : '—'}</strong> to{' '}
                      <strong className="mono">{payNumber || 'ask us for the number'}</strong>.
                    </li>
                    <li>Copy the Transaction ID (TrxID) from the confirmation message.</li>
                    <li>Paste it below so we can match your payment to this order.</li>
                  </ol>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="trx">Transaction ID (TrxID)</label>
                    <input
                      id="trx"
                      className="input mono"
                      maxLength={80}
                      placeholder="e.g. 9F7GH2KL01"
                      value={form.payment_reference}
                      onChange={(e) => set('payment_reference', e.target.value)}
                    />
                    <span className="hint">
                      You can place the order first and send us the TrxID on WhatsApp afterwards.
                    </span>
                  </div>
                </div>
              )}

              {form.payment_method === 'bank' && settings?.bank_details && (
                <div className="pay-instructions">
                  <h4>Bank transfer</h4>
                  <p className="small">{settings.bank_details}</p>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="trx-bank">Payment reference</label>
                    <input
                      id="trx-bank"
                      className="input"
                      maxLength={80}
                      value={form.payment_reference}
                      onChange={(e) => set('payment_reference', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {form.payment_method === 'cod' && (
                <p className="small muted" style={{ marginTop: 12 }}>
                  Pay the courier in cash when your parcel arrives. Nothing to send in advance.
                </p>
              )}
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
