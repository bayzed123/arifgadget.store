import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useCustomer } from '../lib/store';
import { dateTime, money, ORDER_STATUS_TONE } from '../lib/format';
import { ProductThumb } from '../components/ProductThumb';

interface TrackedOrder {
  order_no: string;
  customer_name: string;
  city: string;
  status: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  payment_method: string;
  created_at: number;
  updated_at: number;
}

interface TrackedItem {
  sku: string;
  name: string;
  image_url: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

const STAGES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered'];

export function Track() {
  const [params, setParams] = useSearchParams();
  const { customer } = useCustomer();
  const [orderNo, setOrderNo] = useState(params.get('order') ?? '');
  const [phone, setPhone] = useState('');

  // A signed-in shopper already told us their number; making them retype it to
  // see their own order is friction for nothing.
  useEffect(() => {
    if (customer?.phone) setPhone((prev) => prev || customer.phone);
  }, [customer]);
  const [result, setResult] = useState<{ order: TrackedOrder; items: TrackedItem[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOrderNo(params.get('order') ?? '');
  }, [params]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const res = await api<{ order: TrackedOrder; items: TrackedItem[] }>(
        `/api/orders/${encodeURIComponent(orderNo.trim())}?phone=${encodeURIComponent(phone.trim())}`,
      );
      setResult(res);
      setParams({ order: orderNo.trim() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not find that order');
    } finally {
      setLoading(false);
    }
  }

  const stageIndex = result ? STAGES.indexOf(result.order.status) : -1;
  const reversed = result ? ['cancelled', 'refunded'].includes(result.order.status) : false;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="section-head">
        <div>
          <div className="rule" />
          <h1>Track your order</h1>
          <p className="small muted">Enter the order number from your confirmation and the phone number you ordered with.</p>
        </div>
      </div>

      <form className="panel" onSubmit={submit}>
        <div className="panel-body form-grid" style={{ alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="order">Order number</label>
            <input
              id="order"
              className="input mono"
              required
              placeholder="AG…"
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value.toUpperCase())}
            />
          </div>
          <div className="field">
            <label htmlFor="tphone">Mobile number</label>
            <input
              id="tphone"
              className="input"
              required
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Track order'}
          </button>
        </div>
      </form>

      {error && (
        <div className="alert error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <div>
              <span className="eyebrow">Order</span>
              <h3 className="mono">{result.order.order_no}</h3>
            </div>
            <span className={`badge ${ORDER_STATUS_TONE[result.order.status] ?? 'info'}`}>
              <span className="dot" /> {result.order.status}
            </span>
          </div>

          <div className="panel-body stack gap-24">
            {reversed ? (
              <div className="alert warn">
                This order was {result.order.status}. Any stock has been returned to inventory. Call support if
                that looks wrong.
              </div>
            ) : (
              <ol className="row wrap-row gap-4" style={{ listStyle: 'none', padding: 0 }}>
                {STAGES.map((stage, index) => {
                  const done = index <= stageIndex;
                  return (
                    <li key={stage} className="grow" style={{ minWidth: 88 }}>
                      <div
                        style={{
                          height: 5,
                          borderRadius: 3,
                          background: done ? 'linear-gradient(90deg, var(--brand), var(--gold))' : 'var(--line)',
                          marginBottom: 7,
                        }}
                      />
                      <span
                        className="tiny"
                        style={{
                          fontWeight: done ? 800 : 600,
                          color: done ? 'var(--ink)' : 'var(--ink-3)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {stage}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            <div>
              {result.items.map((item) => (
                <div className="cart-line" key={item.sku}>
                  <div className="media">
                    <ProductThumb name={item.name} imageUrl={item.image_url} />
                  </div>
                  <div className="between">
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div className="tiny dim">
                        {item.qty} × {money(item.unit_price)} · SKU {item.sku}
                      </div>
                    </div>
                    <strong className="num">{money(item.line_total)}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="summary-row">
                <span className="muted">Subtotal</span>
                <span className="v">{money(result.order.subtotal)}</span>
              </div>
              {result.order.discount > 0 && (
                <div className="summary-row save">
                  <span className="muted">Discount</span>
                  <span className="v">− {money(result.order.discount)}</span>
                </div>
              )}
              <div className="summary-row">
                <span className="muted">Delivery</span>
                <span className="v">{result.order.shipping === 0 ? 'Free' : money(result.order.shipping)}</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span className="v">{money(result.order.total)}</span>
              </div>
              <p className="tiny dim" style={{ marginTop: 10 }}>
                Placed {dateTime(result.order.created_at)} · Delivering to {result.order.city} ·{' '}
                {result.order.payment_method.toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
