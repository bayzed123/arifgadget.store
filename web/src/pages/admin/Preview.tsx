import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../lib/store';
import { money } from '../../lib/format';
import type { AdminProduct, Category, Post } from '../../lib/types';
import { Spinner } from '../../components/ui';
import { GalleryEditor } from '../../components/GalleryEditor';
import { PREVIEW_SOURCE, isPreviewMessage, type PreviewMessage } from '../../lib/previewBridge';

/**
 * The shop, live, with an edit panel beside it.
 *
 * Staff browse the real storefront in the frame. Whatever they land on — a
 * product, a blog post, a policy page — the panel on the right loads the thing
 * behind it and offers the fields worth changing. Save, and the frame reloads
 * showing the result.
 *
 * The point is that nobody has to find the item in a list first. Someone who
 * spots a typo while looking at the shop fixes it where they spotted it.
 */

type Target =
  | { kind: 'product'; slug: string }
  | { kind: 'post'; slug: string }
  | { kind: 'page'; slug: string }
  | { kind: 'none'; path: string };

/** Works out what the shop is showing from the route it announced. */
function targetFor(path: string): Target {
  const product = path.match(/^\/product\/([^/?#]+)/);
  if (product) return { kind: 'product', slug: decodeURIComponent(product[1]) };

  const post = path.match(/^\/blog\/([^/?#]+)/);
  if (post) return { kind: 'post', slug: decodeURIComponent(post[1]) };

  const page = path.match(/^\/page\/([^/?#]+)/);
  if (page) return { kind: 'page', slug: decodeURIComponent(page[1]) };

  return { kind: 'none', path };
}

interface EditablePage {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  section: string;
  published: number;
}

export function Preview() {
  const toast = useToast();
  const frame = useRef<HTMLIFrameElement>(null);

  const [path, setPath] = useState('/');
  const [target, setTarget] = useState<Target>({ kind: 'none', path: '/' });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [post, setPost] = useState<Post & { id: number } | null>(null);
  const [page, setPage] = useState<EditablePage | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    api<{ categories: Category[] }>('/api/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([]));
  }, []);

  // The frame announces its route on every navigation; an iframe's URL cannot
  // be watched from outside because a single-page app never reloads.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data) || event.data.type !== 'route') return;
      setPath(event.data.path);
      setTarget(targetFor(event.data.path));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /** Loads whatever the frame is currently showing. */
  useEffect(() => {
    setProduct(null);
    setPost(null);
    setPage(null);
    if (target.kind === 'none') return;

    setLoading(true);
    const slug = target.slug;

    const request =
      target.kind === 'product'
        ? api<{ products: AdminProduct[] }>(`/api/admin/products?q=${encodeURIComponent(slug)}&limit=50`, {
            auth: true,
          }).then((res) => {
            // Search matches names and SKUs too, so pick the exact slug.
            const match = res.products.find((p) => p.slug === slug) ?? null;
            setProduct(match);
          })
        : target.kind === 'post'
          ? api<{ posts: (Post & { id: number })[] }>('/api/admin/content/posts', { auth: true }).then((res) =>
              setPost(res.posts.find((p) => p.slug === slug) ?? null),
            )
          : api<{ pages: EditablePage[] }>('/api/admin/content/pages', { auth: true }).then((res) =>
              setPage(res.pages.find((p) => p.slug === slug) ?? null),
            );

    request.catch(() => undefined).finally(() => setLoading(false));
  }, [target]);

  /** Ask the frame to re-fetch so the edit is visible immediately. */
  const refreshFrame = useCallback(() => {
    const message: PreviewMessage = { source: PREVIEW_SOURCE, type: 'reload' };
    frame.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  async function saveProduct(patch: Record<string, unknown>) {
    if (!product) return;
    setBusy(true);
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'PATCH', auth: true, body: patch });
      toast('Saved — the preview is refreshing', 'success');
      setProduct({ ...product, ...(patch as Partial<AdminProduct>) });
      refreshFrame();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveContent(kind: 'posts' | 'pages', id: number, patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/api/admin/content/${kind}/${id}`, { method: 'PATCH', auth: true, body: patch });
      toast('Saved — the preview is refreshing', 'success');
      refreshFrame();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Live shop</span>
          <h1>Preview &amp; edit</h1>
          <p className="small muted">
            Browse the shop exactly as a customer sees it. Open a product, a blog post or a policy page and edit
            it right here — no need to find it in a list first.
          </p>
        </div>
        <button className="btn ghost sm" onClick={refreshFrame}>
          ↻ Refresh preview
        </button>
      </div>

      <div className="preview-split">
        <div className="panel preview-frame-panel">
          <div className="panel-head">
            <span className="tiny dim mono truncate">{path}</span>
          </div>
          <iframe
            ref={frame}
            title="Live storefront preview"
            src="/"
            className="preview-frame"
            // Same origin, so the two windows can talk. The shop is our own
            // code, not third-party content that needs sandboxing away.
          />
        </div>

        <div className="panel preview-edit-panel">
          <div className="panel-head">
            <h3>Edit this</h3>
          </div>
          <div className="panel-body stack gap-16">
            {loading && <Spinner />}

            {!loading && target.kind === 'none' && (
              <div className="small muted">
                <p style={{ marginBottom: 10 }}>
                  <strong>Open something to edit it.</strong>
                </p>
                <p>
                  In the shop beside this, tap any product, blog post or policy page. Its details appear here and
                  you can change them straight away.
                </p>
              </div>
            )}

            {!loading && target.kind === 'product' && !product && (
              <p className="small muted">That product could not be loaded. Try refreshing the preview.</p>
            )}

            {!loading && product && (
              <ProductPanel
                product={product}
                categories={categories}
                busy={busy}
                onSave={saveProduct}
              />
            )}

            {!loading && post && (
              <ContentPanel
                heading="Blog post"
                title={post.title}
                body={post.body}
                extra={post.excerpt}
                extraLabel="Short excerpt"
                busy={busy}
                onSave={(patch) => saveContent('posts', post.id, { ...patch, excerpt: patch.extra })}
              />
            )}

            {!loading && page && (
              <ContentPanel
                heading="Policy / company page"
                title={page.title}
                body={page.body}
                extra={page.summary}
                extraLabel="Short summary"
                busy={busy}
                onSave={(patch) => saveContent('pages', page.id, { ...patch, summary: patch.extra })}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** The handful of product fields worth changing without leaving the shop. */
function ProductPanel({
  product,
  categories,
  busy,
  onSave,
}: {
  product: AdminProduct;
  categories: Category[];
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(product.name);
  const [summary, setSummary] = useState(product.summary);
  const [description, setDescription] = useState(product.description);
  const [price, setPrice] = useState((product.price / 100).toString());
  const [categoryId, setCategoryId] = useState(product.category_id ? String(product.category_id) : '');
  const [status, setStatus] = useState(product.status);
  const [images, setImages] = useState<string[]>([]);

  // Reset every field when the shopper navigates to a different product.
  useEffect(() => {
    setName(product.name);
    setSummary(product.summary);
    setDescription(product.description);
    setPrice((product.price / 100).toString());
    setCategoryId(product.category_id ? String(product.category_id) : '');
    setStatus(product.status);
    setImages([product.image_url, ...(product.gallery ?? [])].filter(Boolean));
  }, [product]);

  return (
    <>
      <div>
        <span className="eyebrow">Product</span>
        <p className="tiny dim mono">
          {product.sku} · stock {product.stock} · {money(product.price)}
        </p>
      </div>

      <div className="field">
        <label htmlFor="pv-name">Name</label>
        <input id="pv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label>Pictures</label>
        <GalleryEditor images={images} onChange={setImages} name={product.name} compact />
      </div>

      <div className="field">
        <label htmlFor="pv-price">Price (৳)</label>
        <input
          id="pv-price"
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="pv-cat">Category</label>
        <select id="pv-cat" className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Uncategorised</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.icon} {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="pv-summary">Short summary</label>
        <input id="pv-summary" className="input" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="pv-desc">Description</label>
        <textarea
          id="pv-desc"
          className="input"
          rows={7}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <span className="hint">Leave a blank line between paragraphs. Start a line with - for a bullet.</span>
      </div>

      <div className="field">
        <label htmlFor="pv-status">Visible in the shop</label>
        <select
          id="pv-status"
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value as AdminProduct['status'])}
        >
          <option value="active">Yes — customers can buy it</option>
          <option value="draft">No — hidden while you work on it</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <button
        className="btn primary"
        disabled={busy}
        onClick={() =>
          onSave({
            name,
            summary,
            description,
            // Taka in the box, poisha in the database — the same conversion the
            // full editor makes, and the reason it is done in one place here.
            price: Math.round(Number(price) * 100) || 0,
            category_id: categoryId ? Number(categoryId) : null,
            status,
            image_url: images[0] ?? '',
            gallery: images.slice(1),
          })
        }
      >
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </>
  );
}

/** Blog posts and policy pages share a shape: a title, a blurb and a body. */
function ContentPanel({
  heading,
  title,
  body,
  extra,
  extraLabel,
  busy,
  onSave,
}: {
  heading: string;
  title: string;
  body: string;
  extra: string;
  extraLabel: string;
  busy: boolean;
  onSave: (patch: { title: string; body: string; extra: string }) => void;
}) {
  const [t, setT] = useState(title);
  const [b, setB] = useState(body);
  const [x, setX] = useState(extra);

  useEffect(() => {
    setT(title);
    setB(body);
    setX(extra);
  }, [title, body, extra]);

  return (
    <>
      <span className="eyebrow">{heading}</span>

      <div className="field">
        <label htmlFor="cv-title">Title</label>
        <input id="cv-title" className="input" value={t} onChange={(e) => setT(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="cv-extra">{extraLabel}</label>
        <input id="cv-extra" className="input" value={x} onChange={(e) => setX(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="cv-body">Text</label>
        <textarea id="cv-body" className="input" rows={16} value={b} onChange={(e) => setB(e.target.value)} />
        <span className="hint">
          ## for a heading, - for a bullet, **bold**. Leave a blank line between paragraphs.
        </span>
      </div>

      <button className="btn primary" disabled={busy} onClick={() => onSave({ title: t, body: b, extra: x })}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </>
  );
}
