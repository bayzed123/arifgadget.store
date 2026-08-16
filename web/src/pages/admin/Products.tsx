import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { money, number, percent, relativeTime } from '../../lib/format';
import { useToast } from '../../lib/store';
import type { AdminProduct, Category } from '../../lib/types';
import { ProductThumb } from '../../components/ProductThumb';
import { Empty, Spinner } from '../../components/ui';
import { ProductEditor } from './ProductEditor';
import { StockDialog } from './StockDialog';

interface Page {
  products: AdminProduct[];
  page: number;
  pages: number;
  total: number;
}

export function Products() {
  const toast = useToast();
  const [data, setData] = useState<Page | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [stockState, setStockState] = useState('');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<AdminProduct | null | undefined>(undefined);
  const [stockFor, setStockFor] = useState<AdminProduct | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page), limit: '50' });
    if (q.trim()) params.set('q', q.trim());
    if (stockState) params.set('stock_state', stockState);

    api<Page>(`/api/admin/products?${params}`, { auth: true })
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, status, stockState, page]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 260 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    api<{ categories: Category[] }>('/api/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([]));
  }, []);

  async function archive(product: AdminProduct) {
    if (!confirm(`Archive "${product.name}"? It disappears from the storefront but stays on past orders.`)) return;
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE', auth: true });
      toast(`${product.name} archived`, 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not archive', 'error');
    }
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Catalogue</span>
          <h1>Products</h1>
          <p className="small muted">
            {data ? `${number(data.total)} products` : 'Loading…'} · margin and stock value recalculate themselves
          </p>
        </div>
        <button className="btn primary" onClick={() => setEditing(null)}>
          + New product
        </button>
      </div>

      <div className="filter-bar">
        <input
          className="input"
          placeholder="Search name, SKU or brand…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select
          className="select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <select
          className="select"
          value={stockState}
          onChange={(e) => {
            setStockState(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Any stock level</option>
          <option value="out">Out of stock</option>
          <option value="low">Low stock</option>
          <option value="ok">Well stocked</option>
        </select>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && !data && <Spinner />}

      {data && (
        <div className="panel">
          <div className="table-scroll">
            {data.products.length === 0 ? (
              <Empty title="No products match those filters" />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="num">Cost</th>
                    <th className="num">Price</th>
                    <th className="num">Margin</th>
                    <th className="num">Stock</th>
                    <th className="num">Stock value</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="row gap-12">
                          <div className="thumb-sm">
                            <ProductThumb
                              name={product.name}
                              imageUrl={product.image_url}
                              category={product.category?.slug}
                            />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }} className="truncate">
                              {product.name}
                            </div>
                            <span className="tiny dim mono">{product.sku}</span>
                            {product.tiers.length > 0 && (
                              <span className="tiny dim"> · {product.tiers.length} tiers</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="small muted">{product.category?.name ?? '—'}</td>
                      <td className="num">{money(product.cost_price)}</td>
                      <td className="num">
                        <strong>{money(product.price)}</strong>
                        {product.compare_at_price > product.price && (
                          <div className="tiny dim" style={{ textDecoration: 'line-through' }}>
                            {money(product.compare_at_price)}
                          </div>
                        )}
                      </td>
                      <td className="num">
                        <strong
                          style={{
                            color:
                              product.margin_pct >= 25
                                ? 'var(--good)'
                                : product.margin_pct >= 10
                                  ? 'var(--warn)'
                                  : 'var(--bad)',
                          }}
                        >
                          {percent(product.margin_pct)}
                        </strong>
                        <div className="tiny dim">{money(product.profit_per_unit)}/unit</div>
                      </td>
                      <td className="num">
                        <button
                          className={`badge ${product.stock_state === 'out' ? 'out' : product.stock_state === 'low' ? 'low' : 'ok'}`}
                          style={{ cursor: 'pointer', border: 'none' }}
                          onClick={() => setStockFor(product)}
                          title="Adjust stock"
                        >
                          {number(product.stock)}
                        </button>
                      </td>
                      <td className="num">{money(product.stock_value)}</td>
                      <td>
                        <span className={`badge ${product.status === 'active' ? 'ok' : 'info'}`}>{product.status}</span>
                        <div className="tiny dim">{relativeTime(product.updated_at)}</div>
                      </td>
                      <td>
                        <div className="row gap-4">
                          <button className="btn ghost sm" onClick={() => setEditing(product)}>
                            Edit
                          </button>
                          {product.status !== 'archived' && (
                            <button className="btn ghost sm" onClick={() => archive(product)} title="Archive">
                              🗑
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {data.pages > 1 && (
            <div className="panel-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, justifyContent: 'center' }}>
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Previous
              </button>
              <span className="small muted num">
                Page {data.page} of {data.pages}
              </span>
              <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {editing !== undefined && (
        <ProductEditor
          product={editing}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            load();
          }}
        />
      )}

      {stockFor && (
        <StockDialog
          product={stockFor}
          onClose={() => setStockFor(null)}
          onSaved={() => {
            setStockFor(null);
            load();
          }}
        />
      )}
    </>
  );
}
