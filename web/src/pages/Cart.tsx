import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useCart } from '../lib/store';
import { trackRemoveFromCart, trackViewCart } from '../lib/analytics';
import type { DeliveryZone, Quote } from '../lib/types';
import { money, number } from '../lib/format';
import { ProductThumb } from '../components/ProductThumb';
import { Empty, Spinner } from '../components/ui';
import { useSeo } from '../lib/seo';

/**
 * The cart never prices itself. Every quantity change asks the Worker to
 * re-quote, so tier breaks, MOQ bumps and free shipping always match what
 * checkout will charge.
 */
export function useQuote(items: { product_id: number; qty: number }[], zone: DeliveryZone = 'outside') {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const key = JSON.stringify([items.map((i) => [i.product_id, i.qty]), zone]);

  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      setError('');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      api<Quote>('/api/quote', {
        method: 'POST',
        body: { items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })), delivery_zone: zone },
        signal: controller.signal,
      })
        .then((res) => {
          setQuote(res);
          setError('');
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') setError(err.message);
        })
        .finally(() => setLoading(false));
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { quote, loading, error };
}

export function OrderSummary({ quote, loading }: { quote: Quote | null; loading: boolean }) {
  if (!quote) return null;

  // net + gap reconstructs the free-shipping threshold, so this is "how far along".
  const net = quote.subtotal - quote.discount;
  const progress = quote.free_shipping_applied
    ? 100
    : Math.min(100, (net / Math.max(net + quote.free_shipping_gap, 1)) * 100);

  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      <div className="summary-row">
        <span className="muted">Subtotal ({number(quote.units)} units)</span>
        <span className="v">{money(quote.subtotal)}</span>
      </div>

      {quote.tier_savings > 0 && (
        <div className="summary-row save">
          <span className="muted">Volume discount</span>
          <span className="v">− {money(quote.tier_savings)}</span>
        </div>
      )}

      {quote.discount > 0 && (
        <div className="summary-row save">
          <span className="muted">Discount</span>
          <span className="v">− {money(quote.discount)}</span>
        </div>
      )}

      <div className="summary-row">
        <span className="muted">
          Delivery
          {!quote.free_shipping_applied && (
            <span className="tiny dim"> · {quote.delivery_zone === 'dhaka' ? 'inside Dhaka' : 'outside Dhaka'}</span>
          )}
        </span>
        <span className="v">
          {quote.free_shipping_applied ? <span style={{ color: 'var(--good)' }}>Free</span> : money(quote.shipping)}
        </span>
      </div>

      {quote.tax > 0 && (
        <div className="summary-row">
          <span className="muted">Tax</span>
          <span className="v">{money(quote.tax)}</span>
        </div>
      )}

      <div className="summary-row total">
        <span>Total</span>
        <span className="v">{money(quote.total)}</span>
      </div>

      {!quote.free_shipping_applied && quote.free_shipping_gap > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className="tiny muted" style={{ marginBottom: 6 }}>
            Add <strong>{money(quote.free_shipping_gap)}</strong> more for free delivery
          </p>
          <div className="progress">
            <div className="fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Cart() {
  useSeo({ title: 'Your Cart', noindex: true });
  const cart = useCart();
  const { quote, loading, error } = useQuote(cart.items);

  // Reported once the server has priced the basket, so the value GA4 sees is
  // the tier price the shopper is actually being offered.
  const reportedCart = useRef('');
  useEffect(() => {
    if (!quote || quote.lines.length === 0) return;
    const key = `${quote.subtotal}:${quote.lines.length}`;
    if (reportedCart.current === key) return;
    reportedCart.current = key;
    trackViewCart(quote.lines, quote.subtotal);
  }, [quote]);

  if (cart.items.length === 0) {
    return (
      <>
        <h1 style={{ marginBottom: 8 }}>Your cart</h1>
        <Empty icon="🛒" title="Your cart is empty" hint="Browse the catalogue and add a few cartons." />
        <div className="center">
          <Link to="/catalog" className="btn primary">
            Start shopping
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="section-head">
        <div>
          <div className="rule" />
          <h1>Your cart</h1>
          <p className="small muted">{number(cart.count)} units across {cart.items.length} products</p>
        </div>
        <button className="btn ghost sm" onClick={cart.clear}>
          Clear cart
        </button>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="cart-layout">
        <div className="panel">
          <div className="panel-body">
            {cart.items.map((item) => {
              const line = quote?.lines.find((l) => l.product_id === item.product_id);
              const unit = line?.unit_price ?? item.price;
              const short = line ? !line.in_stock : false;

              return (
                <div className="cart-line" key={item.product_id}>
                  <Link to={`/product/${item.slug}`} className="media">
                    <ProductThumb name={item.name} imageUrl={item.image_url} category={item.category} />
                  </Link>

                  <div className="stack gap-8">
                    <div className="between">
                      <Link to={`/product/${item.slug}`} style={{ fontWeight: 600 }}>
                        {item.name}
                      </Link>
                      <button
                        className="icon-btn"
                        onClick={() => {
                          trackRemoveFromCart({ ...item, unit_price: unit });
                          cart.remove(item.product_id);
                        }}
                        aria-label={`Remove ${item.name}`}
                      >
                        ✕
                      </button>
                    </div>

                    <span className="tiny dim">
                      SKU {item.sku} · MOQ {item.moq}
                    </span>

                    {short && (
                      <span className="badge out">
                        Only {line?.stock} in stock — reduce the quantity
                      </span>
                    )}

                    <div className="between wrap-row gap-12">
                      <div className="qty">
                        <button
                          onClick={() => cart.setQty(item.product_id, item.qty - 1)}
                          disabled={item.qty <= item.moq}
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={item.qty}
                          min={item.moq}
                          onChange={(e) => cart.setQty(item.product_id, Number(e.target.value) || item.moq)}
                          aria-label={`Quantity of ${item.name}`}
                        />
                        <button
                          onClick={() =>
                            cart.setQty(item.product_id, Math.min(item.qty + 1, line?.stock ?? item.qty + 1))
                          }
                          disabled={line ? item.qty >= line.stock : false}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>

                      <div className="right">
                        <div style={{ fontWeight: 800 }} className="num">
                          {money(line?.line_total ?? unit * item.qty)}
                        </div>
                        <div className="tiny dim num">{money(unit)} each</div>
                        {line && line.tier_savings > 0 && (
                          <div className="tiny" style={{ color: 'var(--good)', fontWeight: 700 }}>
                            saved {money(line.tier_savings)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside>
          <div className="panel" style={{ position: 'sticky', top: 'calc(var(--header-h) + 16px)' }}>
            <div className="panel-head">
              <h3>Order summary</h3>
            </div>
            <div className="panel-body">
              {!quote && loading ? <Spinner /> : <OrderSummary quote={quote} loading={loading} />}

              <Link
                to="/checkout"
                className="btn primary lg block"
                style={{ marginTop: 18, pointerEvents: quote ? 'auto' : 'none', opacity: quote ? 1 : 0.6 }}
              >
                Proceed to checkout
              </Link>
              <Link to="/catalog" className="btn ghost block" style={{ marginTop: 8 }}>
                Continue shopping
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
