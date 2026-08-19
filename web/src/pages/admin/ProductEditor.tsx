import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { money, percent } from '../../lib/format';
import { useToast } from '../../lib/store';
import type { AdminProduct, Category, Tier } from '../../lib/types';
import { GalleryEditor } from '../../components/GalleryEditor';

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
  tags: '',
  status: 'active',
  featured: false,
  category_name: '',
  colours: '',
  returnable: true,
};

export function ProductEditor({ product, categories, onClose, onSaved }: Props) {
  const toast = useToast();
  const [form, setForm] = useState({ ...BLANK });
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [specs, setSpecs] = useState<[string, string][]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // One ordered list rather than a main photo and a separate gallery: staff
  // think in "the product's pictures", and the first one is simply the cover.
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    if (!product) {
      setForm({ ...BLANK });
      setTiers([]);
      setSpecs([]);
      setImages([]);
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
      tags: product.tags.join(', '),
      status: product.status,
      featured: product.featured,
      category_name: '',
      colours: (product.colours ?? []).join(', '),
      returnable: product.returnable !== false,
    });
    setTiers(product.tiers);
    setSpecs(Object.entries(product.specs));
    // The main photo leads; an empty one would otherwise make the gallery's
    // second picture silently become the cover on the next save.
    setImages([product.image_url, ...(product.gallery ?? [])].filter(Boolean));
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
      image_url: images[0] ?? '',
      gallery: images.slice(1),
      tags: form.tags,
      status: form.status,
      featured: form.featured,
      // A typed name wins over the dropdown: staff only fill it in when they
      // mean to create something the list does not have yet.
      ...(form.category_name.trim() ? { category_name: form.category_name.trim() } : {}),
      colours: form.colours,
      returnable: form.returnable,
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

        // Stock is not part of the product PATCH on purpose: every movement
        // belongs in the ledger with a reason and an actor, so a changed figure
        // goes through the same endpoint the stock dialog uses rather than
        // being written straight onto the row.
        const wanted = Math.max(Number(form.stock) || 0, 0);
        if (wanted !== product.stock) {
          await api(`/api/admin/products/${product.id}/stock`, {
            method: 'POST',
            auth: true,
            body: {
              set: wanted,
              reason: wanted > product.stock ? 'restock' : 'adjustment',
              note: 'Edited in the product form',
            },
          });
        }
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
                  <select
                    id="pcat"
                    className="select"
                    value={form.category_id}
                    onChange={(e) => set('category_id', e.target.value)}
                    disabled={form.category_name.trim().length > 0}
                  >
                    <option value="">Uncategorised</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.icon} {category.name}
                      </option>
                    ))}
                  </select>
                  {/*
                    Pick from the list, or type something new. Without this a
                    shopkeeper adding their first drone would have to leave the
                    product form, create the category elsewhere, and come back.
                  */}
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    maxLength={60}
                    placeholder="…or type a new category name"
                    value={form.category_name}
                    onChange={(e) => set('category_name', e.target.value)}
                  />
                  <span className="hint">
                    {form.category_name.trim()
                      ? `A category called "${form.category_name.trim()}" will be created if it does not exist.`
                      : 'Leave the box empty to use the list above.'}
                  </span>
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
                      onChange={(e) => set('stock', e.target.value)}
                    />
                    {product && (
                      <span className="hint">
                        Change it here and the stock ledger records the adjustment automatically.
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="pcolours">Colours</label>
                    {/*
                      One box, comma separated. Colour is not a stock-keeping
                      unit here — the shop counts stock per product — so this
                      lists what the customer can choose, and their choice is
                      recorded on the order line for packing.
                    */}
                    <input
                      id="pcolours"
                      className="input"
                      placeholder="Black, Silver, Blue"
                      value={form.colours}
                      onChange={(e) => set('colours', e.target.value)}
                    />
                    <span className="hint">Separate with commas. Leave empty if it comes in one colour only.</span>
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
                  <h3 style={{ fontSize: '0.95rem' }}>Pictures</h3>
                </div>
                <div className="panel-body stack gap-12">
                  <GalleryEditor images={images} onChange={setImages} name={form.name || 'Product'} />
                  <label className="row gap-8 small" style={{ fontWeight: 600, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
                    Feature on the homepage
                  </label>
                  {/*
                    Ticked by default, because most stock is returnable and the
                    safer default for a shopper is the one that grants them the
                    policy. Untick it for clearance and sealed lines, and the
                    product page says so before the sale rather than after.
                  */}
                  <label className="row gap-8 small" style={{ fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.returnable}
                      onChange={(e) => set('returnable', e.target.checked)}
                    />
                    Customer can return this item
                  </label>
                  <span className="hint">
                    {form.returnable
                      ? 'The 7-day return policy applies to this product.'
                      : 'Shown as “Sold as-is” on the product page. Warranty still applies.'}
                  </span>
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
