import { Link, useNavigate } from 'react-router-dom';
import type { Product } from '../lib/types';
import { money } from '../lib/format';
import { ProductThumb } from './ProductThumb';
import { setDirectBuy, useCart } from '../lib/store';
import { trackAddToCart, trackSelectItem } from '../lib/analytics';

export function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const navigate = useNavigate();
  const hasTiers = product.tiers.length > 0;

  /** Straight to checkout with this item only — the cart is left untouched. */
  function buyNow() {
    trackSelectItem('Shop now', product);
    setDirectBuy({
      product_id: product.id,
      qty: product.moq,
      name: product.name,
      slug: product.slug,
      image_url: product.image_url,
      category: product.category?.slug ?? null,
    });
    navigate('/checkout');
  }

  return (
    <article className="card">
      <Link to={`/product/${product.slug}`} className="card-media">
        {product.discount_pct > 0 && <span className="ribbon">-{product.discount_pct}%</span>}
        {product.featured && product.discount_pct === 0 && <span className="ribbon gold">Featured</span>}
        {!product.in_stock && <span className="soldout">Sold out</span>}
        <ProductThumb name={product.name} imageUrl={product.image_url} category={product.category?.slug} />
      </Link>

      <div className="card-body">
        <span className="card-brand">{product.brand || product.category?.name}</span>
        <Link to={`/product/${product.slug}`} className="card-name clamp-2">
          {product.name}
        </Link>

        <div className="card-price">
          <span className="now">{money(product.price)}</span>
          {product.compare_at_price > product.price && (
            <span className="was">{money(product.compare_at_price)}</span>
          )}
        </div>

        {hasTiers && (
          <span className="tiny" style={{ color: 'var(--good)', fontWeight: 700 }}>
            {money(product.min_price)} at {product.tiers[product.tiers.length - 1].min_qty}+ units
          </span>
        )}

        <div className="card-meta">
          <span>{product.moq > 1 ? `MOQ ${product.moq}` : 'From 1 piece'}</span>
          <span aria-hidden="true">·</span>
          <span>{product.units_sold} sold</span>
          {product.stock_state === 'low' && product.in_stock && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{product.stock} left</span>
            </>
          )}
        </div>

        <div className="card-actions">
          <button className="btn primary sm" disabled={!product.in_stock} onClick={buyNow}>
            {product.in_stock ? 'Shop now' : 'Unavailable'}
          </button>
          <button
            className="btn ghost sm"
            disabled={!product.in_stock}
            onClick={() => {
              cart.add(product);
              trackAddToCart(product, product.moq);
            }}
            aria-label={`Add ${product.name} to cart`}
          >
            Add to cart
          </button>
        </div>
      </div>
    </article>
  );
}
