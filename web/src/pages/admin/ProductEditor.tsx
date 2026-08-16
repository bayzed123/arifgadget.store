import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, uploadImage } from '../../lib/api';
import { money, percent } from '../../lib/format';
import { useToast } from '../../lib/store';
import type { AdminProduct, Category, Tier } from '../../lib/types';
import { ProductThumb } from '../../components/ProductThumb';

/** Form state is in taka; the API speaks poisha. */
const toPoisha = (taka: string) => Math.round((Number(taka) || 0) * 100);
const toTaka = (poisha: number) => (poisha / 100).toString();

interface Props {
  product: AdminProduct | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

const BLANK = {
  name: '',
  sku: '',
  brand: '',
  category_id: '',
  summary: '',
  description: '',
  cost_price: '',
  price: '',
  compare_at_price: '',
  stock: '0',
  low_stock_threshold: '5',
  moq: '1',
  image_url: '',
  tags: '',
  status: 'active',
  featured: false,
};

export function ProductEditor({ product, categories, onClose, onSaved }: Props) {
  const toast = useToast();
  const [form, setForm] = useState({ ...BLANK });
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [specs, setSpecs] = useState<[string, string][]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!product) {
      setForm({ ...BLANK });
      setTiers([]);
      setSpecs([]);
      return;
    }
    setForm({
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      category_id: product.category_id ? String(product.category_id) : '',
      summary: product.summary,
      description: product.description,
      cost_price: toTaka(product.cost_price),
      price: toTaka(product.price),
      compare_at_price: product.compare_at_price ? toTaka(product.compare_at_price) : '',
      stock: String(product.stock),
      low_stock_threshold: String(product.low_stock_threshold),
      moq: String(product.moq),
      image_url: product.image_url,
      tags: product.tags.join(', '),
      status: product.status,
      featured: product.featured,
    });
    setTiers(product.tiers);
    setSpecs(Object.entries(product.specs));
  }, [product]);

  function set(field: keyof typeof BLANK, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // The same arithmetic the database applies, shown live while typing.
  const calc = useMemo(() => {
    const cost = toPoisha(form.cost_price);
    const price = toPoisha(form.price);
    const compare = toPoisha(form.compare_at_price);
    const stock = Number(form.stock) || 0;

    return {
      unitProfit: price - cost,
      margin: price > 0 ? ((price - cost) / price) * 100 : 0,
      markup: cost > 0 ? ((price - cost) / cost) * 100 : 0,
      discount: compare > price && compare > 0 ? ((compare - price) / compare) * 100 : 0,
      stockCost: stock * cost,
      stockRetail: stock * price,
      potential: stock * (price - cost),
    };
  }, [form.cost_price, form.price, form.compare_at_price, form.stock]);

  const marginTone = calc.margin >= 25 ? 'var(--good)' : calc.margin >= 10 ? 'var(--warn)' : 'var(--bad)';

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const res = await uploadImage(file);
      set('image_url', res.url);
      toast('Image uploaded', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (toPoisha(form.price) <= 0) {
      setError('Selling price must be greater than zero');
      return;
    }
    setBusy(true);

    const payload: Record<string, unknown> = {
      name: form.name,
      brand: form.brand,
      category_id: form.category_id ? Number(form.category_id) : null,
      summary: form.summary,
      description: form.description,
      cost_price: toPoisha(form.cost_price),
      price: toPoisha(form.price),
      compare_at_price: toPoisha(form.compare_at_price),
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
      moq: Math.max(Number(form.moq) || 1, 1),
      image_url: form.image_url,
      tags: form.tags,
      status: form.status,
      featured: form.featured,
      tiers: tiers.filter((t) => t.min_qty > 0 && t.unit_price >= 0),
      specs: Object.fromEntries(specs.filter(([k]) => k.trim())),
    };

    // Stock is only sent on create; edits go through the ledger endpoint so
    // every change keeps a reason and an actor.
    if (!product) {
      payload.stock = Number(form.stock) || 0;
      payload.sku = form.sku;
    }

    try {
      if (product) {
        await api(`/api/admin/products/${product.id}`, { method: 'PATCH', auth: true, body: payload });
        toast('Product updated', 'success');
      } else {
        await api('/api/admin/products', { method: 'POST', auth: true, body: payload });
        toast('Product created', 'success');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the product');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={product ? 'Edit product' : 'New product'}>
        <div className="panel-head">
          <div>
            <span className="eyebrow">{product ? `Editing ${product.sku}` : 'New product'}</span>
            <h2 style={{ fontSize: '1.2rem' }}>{form.name || 'Untitled product'}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={submit}>
          <div className="editor-grid">
            <div className="stack gap-16">
              <div className="field">
                <label htmlFor="pname">Product name *</label>
                <input id="pname" className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="psku">SKU</label>
                  <input
                    id="psku"
                    className="input mono"
                    value={form.sku}
                    disabled={Boolean(product)}
                    placeholder="auto-generated"
                    onChange={(e) => set('sku', e.target.value.toUpperCase())}
                  />
                  {product && <span className="hint">SKUs are fixed once orders reference them.</span>}
                </div>
                <div className="field">
                  <label htmlFor="pbrand">Brand</label>
                  <input id="pbrand" className="input" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="pcat">Category</label>
                  <select id="pcat" className="select" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                    <option value="">Uncategorised</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.icon} {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pstatus">Status</label>
                  <select id="pstatus" className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="active">Active — visible in the store</option>
                    <option value="draft">Draft — hidden</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="psummary">Short summary</label>
                <input
                  id="psummary"
                  className="input"
                  maxLength={300}
                  placeholder="One line shown under the product name"
                  value={form.summary}
                  onChange={(e) => set('summary', e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="pdesc">Description</label>
                <textarea id="pdesc" className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>

              <fieldset style={{ border: 0, padding: 0 }}>
                <legend className="eyebrow" style={{ marginBottom: 8 }}>
                  Pricing (৳)
                </legend>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="pcost">Cost price</label>
                    <input
                      id="pcost"
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.cost_price}
                      onChange={(e) => set('cost_price', e.target.value)}
                    />
                    <span className="hint">What you pay the supplier.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="pprice">Selling price *</label>
                    <input
                      id="pprice"
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={form.price}
                      onChange={(e) => set('price', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pcompare">Compare-at price</label>
                    <input
                      id="pcompare"
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.compare_at_price}
                      onChange={(e) => set('compare_at_price', e.target.value)}
                    />
                    <span className="hint">Shows a struck-through price and a discount badge.</span>
                  </div>
                </div>
              </fieldset>

              <fieldset style={{ border: 0, padding: 0 }}>
                <legend className="eyebrow" style={{ marginBottom: 8 }}>
                  Inventory
                </legend>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="pstock">{product ? 'Current stock' : 'Opening stock'}</label>
                    <input
                      id="pstock"
                      className="input"
                      type="number"
                      min="0"
                      value={form.stock}
                      disabled={Boolean(product)}
                      onChange={(e) => set('stock', e.target.value)}
                    />
                    {product && <span className="hint">Adjust stock from the products table so it lands in the ledger.</span>}
                  </div>
                  <div className="field">
                    <label htmlFor="plow">Low-stock threshold</label>
                    <input
                      id="plow"
                      className="input"
                      type="number"
                      min="0"
                      value={form.low_stock_threshold}
                      onChange={(e) => set('low_stock_threshold', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pmoq">Minimum order qty</label>
                    <input
                      id="pmoq"
                      className="input"
                      type="number"
                      min="1"
                      value={form.moq}
                      onChange={(e) => set('moq', e.target.value)}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset style={{ border: 0, padding: 0 }}>
                <legend className="eyebrow" style={{ marginBottom: 8 }}>
                  Volume price tiers
                </legend>
                <div className="stack gap-8">
                  {tiers.map((tier, index) => (
                    <div className="row gap-8" key={index}>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        placeholder="Min qty"
                        value={tier.min_qty || ''}
                        onChange={(e) =>
                          setTiers((list) =>
                            list.map((t, i) => (i === index ? { ...t, min_qty: Number(e.target.value) || 0 } : t)),
                          )
                        }
                      />
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit price ৳"
                        value={tier.unit_price ? tier.unit_price / 100 : ''}
                        onChange={(e) =>
                          setTiers((list) =>
                            list.map((t, i) => (i === index ? { ...t, unit_price: toPoisha(e.target.value) } : t)),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setTiers((list) => list.filter((_, i) => i !== index))}
                        aria-label="Remove tier"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setTiers((list) => [...list, { min_qty: 0, unit_price: 0 }])}
                  >
                    + Add tier
                  </button>
                </div>
              </fieldset>

              <fieldset style={{ border: 0, padding: 0 }}>
                <legend className="eyebrow" style={{ marginBottom: 8 }}>
                  Specifications
                </legend>
                <div className="stack gap-8">
                  {specs.map(([key, value], index) => (
                    <div className="row gap-8" key={index}>
                      <input
                        className="input"
                        placeholder="Label"
                        value={key}
                        onChange={(e) => setSpecs((list) => list.map((s, i) => (i === index ? [e.target.value, s[1]] : s)))}
                      />
                      <input
                        className="input"
                        placeholder="Value"
                        value={value}
                        onChange={(e) => setSpecs((list) => list.map((s, i) => (i === index ? [s[0], e.target.value] : s)))}
                      />
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setSpecs((list) => list.filter((_, i) => i !== index))}
                        aria-label="Remove specification"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn ghost sm" onClick={() => setSpecs((list) => [...list, ['', '']])}>
                    + Add specification
                  </button>
                </div>
              </fieldset>

              <div className="field">
                <label htmlFor="ptags">Tags</label>
                <input
                  id="ptags"
                  className="input"
                  placeholder="phone, 5g, bulk"
                  value={form.tags}
                  onChange={(e) => set('tags', e.target.value)}
                />
                <span className="hint">Comma separated — used by search.</span>
              </div>
            </div>

            <aside className="stack gap-16">
              <div className="panel">
                <div className="panel-head">
                  <h3 style={{ fontSize: '0.95rem' }}>Live margin</h3>
                </div>
                <div className="panel-body stack gap-8">
                  <div className="between small">
                    <span className="muted">Profit per unit</span>
                    <strong className="num">{money(calc.unitProfit)}</strong>
                  </div>
                  <div className="between small">
                    <span className="muted">Margin</span>
                    <strong className="num" style={{ color: marginTone }}>
                      {percent(calc.margin)}
                    </strong>
                  </div>
                  <div className="between small">
                    <span className="muted">Markup</span>
                    <strong className="num">{percent(calc.markup)}</strong>
                  </div>
                  {calc.discount > 0 && (
                    <div className="between small">
                      <span className="muted">Shown discount</span>
                      <strong className="num" style={{ color: 'var(--brand-ink)' }}>
                        −{Math.round(calc.discount)}%
                      </strong>
                    </div>
                  )}
                  <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0' }} />
                  <div className="between small">
                    <span className="muted">Stock at cost</span>
                    <strong className="num">{money(calc.stockCost)}</strong>
                  </div>
                  <div className="between small">
                    <span className="muted">Stock at retail</span>
                    <strong className="num">{money(calc.stockRetail)}</strong>
                  </div>
                  <div className="between small">
                    <span className="muted">Potential profit</span>
                    <strong className="num" style={{ color: 'var(--good)' }}>
                      {money(calc.potential)}
                    </strong>
                  </div>
                  {calc.unitProfit < 0 && <div className="alert error tiny">Selling below cost.</div>}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h3 style={{ fontSize: '0.95rem' }}>Image</h3>
                </div>
                <div className="panel-body stack gap-12">
                  <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--line)' }}>
                    <ProductThumb name={form.name || 'Product'} imageUrl={form.image_url} />
                  </div>
                  <label className="btn ghost sm block" style={{ cursor: 'pointer' }}>
                    {uploading ? 'Uploading…' : 'Upload image'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUpload(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <div className="field">
                    <label htmlFor="pimg" className="tiny">
                      or paste a URL
                    </label>
                    <input
                      id="pimg"
                      className="input"
                      value={form.image_url}
                      onChange={(e) => set('image_url', e.target.value)}
                    />
                  </div>
                  <label className="row gap-8 small" style={{ fontWeight: 600, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
                    Feature on the homepage
                  </label>
                </div>
              </div>
            </aside>
          </div>

          {error && <div className="alert error" style={{ marginTop: 16 }}>{error}</div>}

          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : product ? 'Save changes' : 'Create product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
