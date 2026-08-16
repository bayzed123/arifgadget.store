import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Product } from '../lib/types';
import { ProductCard } from '../components/ProductCard';
import { Empty, Spinner } from '../components/ui';

interface Page {
  products: Product[];
  page: number;
  pages: number;
  total: number;
}

const SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'popular', label: 'Best selling' },
  { key: 'price_asc', label: 'Price ↑' },
  { key: 'price_desc', label: 'Price ↓' },
  { key: 'discount', label: 'Biggest discount' },
  { key: 'rating', label: 'Top rated' },
];

export function Catalog() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const category = params.get('category') ?? '';
  const q = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const inStock = params.get('in_stock') === '1';
  const page = Number(params.get('page')) || 1;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    const search = new URLSearchParams({ sort, page: String(page), limit: '24' });
    if (category) search.set('category', category);
    if (q) search.set('q', q);
    if (inStock) search.set('in_stock', '1');

    api<Page>(`/api/products?${search}`, { signal: controller.signal })
      .then(setData)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [category, q, sort, inStock, page]);

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  }

  const heading = q ? `Results for “${q}”` : category ? category.replace(/-/g, ' ') : 'All products';

  return (
    <>
      <div className="section-head">
        <div>
          <div className="rule" />
          <h1 style={{ textTransform: 'capitalize' }}>{heading}</h1>
          <p className="small muted">
            {loading ? 'Loading…' : `${data?.total ?? 0} product${data?.total === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div
        className="between wrap-row"
        style={{ marginBottom: 18, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}
      >
        <div className="pill-tabs">
          {SORTS.map((option) => (
            <button
              key={option.key}
              className={sort === option.key ? 'active' : ''}
              onClick={() => update({ sort: option.key })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="row gap-8 small" style={{ fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={inStock} onChange={(e) => update({ in_stock: e.target.checked ? '1' : null })} />
          In stock only
        </label>
      </div>

      {error && <Empty icon="⚠️" title="Could not load products" hint={error} />}
      {loading && !data && <Spinner />}

      {data && !error && (
        <>
          {data.products.length === 0 ? (
            <Empty
              title="Nothing matches those filters"
              hint="Try a different category, or clear the search box."
            />
          ) : (
            <div className="prod-grid" style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
              {data.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {data.pages > 1 && (
            <div className="row gap-8 center" style={{ justifyContent: 'center', marginTop: 32 }}>
              <button
                className="btn ghost sm"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                ← Previous
              </button>
              <span className="small muted num">
                Page {data.page} of {data.pages}
              </span>
              <button
                className="btn ghost sm"
                disabled={page >= data.pages}
                onClick={() => update({ page: String(page + 1) })}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
