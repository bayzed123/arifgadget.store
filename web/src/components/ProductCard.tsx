import { Link } from 'react-router-dom';
import type { Product } from '../lib/types';
import { money } from '../lib/format';
import { ProductThumb } from './ProductThumb';
import { useCart } from '../lib/store';

export function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const hasTiers = product.tiers.length > 0;

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
          <span>MOQ {product.moq}</span>
          <span aria-hidden="true">·</span>
          <span>{product.units_sold} sold</span>
          {product.stock_state === 'low' && product.in_stock && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{product.stock} left</span>
            </>
          )}
        </div>

        <button
          className="btn primary sm block"
          disabled={!product.in_stock}
          onClick={() => cart.add(product)}
        >
          {product.in_stock ? 'Add to cart' : 'Unavailable'}
        </button>
      </div>
    </article>
  );
}
