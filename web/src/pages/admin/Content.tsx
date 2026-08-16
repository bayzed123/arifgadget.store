import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, mediaUrl, uploadImage } from '../../lib/api';
import { date, relativeTime } from '../../lib/format';
import { useToast } from '../../lib/store';
import { Empty, Spinner } from '../../components/ui';

type Tab = 'pages' | 'posts' | 'press';

interface PageRow {
  id: number;
  slug: string;
  title: string;
  section: string;
  summary: string;
  body?: string;
  sort_order: number;
  published: number;
  updated_at: number;
}

interface PostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  cover_url: string;
  author: string;
  tags: string;
  published: number;
  published_at: number;
}

interface PressRow {
  id: number;
  title: string;
  outlet: string;
  url: string;
  thumbnail_url: string;
  excerpt: string;
  published_at: number;
  visible: number;
  sort_order: number;
}

const BODY_HELP =
  'Formatting: "## Heading", "### Subheading", "- bullet", "1. numbered", **bold**, [link](https://…). Leave a blank line between paragraphs.';

export function Content() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('pages');

  const [pages, setPages] = useState<PageRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [press, setPress] = useState<PressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api<{ pages: PageRow[] }>('/api/admin/content/pages', { auth: true }),
      api<{ posts: PostRow[] }>('/api/admin/content/posts', { auth: true }),
      api<{ press: PressRow[] }>('/api/admin/content/press', { auth: true }),
    ])
      .then(([p, b, n]) => {
        setPages(p.pages);
        setPosts(b.posts);
        setPress(n.press);
        setError('');
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const endpoint = (t: Tab) => `/api/admin/content/${t}`;

  async function openEditor(t: Tab, id?: number) {
    setTab(t);
    if (!id) {
      setEditing(
        t === 'press'
          ? { _new: true, title: '', outlet: '', url: '', thumbnail_url: '', excerpt: '', visible: 1, sort_order: 50 }
          : t === 'posts'
            ? { _new: true, title: '', excerpt: '', body: '', cover_url: '', tags: '', published: 1 }
            : { _new: true, title: '', section: 'company', summary: '', body: '', sort_order: 50, published: 1 },
      );
      return;
    }

    if (t === 'press') {
      setEditing({ ...press.find((p) => p.id === id)! });
      return;
    }
    // Pages and posts keep their body out of the list payload, so fetch the row.
    const key = t === 'pages' ? 'page' : 'post';
    const res = await api<Record<string, Record<string, unknown>>>(`${endpoint(t)}/${id}`, { auth: true });
    setEditing({ ...res[key] });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;

    const isNew = Boolean(editing._new);
    const payload = { ...editing };
    delete payload._new;
    delete payload.id;
    delete payload.updated_at;

    try {
      if (isNew) {
        await api(endpoint(tab), { method: 'POST', auth: true, body: payload });
        toast('Created', 'success');
      } else {
        await api(`${endpoint(tab)}/${editing.id}`, { method: 'PATCH', auth: true, body: payload });
        toast('Saved', 'success');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save', 'error');
    }
  }

  async function remove(t: Tab, id: number, label: string) {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    try {
      await api(`${endpoint(t)}/${id}`, { method: 'DELETE', auth: true });
      toast('Deleted', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete', 'error');
    }
  }

  async function handleUpload(file: File, field: string) {
    setUploading(true);
    try {
      const res = await uploadImage(file);
      setEditing((prev) => (prev ? { ...prev, [field]: res.url } : prev));
      toast('Image uploaded', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  const set = (field: string, value: unknown) => setEditing((prev) => (prev ? { ...prev, [field]: value } : prev));

  if (loading && !pages.length && !posts.length && !press.length) return <Spinner />;

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Content</span>
          <h1>Pages, blog &amp; press</h1>
          <p className="small muted">
            Everything in the footer is edited here. Changes are live as soon as you save.
          </p>
        </div>
        <button className="btn primary" onClick={() => openEditor(tab)}>
          + New {tab === 'pages' ? 'page' : tab === 'posts' ? 'post' : 'press item'}
        </button>
      </div>

      <div className="filter-bar">
        <div className="pill-tabs">
          <button className={tab === 'pages' ? 'active' : ''} onClick={() => setTab('pages')}>
            Pages ({pages.length})
          </button>
          <button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>
            Blog ({posts.length})
          </button>
          <button className={tab === 'press' ? 'active' : ''} onClick={() => setTab('press')}>
            Press ({press.length})
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="panel">
        <div className="table-scroll">
          {tab === 'pages' && (
            <table className="data">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Section</th>
                  <th className="num">Order</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{page.title}</div>
                      <span className="tiny dim mono">/page/{page.slug}</span>
                    </td>
                    <td>
                      <span className="badge info">{page.section}</span>
                    </td>
                    <td className="num">{page.sort_order}</td>
                    <td>
                      <span className={`badge ${page.published ? 'ok' : 'low'}`}>
                        {page.published ? 'live' : 'hidden'}
                      </span>
                      <div className="tiny dim">{relativeTime(page.updated_at)}</div>
                    </td>
                    <td>
                      <div className="row gap-4">
                        <button className="btn ghost sm" onClick={() => openEditor('pages', page.id)}>
                          Edit
                        </button>
                        <button className="btn ghost sm" onClick={() => remove('pages', page.id, page.title)}>
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'posts' &&
            (posts.length === 0 ? (
              <Empty icon="✍️" title="No blog posts yet" hint="Write your first article to start the blog." />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Author</th>
                    <th>Published</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post) => (
                    <tr key={post.id}>
                      <td>
                        <div className="row gap-12">
                          {post.cover_url && (
                            <div className="thumb-sm">
                              <img src={mediaUrl(post.cover_url)} alt="" />
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }} className="truncate">
                              {post.title}
                            </div>
                            <span className="tiny dim mono">/blog/{post.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td className="small muted">{post.author || '—'}</td>
                      <td className="small">{date(post.published_at)}</td>
                      <td>
                        <span className={`badge ${post.published ? 'ok' : 'low'}`}>
                          {post.published ? 'live' : 'draft'}
                        </span>
                      </td>
                      <td>
                        <div className="row gap-4">
                          <button className="btn ghost sm" onClick={() => openEditor('posts', post.id)}>
                            Edit
                          </button>
                          <button className="btn ghost sm" onClick={() => remove('posts', post.id, post.title)}>
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === 'press' &&
            (press.length === 0 ? (
              <Empty
                icon="📰"
                title="No press coverage yet"
                hint="Add a news article link and a thumbnail — it appears on the site straight away."
              />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Outlet</th>
                    <th>Date</th>
                    <th>Visible</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {press.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="row gap-12">
                          <div className="thumb-sm">
                            {item.thumbnail_url ? (
                              <img src={mediaUrl(item.thumbnail_url)} alt="" />
                            ) : (
                              <span style={{ display: 'grid', placeItems: 'center', height: '100%' }}>📰</span>
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }} className="truncate">
                              {item.title}
                            </div>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tiny dim truncate"
                              style={{ display: 'block', maxWidth: 260 }}
                            >
                              {item.url}
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="small muted">{item.outlet || '—'}</td>
                      <td className="small">{date(item.published_at)}</td>
                      <td>
                        <span className={`badge ${item.visible ? 'ok' : 'low'}`}>
                          {item.visible ? 'shown' : 'hidden'}
                        </span>
                      </td>
                      <td>
                        <div className="row gap-4">
                          <button className="btn ghost sm" onClick={() => openEditor('press', item.id)}>
                            Edit
                          </button>
                          <button className="btn ghost sm" onClick={() => remove('press', item.id, item.title)}>
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </div>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setEditing(null)} role="presentation">
          <div className="modal" style={{ maxWidth: 820 }} role="dialog" aria-modal="true">
            <div className="panel-head">
              <div>
                <span className="eyebrow">{editing._new ? 'New' : 'Editing'}</span>
                <h2 style={{ fontSize: '1.15rem' }}>{String(editing.title || 'Untitled')}</h2>
              </div>
              <button className="icon-btn" onClick={() => setEditing(null)} aria-label="Close">
                ✕
              </button>
            </div>

            <form className="modal-body stack gap-16" onSubmit={save}>
              <div className="field">
                <label htmlFor="c-title">Title *</label>
                <input
                  id="c-title"
                  className="input"
                  required
                  value={String(editing.title ?? '')}
                  onChange={(e) => set('title', e.target.value)}
                />
              </div>

              {tab === 'press' ? (
                <>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="c-url">Article link *</label>
                      <input
                        id="c-url"
                        className="input"
                        required
                        placeholder="https://…"
                        value={String(editing.url ?? '')}
                        onChange={(e) => set('url', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="c-outlet">Outlet</label>
                      <input
                        id="c-outlet"
                        className="input"
                        placeholder="Prothom Alo, The Daily Star…"
                        value={String(editing.outlet ?? '')}
                        onChange={(e) => set('outlet', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="c-excerpt">Short summary</label>
                    <textarea
                      id="c-excerpt"
                      className="textarea"
                      style={{ minHeight: 64 }}
                      value={String(editing.excerpt ?? '')}
                      onChange={(e) => set('excerpt', e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label>Thumbnail</label>
                    <div className="row gap-12 wrap-row">
                      {editing.thumbnail_url ? (
                        <img
                          src={mediaUrl(String(editing.thumbnail_url))}
                          alt=""
                          style={{ width: 132, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 132,
                            height: 84,
                            display: 'grid',
                            placeItems: 'center',
                            background: 'var(--surface-inset)',
                            borderRadius: 8,
                            fontSize: '1.6rem',
                          }}
                        >
                          📰
                        </div>
                      )}
                      <div className="stack gap-8 grow" style={{ minWidth: 220 }}>
                        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
                          {uploading ? 'Uploading…' : 'Upload thumbnail'}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUpload(f, 'thumbnail_url');
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <input
                          className="input"
                          placeholder="or paste an image URL"
                          value={String(editing.thumbnail_url ?? '')}
                          onChange={(e) => set('thumbnail_url', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="row gap-16 wrap-row">
                    <label className="row gap-8 small" style={{ fontWeight: 600, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editing.visible)}
                        onChange={(e) => set('visible', e.target.checked)}
                      />
                      Show on the site
                    </label>
                    <div className="field" style={{ maxWidth: 130 }}>
                      <label htmlFor="c-sort">Sort order</label>
                      <input
                        id="c-sort"
                        className="input"
                        type="number"
                        value={Number(editing.sort_order ?? 50)}
                        onChange={(e) => set('sort_order', Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {tab === 'pages' && (
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="c-section">Footer column</label>
                        <select
                          id="c-section"
                          className="select"
                          value={String(editing.section ?? 'company')}
                          onChange={(e) => set('section', e.target.value)}
                        >
                          <option value="company">About Us</option>
                          <option value="policy">Policy</option>
                          <option value="hidden">Hidden — reachable by link only</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="c-order">Sort order</label>
                        <input
                          id="c-order"
                          className="input"
                          type="number"
                          value={Number(editing.sort_order ?? 50)}
                          onChange={(e) => set('sort_order', Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="c-sum">{tab === 'pages' ? 'Summary' : 'Excerpt'}</label>
                    <textarea
                      id="c-sum"
                      className="textarea"
                      style={{ minHeight: 64 }}
                      value={String((tab === 'pages' ? editing.summary : editing.excerpt) ?? '')}
                      onChange={(e) => set(tab === 'pages' ? 'summary' : 'excerpt', e.target.value)}
                    />
                  </div>

                  {tab === 'posts' && (
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="c-author">Author</label>
                        <input
                          id="c-author"
                          className="input"
                          value={String(editing.author ?? '')}
                          onChange={(e) => set('author', e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="c-tags">Tags</label>
                        <input
                          id="c-tags"
                          className="input"
                          placeholder="buying guide, smartwatch"
                          value={String(editing.tags ?? '')}
                          onChange={(e) => set('tags', e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>Cover image</label>
                        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
                          {uploading ? 'Uploading…' : editing.cover_url ? 'Replace cover' : 'Upload cover'}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUpload(f, 'cover_url');
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="c-body">Content</label>
                    <textarea
                      id="c-body"
                      className="textarea"
                      style={{ minHeight: 320, fontFamily: 'var(--mono)', fontSize: '0.86rem', lineHeight: 1.6 }}
                      value={String(editing.body ?? '')}
                      onChange={(e) => set('body', e.target.value)}
                    />
                    <span className="hint">{BODY_HELP}</span>
                  </div>

                  <label className="row gap-8 small" style={{ fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editing.published)}
                      onChange={(e) => set('published', e.target.checked)}
                    />
                    Published
                  </label>
                </>
              )}

              <div className="modal-foot" style={{ marginTop: 0 }}>
                <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  {editing._new ? 'Create' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
