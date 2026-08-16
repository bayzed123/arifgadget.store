import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { audit, badRequest, conflict, notFound, optionalInt, optionalString, readJson, requireString, slugify } from '../lib/http';

/**
 * Dashboard CRUD for pages, blog posts and press coverage. Mounted inside the
 * admin router, so the bearer-token guard already applies.
 */
export const adminContent = new Hono<{ Bindings: Env; Variables: Variables }>();

const SECTIONS = ['company', 'policy', 'hidden'];

/** Turns a UNIQUE violation into a message that says which field clashed. */
function rethrowUnique(err: unknown, what: string): never {
  if (/UNIQUE/i.test(err instanceof Error ? err.message : '')) conflict(`That ${what} is already taken`);
  throw err;
}

// ---------------------------------------------------------------- pages

adminContent.get('/pages', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, slug, title, section, summary, sort_order, published, updated_at FROM pages ORDER BY section, sort_order',
  ).all();
  return c.json({ pages: results ?? [] });
});

adminContent.get('/pages/:id', async (c) => {
  const page = await c.env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!page) notFound('Page not found');
  return c.json({ page });
});

adminContent.post('/pages', async (c) => {
  const body = await readJson(c);
  const title = requireString(body.title, 'title', 160);
  const slug = slugify(optionalString(body.slug, '') || title) || `page-${Date.now()}`;
  const section = SECTIONS.includes(String(body.section)) ? String(body.section) : 'company';

  try {
    const row = await c.env.DB.prepare(
      `INSERT INTO pages (slug, title, section, summary, body, sort_order, published)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(
        slug,
        title,
        section,
        optionalString(body.summary, '', 300),
        optionalString(body.body, '', 40000),
        optionalInt(body.sort_order, 50),
        body.published === false ? 0 : 1,
      )
      .first<{ id: number }>();

    await audit(c.env, c.get('admin').username, 'page.create', 'page', row!.id, title);
    return c.json({ ok: true, id: row!.id, slug }, 201);
  } catch (err) {
    rethrowUnique(err, 'page address');
  }
});

adminContent.patch('/pages/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c);

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.title !== undefined) {
    sets.push('title = ?');
    binds.push(requireString(body.title, 'title', 160));
  }
  if (body.slug !== undefined) {
    sets.push('slug = ?');
    binds.push(slugify(String(body.slug)));
  }
  if (body.section !== undefined) {
    if (!SECTIONS.includes(String(body.section))) badRequest('Invalid section');
    sets.push('section = ?');
    binds.push(String(body.section));
  }
  if (body.summary !== undefined) {
    sets.push('summary = ?');
    binds.push(optionalString(body.summary, '', 300));
  }
  if (body.body !== undefined) {
    sets.push('body = ?');
    binds.push(optionalString(body.body, '', 40000));
  }
  if (body.sort_order !== undefined) {
    sets.push('sort_order = ?');
    binds.push(optionalInt(body.sort_order, 50));
  }
  if (body.published !== undefined) {
    sets.push('published = ?');
    binds.push(body.published ? 1 : 0);
  }
  if (!sets.length) badRequest('Nothing to update');
  sets.push("updated_at = strftime('%s','now')");

  try {
    const res = await c.env.DB.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds, id)
      .run();
    if (!res.meta.changes) notFound('Page not found');
  } catch (err) {
    rethrowUnique(err, 'page address');
  }

  await audit(c.env, c.get('admin').username, 'page.update', 'page', id);
  return c.json({ ok: true });
});

adminContent.delete('/pages/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const res = await c.env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
  if (!res.meta.changes) notFound('Page not found');
  await audit(c.env, c.get('admin').username, 'page.delete', 'page', id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- blog posts

adminContent.get('/posts', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, slug, title, excerpt, cover_url, author, tags, published, published_at, updated_at
       FROM posts ORDER BY published_at DESC`,
  ).all();
  return c.json({ posts: results ?? [] });
});

adminContent.get('/posts/:id', async (c) => {
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(Number(c.req.param('id'))).first();
  if (!post) notFound('Post not found');
  return c.json({ post });
});

adminContent.post('/posts', async (c) => {
  const body = await readJson(c);
  const title = requireString(body.title, 'title', 200);
  const slug = slugify(optionalString(body.slug, '') || title) || `post-${Date.now()}`;

  try {
    const row = await c.env.DB.prepare(
      `INSERT INTO posts (slug, title, excerpt, body, cover_url, author, tags, published, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(
        slug,
        title,
        optionalString(body.excerpt, '', 400),
        optionalString(body.body, '', 60000),
        optionalString(body.cover_url, '', 500),
        optionalString(body.author, c.get('admin').name, 120),
        optionalString(body.tags, '', 200),
        body.published === false ? 0 : 1,
        optionalInt(body.published_at, Math.floor(Date.now() / 1000)),
      )
      .first<{ id: number }>();

    await audit(c.env, c.get('admin').username, 'post.create', 'post', row!.id, title);
    return c.json({ ok: true, id: row!.id, slug }, 201);
  } catch (err) {
    rethrowUnique(err, 'post address');
  }
});

adminContent.patch('/posts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c);

  const sets: string[] = [];
  const binds: unknown[] = [];
  const text = (field: string, max: number) => {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(optionalString(body[field], '', max));
    }
  };

  if (body.title !== undefined) {
    sets.push('title = ?');
    binds.push(requireString(body.title, 'title', 200));
  }
  if (body.slug !== undefined) {
    sets.push('slug = ?');
    binds.push(slugify(String(body.slug)));
  }
  text('excerpt', 400);
  text('body', 60000);
  text('cover_url', 500);
  text('author', 120);
  text('tags', 200);
  if (body.published !== undefined) {
    sets.push('published = ?');
    binds.push(body.published ? 1 : 0);
  }
  if (body.published_at !== undefined) {
    sets.push('published_at = ?');
    binds.push(optionalInt(body.published_at, Math.floor(Date.now() / 1000)));
  }
  if (!sets.length) badRequest('Nothing to update');
  sets.push("updated_at = strftime('%s','now')");

  try {
    const res = await c.env.DB.prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds, id)
      .run();
    if (!res.meta.changes) notFound('Post not found');
  } catch (err) {
    rethrowUnique(err, 'post address');
  }

  await audit(c.env, c.get('admin').username, 'post.update', 'post', id);
  return c.json({ ok: true });
});

adminContent.delete('/posts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const res = await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  if (!res.meta.changes) notFound('Post not found');
  await audit(c.env, c.get('admin').username, 'post.delete', 'post', id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- press

adminContent.get('/press', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM press ORDER BY sort_order ASC, published_at DESC',
  ).all();
  return c.json({ press: results ?? [] });
});

adminContent.post('/press', async (c) => {
  const body = await readJson(c);
  const title = requireString(body.title, 'title', 200);
  const url = requireString(body.url, 'url', 600);
  if (!/^https?:\/\//i.test(url)) badRequest('The article link must start with http:// or https://');

  const row = await c.env.DB.prepare(
    `INSERT INTO press (title, outlet, url, thumbnail_url, excerpt, published_at, visible, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      title,
      optionalString(body.outlet, '', 120),
      url,
      optionalString(body.thumbnail_url, '', 600),
      optionalString(body.excerpt, '', 400),
      optionalInt(body.published_at, Math.floor(Date.now() / 1000)),
      body.visible === false ? 0 : 1,
      optionalInt(body.sort_order, 50),
    )
    .first<{ id: number }>();

  await audit(c.env, c.get('admin').username, 'press.create', 'press', row!.id, title);
  return c.json({ ok: true, id: row!.id }, 201);
});

adminContent.patch('/press/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c);

  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const field of ['title', 'outlet', 'url', 'thumbnail_url', 'excerpt'] as const) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(optionalString(body[field], '', 600));
    }
  }
  if (body.visible !== undefined) {
    sets.push('visible = ?');
    binds.push(body.visible ? 1 : 0);
  }
  if (body.sort_order !== undefined) {
    sets.push('sort_order = ?');
    binds.push(optionalInt(body.sort_order, 50));
  }
  if (body.published_at !== undefined) {
    sets.push('published_at = ?');
    binds.push(optionalInt(body.published_at, Math.floor(Date.now() / 1000)));
  }
  if (!sets.length) badRequest('Nothing to update');

  const res = await c.env.DB.prepare(`UPDATE press SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, id)
    .run();
  if (!res.meta.changes) notFound('Press item not found');

  await audit(c.env, c.get('admin').username, 'press.update', 'press', id);
  return c.json({ ok: true });
});

adminContent.delete('/press/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const res = await c.env.DB.prepare('DELETE FROM press WHERE id = ?').bind(id).run();
  if (!res.meta.changes) notFound('Press item not found');
  await audit(c.env, c.get('admin').username, 'press.delete', 'press', id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- offer banners

const PLACEMENTS = ['popup', 'home', 'both'];

adminContent.get('/banners', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM banners ORDER BY sort_order ASC, id DESC').all();
  return c.json({ banners: results ?? [] });
});

adminContent.post('/banners', async (c) => {
  const body = await readJson(c);
  const title = requireString(body.title, 'title', 200);
  const placement = PLACEMENTS.includes(String(body.placement)) ? String(body.placement) : 'popup';

  const row = await c.env.DB.prepare(
    `INSERT INTO banners (title, subtitle, image_url, link_url, cta_label, placement, active, starts_at, ends_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      title,
      optionalString(body.subtitle, '', 300),
      optionalString(body.image_url, '', 600),
      optionalString(body.link_url, '', 600),
      optionalString(body.cta_label, 'Shop the offer', 60),
      placement,
      body.active === false ? 0 : 1,
      body.starts_at ? optionalInt(body.starts_at, 0) : null,
      body.ends_at ? optionalInt(body.ends_at, 0) : null,
      optionalInt(body.sort_order, 50),
    )
    .first<{ id: number }>();

  await audit(c.env, c.get('admin').username, 'banner.create', 'banner', row!.id, title);
  return c.json({ ok: true, id: row!.id }, 201);
});

adminContent.patch('/banners/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await readJson(c);

  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const field of ['title', 'subtitle', 'image_url', 'link_url', 'cta_label'] as const) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(optionalString(body[field], '', 600));
    }
  }
  if (body.placement !== undefined) {
    if (!PLACEMENTS.includes(String(body.placement))) badRequest('Invalid placement');
    sets.push('placement = ?');
    binds.push(String(body.placement));
  }
  if (body.active !== undefined) {
    sets.push('active = ?');
    binds.push(body.active ? 1 : 0);
  }
  if (body.sort_order !== undefined) {
    sets.push('sort_order = ?');
    binds.push(optionalInt(body.sort_order, 50));
  }
  for (const field of ['starts_at', 'ends_at'] as const) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      binds.push(body[field] ? optionalInt(body[field], 0) : null);
    }
  }
  if (!sets.length) badRequest('Nothing to update');

  const res = await c.env.DB.prepare(`UPDATE banners SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, id)
    .run();
  if (!res.meta.changes) notFound('Banner not found');

  await audit(c.env, c.get('admin').username, 'banner.update', 'banner', id);
  return c.json({ ok: true });
});

adminContent.delete('/banners/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const res = await c.env.DB.prepare('DELETE FROM banners WHERE id = ?').bind(id).run();
  if (!res.meta.changes) notFound('Banner not found');
  await audit(c.env, c.get('admin').username, 'banner.delete', 'banner', id);
  return c.json({ ok: true });
});
