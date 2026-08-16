import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Product as ProductType } from '../lib/types';
import { money, number } from '../lib/format';
import { ProductThumb } from '../components/ProductThumb';
import { ProductCard } from '../components/ProductCard';
import { Empty, Rating, Spinner, StockBadge } from '../components/ui';
import { setDirectBuy, useCart } from '../lib/store';

/** Mirrors the Worker's tier resolution so the page can price instantly. */
function unitPriceFor(product: ProductType, qty: number): number {
  let price = product.price;
  let best = 0;
  for (const tier of product.tiers) {
    if (qty >= tier.min_qty && tier.min_qty >= best) {
      best = tier.min_qty;
      price = tier.unit_price;
    }
  }
  return price;
}

export function Product() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<ProductType | null>(null);
  const [related, setRelated] = useState<ProductType[]>([]);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const cart = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    setProduct(null);
    setError('');
    window.scrollTo({ top: 0 });

    api<{ product: ProductType; related: ProductType[] }>(`/api/products/${slug}`)
      .then((res) => {
        setProduct(res.product);
        setRelated(res.related);
        setQty(res.product.moq);
      })
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  const unitPrice = useMemo(() => (product ? unitPriceFor(product, qty) : 0), [product, qty]);
  const activeTier = useMemo(() => {
    if (!product) return -1;
    let index = -1;
    product.tiers.forEach((tier, i) => {
      if (qty >= tier.min_qty) index = i;
    });
    return index;
  }, [product, qty]);

  if (error) return <Empty icon="⚠️" title="Product not found" hint={error} />;
  if (!product) return <Spinner />;

  const lineTotal = unitPrice * qty;
  const savings = (product.price - unitPrice) * qty;
  const specs = Object.entries(product.specs);

  return (
    <>
      <nav className="small dim row gap-8" style={{ marginBottom: 16 }} aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">›</span>
        {product.category && (
          <>
            <Link to={`/catalog?category=${product.category.slug}`}>{product.category.name}</Link>
            <span aria-hidden="true">›</span>
          </>
        )}
        <span className="truncate">{product.name}</span>
      </nav>

      <div className="pdp">
        <div>
          <div className="pdp-media">
            <ProductThumb name={product.name} imageUrl={product.image_url} category={product.category?.slug} />
          </div>

          {product.description && (
            <section style={{ marginTop: 26 }}>
              <h2 style={{ marginBottom: 10 }}>About this product</h2>
              <p className="muted">{product.description}</p>
            </section>
          )}

          {specs.length > 0 && (
            <section style={{ marginTop: 26 }}>
              <h2 style={{ marginBottom: 10 }}>Specifications</h2>
              <div className="spec-list">
                {specs.map(([key, value]) => (
                  <div key={key}>
                    <span className="k">{key}</span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section style={{ marginTop: 26 }}>
            <h2 style={{ marginBottom: 10 }}>Ordering &amp; delivery</h2>
            <ul className="muted small" style={{ paddingLeft: 20, display: 'grid', gap: 6 }}>
              <li>Minimum order quantity is {product.moq} unit{product.moq === 1 ? '' : 's'}.</li>
              <li>Dispatched within 48 hours of payment confirmation.</li>
              <li>Cash on delivery, bKash, Nagad and bank transfer accepted.</li>
              <li>Seven-day return window on sealed, unopened units.</li>
            </ul>
          </section>
        </div>

        <aside className="pdp-buy">
          <div>
            <span className="card-brand">{product.brand}</span>
            <h1 style={{ fontSize: '1.5rem', margin: '4px 0 8px' }}>{product.name}</h1>
            <div className="row gap-12 wrap-row">
              <Rating value={product.rating} count={product.review_count} />
              <span className="tiny dim">SKU {product.sku}</span>
            </div>
          </div>

          <p className="muted small">{product.summary}</p>

          <div className="price-lead">
            <span className="now">{money(unitPrice)}</span>
            {product.compare_at_price > unitPrice && <span className="was">{money(product.compare_at_price)}</span>}
            {product.discount_pct > 0 && <span className="badge brand">-{product.discount_pct}%</span>}
          </div>

          <StockBadge state={product.stock_state} stock={product.stock} />

          {product.tiers.length > 0 && (
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>
                Volume pricing
              </span>
              <table className="tier-table">
                <thead>
                  <tr>
                    <th>Quantity</th>
                    <th className="right">Unit price</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={activeTier === -1 ? 'active' : ''}>
                    <td>
                      {product.moq} – {product.tiers[0].min_qty - 1}
                    </td>
                    <td className="right price">{money(product.price)}</td>
                  </tr>
                  {product.tiers.map((tier, index) => {
                    const next = product.tiers[index + 1];
                    return (
                      <tr key={tier.min_qty} className={activeTier === index ? 'active' : ''}>
                        <td>{next ? `${tier.min_qty} – ${next.min_qty - 1}` : `${tier.min_qty}+`}</td>
                        <td className="right price">{money(tier.unit_price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="row gap-12 wrap-row">
            <div className="qty">
              <button onClick={() => setQty((q) => Math.max(q - 1, product.moq))} disabled={qty <= product.moq} aria-label="Decrease quantity">
                −
              </button>
              <input
                type="number"
                value={qty}
                min={product.moq}
                onChange={(e) => setQty(Math.max(Number(e.target.value) || product.moq, product.moq))}
                aria-label="Quantity"
              />
              <button onClick={() => setQty((q) => q + 1)} aria-label="Increase quantity">
                +
              </button>
            </div>
            <span className="small dim">MOQ {product.moq}</span>
          </div>

          <div style={{ background: 'var(--surface-inset)', padding: '12px 14px', borderRadius: 'var(--radius-sm)' }}>
            <div className="between small">
              <span className="muted">
                {number(qty)} × {money(unitPrice)}
              </span>
              <strong className="num" style={{ fontSize: '1.15rem' }}>
                {money(lineTotal)}
              </strong>
            </div>
            {savings > 0 && (
              <div className="tiny" style={{ color: 'var(--good)', fontWeight: 700, marginTop: 4 }}>
                You save {money(savings)} at this quantity
              </div>
            )}
          </div>

          <div className="stack gap-8">
            <button
              className="btn primary lg block"
              disabled={!product.in_stock}
              onClick={() => {
                setDirectBuy({
                  product_id: product.id,
                  qty,
                  name: product.name,
                  slug: product.slug,
                  image_url: product.image_url,
                  category: product.category?.slug ?? null,
                });
                navigate('/checkout');
              }}
            >
              {product.in_stock ? 'Shop now' : 'Out of stock'}
            </button>
            <button
              className="btn ghost lg block"
              disabled={!product.in_stock}
              onClick={() => cart.add(product, qty)}
            >
              Add to cart
            </button>
          </div>

          {product.stock > 0 && qty > product.stock && (
            <p className="alert warn">Only {product.stock} units are available right now.</p>
          )}
        </aside>
      </div>

      {related.length > 0 && (
        <section style={{ marginTop: 48 }}>
          <div className="section-head">
            <div>
              <div className="rule" />
              <h2>Customers also viewed</h2>
            </div>
          </div>
          <div className="prod-rail">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
